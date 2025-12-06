import { NextRequest, NextResponse } from 'next/server'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import axios from 'axios'
import { createClient } from '@/lib/supabase/server'
import { ssrfProtection } from '@/lib/ssrf-protection'

// Enhanced SSRF Protection Strategy:
// Uses comprehensive multi-layered protection via ssrfProtection module:
// 1. DNS resolution to IP addresses with enhanced private range detection
// 2. Private IP range blocking (localhost, RFC1918, cloud metadata endpoints)
// 3. Port filtering (only 80/443 allowed)
// 4. Rate limiting per user and per IP
// 5. Domain blocklist with cloud provider metadata protection
// 6. Redirect prevention (maxRedirects: 0)
// 7. Protocol restriction (HTTP/HTTPS only)

// Maximum response size (5MB)
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024

/**
 * POST /api/scrape - Extract newsletter content from URL with SSRF protection
 *
 * Uses Mozilla Readability (Firefox Reader Mode algorithm) for intelligent content extraction.
 * Implements comprehensive SSRF protection:
 * - DNS resolution to IP addresses before fetching
 * - Private IP range blocking (localhost, RFC1918, cloud metadata endpoints)
 * - Port filtering (only 80/443 allowed)
 * - Zero redirects to prevent bypass attacks
 * - Rate limiting per user and per IP
 * - Response size limits (5MB max)
 *
 * @param {NextRequest} request - Next.js request with JSON body {url}
 * @returns {Promise<NextResponse>} JSON with extracted {title, content, wordCount}
 * @throws {NextResponse} 401 - User not authenticated
 * @throws {NextResponse} 400 - Missing URL, invalid URL, or content extraction failed
 * @throws {NextResponse} 403 - SSRF protection blocked URL (private IP, invalid port, blocked domain)
 * @throws {NextResponse} 404 - Page not found
 * @throws {NextResponse} 408 - Request timeout (>10s)
 * @throws {NextResponse} 429 - Rate limit exceeded (5/min per user, 10/min per IP)
 * @throws {NextResponse} 500 - Unexpected scraping error
 *
 * @example
 * POST /api/scrape
 * { "url": "https://example.com/newsletter" }
 *
 * Response:
 * {
 *   "title": "10 Marketing Tips",
 *   "content": "Full article text with preserved paragraph structure...",
 *   "wordCount": 1234
 * }
 */
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

    // Get client IP for rate limiting
    const clientIP = ssrfProtection.getClientIP(request)

    // Rate limiting: Check if user/IP can make scraping requests
    const rateLimitResult = await ssrfProtection.checkRateLimit(
      user.id,
      clientIP
    )
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
          },
        }
      )
    }

    // Enhanced SSRF Protection: validate URL with DNS resolution, port filtering, and domain blocking
    const urlValidation = await ssrfProtection.validateUrl(url)
    if (!urlValidation.allowed) {
      try {
        const hostname = new URL(url).hostname
        console.log(
          `SSRF protection blocked request to ${hostname}: ${urlValidation.error}`
        )
      } catch {
        console.log(`SSRF protection blocked invalid URL request: ${urlValidation.error}`)
      }
      return NextResponse.json(
        {
          error: 'URL validation failed',
          details: urlValidation.error,
          suggestion:
            'Please use a public website URL with standard HTTP/HTTPS ports (80/443)',
        },
        { status: 403 }
      )
    }

    // Fetch the page with security limits
    // CRITICAL: Disable redirects to prevent SSRF bypass via 302 to private IP
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; Postrail/1.0; +https://postrail.io)',
      },
      timeout: 10000,
      maxContentLength: MAX_RESPONSE_SIZE,
      maxBodyLength: MAX_RESPONSE_SIZE,
      maxRedirects: 0, // Prevent redirect-based SSRF bypass
    })

    let html = response.data

    // Strip CSS and scripts to prevent JSDOM from hanging on complex pages
    // JSDOM tries to parse all CSS even with VirtualConsole suppression
    // This preprocessing prevents the hang entirely
    html = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags
      .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '') // Remove stylesheet links
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags

    // Use Mozilla Readability for intelligent content extraction
    // This is what Firefox Reader Mode uses
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
