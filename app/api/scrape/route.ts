import { NextRequest, NextResponse } from 'next/server'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import axios from 'axios'
import { createClient } from '@/lib/supabase/server'

// SSRF Protection Strategy:
// No domain allowlist - users may have newsletters on ANY domain (custom domains, self-hosted, etc.)
// Instead, we rely on multi-layered SSRF protection:
// 1. DNS resolution to IP addresses
// 2. Private IP range blocking (localhost, 192.168.x.x, 10.x.x.x, AWS metadata, etc.)
// 3. Redirect prevention (maxRedirects: 0)
// 4. Protocol restriction (HTTP/HTTPS only)

// Maximum response size (5MB)
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024

function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (ip === '127.0.0.1' || ip === 'localhost') return true
  if (ip.startsWith('10.')) return true
  if (ip.startsWith('192.168.')) return true
  if (ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true
  if (ip.startsWith('169.254.')) return true // Link-local
  if (ip === '0.0.0.0') return true

  // IPv6 private ranges
  if (ip === '::1') return true
  if (ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true
  if (ip.startsWith('fe80:')) return true

  return false
}

async function isAllowedUrl(
  url: string
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const parsedUrl = new URL(url)

    // Reject non-HTTP(S) protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { allowed: false, error: 'Only HTTP/HTTPS URLs are allowed' }
    }

    const hostname = parsedUrl.hostname.toLowerCase()

    // DNS resolution check to prevent private IP bypass
    // This is our primary SSRF protection - blocks internal network access
    const dns = await import('dns').then(m => m.promises)
    try {
      const addresses = await dns.resolve4(hostname)
      for (const ip of addresses) {
        if (isPrivateIP(ip)) {
          return {
            allowed: false,
            error: 'Domain resolves to private IP address',
          }
        }
      }
    } catch {
      // If IPv4 fails, try IPv6
      try {
        const addresses = await dns.resolve6(hostname)
        for (const ip of addresses) {
          if (isPrivateIP(ip)) {
            return {
              allowed: false,
              error: 'Domain resolves to private IP address',
            }
          }
        }
      } catch {
        // DNS resolution failed entirely
        return { allowed: false, error: 'DNS resolution failed' }
      }
    }

    return { allowed: true }
  } catch {
    return { allowed: false, error: 'Invalid URL format' }
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check: require authenticated user
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - please sign in' },
        { status: 401 }
      )
    }

    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // SSRF Protection: validate URL with DNS resolution
    const urlCheck = await isAllowedUrl(url)
    if (!urlCheck.allowed) {
      return NextResponse.json(
        { error: urlCheck.error || 'URL not allowed' },
        { status: 403 }
      )
    }

    // Fetch the page with security limits
    // CRITICAL: Disable redirects to prevent SSRF bypass via 302 to private IP
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LetterFlow/1.0; +https://letterflow.io)',
      },
      timeout: 10000,
      maxContentLength: MAX_RESPONSE_SIZE,
      maxBodyLength: MAX_RESPONSE_SIZE,
      maxRedirects: 0, // Prevent redirect-based SSRF bypass
    })

    const html = response.data

    // Use Mozilla Readability for intelligent content extraction
    // This is what Firefox Reader Mode uses - it's excellent at finding article content
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()

    if (!article) {
      return NextResponse.json(
        {
          error:
            'Could not extract article content. This might not be an article page.',
        },
        { status: 400 }
      )
    }

    const title = article.title || ''
    let content = article.textContent || ''

    // Clean up content while preserving paragraph structure
    content = content
      .replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines to double
      .replace(/[ \t]+/g, ' ') // Normalize spaces/tabs but keep newlines
      .replace(/\n /g, '\n') // Remove leading spaces after newlines
      .trim()

    // Validate we got something useful
    if (!content || content.length < 100) {
      return NextResponse.json(
        { error: 'Could not extract meaningful content from this URL' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      title: title || 'Untitled Newsletter',
      content,
      wordCount: content.split(/\s+/).length,
    })
  } catch (error) {
    console.error('Scraping error:', error)

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        return NextResponse.json(
          { error: 'Request timeout - the URL took too long to respond' },
          { status: 408 }
        )
      }
      if (error.response?.status === 404) {
        return NextResponse.json(
          { error: 'Page not found (404)' },
          { status: 404 }
        )
      }
      if (error.response?.status === 403) {
        return NextResponse.json(
          { error: 'Access forbidden - the site may be blocking scrapers' },
          { status: 403 }
        )
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to scrape URL. Please try pasting the content manually.',
      },
      { status: 500 }
    )
  }
}
