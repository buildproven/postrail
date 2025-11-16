import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/scrape/route'
import { NextRequest } from 'next/server'

/**
 * SSRF Protection Tests
 * These tests verify the actual /api/scrape route handler
 * by mocking Supabase auth and DNS resolution
 */

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null
      }))
    }
  }))
}))

// Mock axios to prevent actual HTTP requests
vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({
      data: '<html><body><article>Test content</article></body></html>'
    }))
  }
}))

describe('SSRF Protection - /api/scrape', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      vi.mocked(createClient).mockReturnValueOnce({
        auth: {
          getUser: vi.fn(() => ({
            data: { user: null },
            error: new Error('Not authenticated')
          }))
        }
      } as any)

      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.beehiiv.com/p/test' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })
  })

  describe('Domain Allowlist - Strict Suffix Matching', () => {
    it('should accept exact domain match', async () => {
      // We need to mock DNS resolution for this test
      const dns = await import('dns')
      const dnsPromises = dns.promises
      vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['93.184.216.34']) // Public IP

      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://beehiiv.com/p/test' })
      })

      const response = await POST(request)

      expect(response.status).not.toBe(403)
    })

    it('should accept valid subdomain', async () => {
      const dns = await import('dns')
      const dnsPromises = dns.promises
      vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['93.184.216.34'])

      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://newsletter.beehiiv.com/p/test' })
      })

      const response = await POST(request)

      expect(response.status).not.toBe(403)
    })

    it('should reject SSRF attempt: beehiiv.com.attacker.tld', async () => {
      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://beehiiv.com.attacker.tld/p/test' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('not allowed')
    })

    it('should reject non-allowlisted domain', async () => {
      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://evil.com/p/test' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('not allowed')
    })
  })

  describe('DNS Resolution - Private IP Protection', () => {
    it('should reject domain resolving to localhost', async () => {
      const dns = await import('dns')
      const dnsPromises = dns.promises
      vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['127.0.0.1'])

      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://malicious.beehiiv.com/p/test' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('private IP')
    })

    it('should reject domain resolving to private IP (192.168.x.x)', async () => {
      const dns = await import('dns')
      const dnsPromises = dns.promises
      vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['192.168.1.1'])

      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://attacker.beehiiv.com/p/test' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('private IP')
    })

    it('should reject domain resolving to AWS metadata server', async () => {
      const dns = await import('dns')
      const dnsPromises = dns.promises
      vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['169.254.169.254'])

      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://metadata.beehiiv.com/p/test' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('private IP')
    })

    it('should reject domain resolving to 10.x.x.x range', async () => {
      const dns = await import('dns')
      const dnsPromises = dns.promises
      vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['10.0.0.1'])

      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://internal.beehiiv.com/p/test' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('private IP')
    })
  })

  describe('Protocol Validation', () => {
    it('should reject non-HTTP(S) protocols', async () => {
      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'file:///etc/passwd' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('HTTP')
    })
  })

  describe('Input Validation', () => {
    it('should reject missing URL', async () => {
      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({})
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('required')
    })

    it('should reject malformed URL', async () => {
      const request = new NextRequest('http://localhost/api/scrape', {
        method: 'POST',
        body: JSON.stringify({ url: 'not-a-valid-url' })
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBeTruthy()
    })
  })
})
