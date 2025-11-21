/**
 * Real integration tests for /api/scrape endpoint
 * Tests actual code execution with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/scrape/route'
import { NextRequest } from 'next/server'
import {
  createMockSupabaseClient,
  mockSupabaseAuthUser,
  mockSupabaseAuthError,
} from '../mocks/supabase'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock axios for HTTP requests
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    isAxiosError: vi.fn(() => false),
  },
}))

// Mock dns promises
vi.mock('dns', () => ({
  promises: {
    resolve4: vi.fn(),
  },
}))

import axios from 'axios'
import { promises as dns } from 'dns'
import { createClient } from '@/lib/supabase/server'

describe('/api/scrape - Real Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })

    it('should accept authenticated requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock DNS and axios
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34'] as any)
      vi.mocked(axios.get).mockResolvedValue({
        data: `<!DOCTYPE html><html><body><article>
          <h1>Test Article Newsletter</h1>
          <p>This is test content for the newsletter article that needs to be long enough for Readability to recognize it as valid article content.</p>
          <p>Additional paragraph with more information to ensure we meet the minimum content requirements.</p>
        </article></body></html>`,
        headers: { 'content-type': 'text/html' },
      } as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/article' }),
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSupabase.auth.getUser).toHaveBeenCalled()
    })
  })

  describe('URL Validation', () => {
    beforeEach(() => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    })

    it('should reject missing URL', async () => {
      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({}),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('URL')
    })

    it('should reject invalid URL format', async () => {
      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'not-a-valid-url' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403) // SSRF protection returns 403 for invalid URLs
      expect(data.error).toBeTruthy()
    })

    it('should reject non-HTTP(S) protocols', async () => {
      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'file:///etc/passwd' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403) // SSRF protection returns 403 for non-HTTP(S) protocols
      expect(data.error).toBeTruthy()
    })
  })

  describe('SSRF Protection', () => {
    beforeEach(() => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    })

    it('should reject localhost IP', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1'] as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://malicious.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.details).toContain('private')
    })

    it('should reject private IP ranges (192.168.x.x)', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['192.168.1.1'] as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://internal.example.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.details).toContain('private')
    })

    it('should reject private IP ranges (10.x.x.x)', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['10.0.0.1'] as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://internal.corp' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.details).toContain('private')
    })

    it('should allow public IPs', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34'] as any) // example.com
      vi.mocked(axios.get).mockResolvedValue({
        data: `<!DOCTYPE html><html><body><article>
          <h1>Public IP Test Article</h1>
          <p>This content is served from a public IP address and should be allowed by SSRF protection mechanisms.</p>
          <p>The scraper should successfully extract this content because the IP is not in any private range.</p>
        </article></body></html>`,
        headers: { 'content-type': 'text/html' },
      } as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe('Content Scraping', () => {
    beforeEach(() => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34'] as any)
    })

    it('should extract content from HTML', async () => {
      // Readability needs substantial content to recognize an article
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head><title>Newsletter Title</title></head>
          <body>
            <article>
              <h1>Newsletter Title: Important Updates</h1>
              <p>This is the main content of the newsletter with important information for our subscribers.</p>
              <p>It has multiple paragraphs with substantial content that helps Readability identify it as an article.</p>
              <p>Here's another paragraph with more details about the topic we're covering in this newsletter.</p>
              <p>And finally, a conclusion paragraph that wraps up the main points and provides value to readers.</p>
            </article>
          </body>
        </html>
      `

      vi.mocked(axios.get).mockResolvedValue({
        data: htmlContent,
        headers: { 'content-type': 'text/html' },
      } as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://newsletter.com/post' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toHaveProperty('title')
      expect(data).toHaveProperty('content')
      expect(data).toHaveProperty('wordCount')
      expect(data.wordCount).toBeGreaterThan(0)
    })

    it('should handle pages with minimal structure', async () => {
      // Even pages without clear <article> tags should extract text if sufficient content exists
      vi.mocked(axios.get).mockResolvedValue({
        data: `<!DOCTYPE html><html><body>
          <div class="content">
            <h1>Simple Newsletter</h1>
            <p>This is a newsletter sent via email that doesn't have fancy article tags but still has enough content to be extracted successfully by the Mozilla Readability parser which is the same technology used in Firefox Reader Mode.</p>
            <p>Multiple paragraphs help establish that this is actual content worth extracting rather than just navigation or boilerplate text.</p>
          </div>
        </body></html>`,
        headers: { 'content-type': 'text/html' },
      } as any)

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.content).toBeTruthy()
      expect(data.content.length).toBeGreaterThan(100)
    })

    it('should handle axios errors', async () => {
      vi.mocked(axios.get).mockRejectedValue(new Error('Network error'))

      const request = new NextRequest('http://localhost:3000/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBeTruthy()
    })
  })
})
