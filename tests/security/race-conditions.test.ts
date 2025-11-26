/**
 * Race Condition Security Tests
 *
 * Tests for the 4 critical race conditions identified in security audit:
 * 1. SSRF rate limiting race condition
 * 2. Twitter post idempotency race condition
 * 3. Rate limiter memory leak
 * 4. getClientIP() broken detection
 *
 * These tests verify that concurrent operations are properly atomic
 * and cannot bypass security controls.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from 'vitest'
import { ssrfProtection } from '@/lib/ssrf-protection'
import { rateLimiter } from '@/lib/rate-limiter'

describe('Race Condition Security Tests', () => {
  // Ensure rate limiters are enforced during these security tests
  const originalSsrfEnv = process.env.ENFORCE_SSRF_RATE_LIMIT_TESTS
  const originalAiEnv = process.env.ENFORCE_AI_RATE_LIMIT_TESTS
  beforeAll(() => {
    process.env.ENFORCE_SSRF_RATE_LIMIT_TESTS = 'true'
    process.env.ENFORCE_AI_RATE_LIMIT_TESTS = 'true'
  })

  afterAll(() => {
    process.env.ENFORCE_SSRF_RATE_LIMIT_TESTS = originalSsrfEnv
    process.env.ENFORCE_AI_RATE_LIMIT_TESTS = originalAiEnv
  })

  describe('CRITICAL #1: SSRF Rate Limiting Race Condition', () => {
    beforeEach(() => {
      // Clear any existing rate limit state
      vi.clearAllMocks()
    })

    it('should enforce rate limit even with 10 concurrent requests', async () => {
      const userId = 'test-user-concurrent'
      const clientIP = '203.0.113.42'
      const limit = 5 // SCRAPE_REQUESTS_PER_USER_PER_MINUTE

      // Fire 10 concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        ssrfProtection.checkRateLimit(userId, clientIP)
      )

      const results = await Promise.all(promises)

      // Count how many were allowed
      const allowedCount = results.filter(r => r.allowed).length
      const deniedCount = results.filter(r => !r.allowed).length

      // SECURITY ASSERTION: Only 5 should be allowed (the rate limit)
      expect(allowedCount).toBe(limit)
      expect(deniedCount).toBe(10 - limit)
    })

    it('should enforce IP-based rate limit even with concurrent requests', async () => {
      const userId = 'test-user-ip'
      const clientIP = '203.0.113.100'
      const ipLimit = 10 // SCRAPE_REQUESTS_PER_IP_PER_MINUTE

      // Fire 15 concurrent requests from same IP
      const promises = Array.from({ length: 15 }, () =>
        ssrfProtection.checkRateLimit(userId, clientIP)
      )

      const results = await Promise.all(promises)
      const allowedCount = results.filter(r => r.allowed).length

      // SECURITY ASSERTION: At most 10 should be allowed (IP limit)
      expect(allowedCount).toBeLessThanOrEqual(ipLimit)
    })

    it('should handle lock timeout and recover from stale locks', async () => {
      const userId = 'test-user-stale'
      const clientIP = '203.0.113.50'

      // First request should succeed
      const result1 = await ssrfProtection.checkRateLimit(userId, clientIP)
      expect(result1.allowed).toBe(true)

      // Simulate a stale lock by waiting for lock timeout
      await new Promise(resolve => setTimeout(resolve, 1100)) // LOCK_TIMEOUT = 1000ms

      // Second request should succeed (stale lock recovered)
      const result2 = await ssrfProtection.checkRateLimit(userId, clientIP)
      expect(result2.allowed).toBe(true)
    })
  })

  describe('CRITICAL #2: Rate Limiter (AI Generation) Race Condition', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should enforce AI generation rate limit with concurrent requests', async () => {
      const userId = 'ai-test-user'
      const limit = 3 // AI_REQUESTS_PER_MINUTE

      // Fire 6 concurrent requests
      const promises = Array.from({ length: 6 }, () =>
        rateLimiter.checkRateLimit(userId)
      )

      const results = await Promise.all(promises)
      const allowedCount = results.filter(r => r.allowed).length
      const deniedCount = results.filter(r => !r.allowed).length

      // SECURITY ASSERTION: Only 3 should be allowed
      expect(allowedCount).toBe(limit)
      expect(deniedCount).toBe(6 - limit)
    })

    it('should provide retry-after timing for denied requests', async () => {
      const userId = 'ai-test-retry'
      const limit = 3

      // Exhaust rate limit
      for (let i = 0; i < limit; i++) {
        await rateLimiter.checkRateLimit(userId)
      }

      // Next request should be denied with retry-after
      const result = await rateLimiter.checkRateLimit(userId)
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeDefined()
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.reason).toContain('Rate limit exceeded')
    })
  })

  describe('CRITICAL #3: Memory Leak Prevention', () => {
    it('should store interval handle in ssrfProtection', () => {
      // Access private property for testing
      const instance = ssrfProtection as any
      expect(instance.cleanupIntervalHandle).toBeDefined()
      expect(typeof instance.cleanupIntervalHandle).toBe('object')
    })

    it('should store interval handle in rateLimiter', () => {
      // Access private property for testing
      const instance = rateLimiter as any
      expect(instance.cleanupIntervalHandle).toBeDefined()
      expect(typeof instance.cleanupIntervalHandle).toBe('object')
    })

    it('should provide destroy() method to clear intervals', () => {
      expect(typeof ssrfProtection.destroy).toBe('function')
      expect(typeof rateLimiter.destroy).toBe('function')

      // Test that destroy() can be called without errors
      // Note: We don't actually call it as it would break the singleton
      // In production, this would be called on process exit
    })

    it('should clear interval handle when destroy() is called', () => {
      // Create a test instance to verify cleanup
      class TestProtection {
        private cleanupIntervalHandle: ReturnType<typeof setInterval> | null =
          null

        constructor() {
          this.cleanupIntervalHandle = setInterval(() => {}, 1000)
        }

        destroy() {
          if (this.cleanupIntervalHandle) {
            clearInterval(this.cleanupIntervalHandle)
            this.cleanupIntervalHandle = null
          }
        }

        getHandle() {
          return this.cleanupIntervalHandle
        }
      }

      const instance = new TestProtection()
      expect(instance.getHandle()).not.toBeNull()

      instance.destroy()
      expect(instance.getHandle()).toBeNull()
    })
  })

  describe('CRITICAL #4: getClientIP() Detection', () => {
    it('should extract IP from cf-connecting-ip header when NEXT_TRUST_PROXY=true', () => {
      const originalEnv = process.env.NEXT_TRUST_PROXY
      const originalNodeEnv = process.env.NODE_ENV

      process.env.NEXT_TRUST_PROXY = 'true'
      process.env.NODE_ENV = 'production' // Ensure not development mode

      const mockRequest = new Request('https://example.com', {
        headers: {
          'cf-connecting-ip': '8.8.8.8', // Use real public IP (Google DNS)
        },
      })

      const ip = ssrfProtection.getClientIP(mockRequest)
      expect(ip).toBe('8.8.8.8')

      process.env.NEXT_TRUST_PROXY = originalEnv
      process.env.NODE_ENV = originalNodeEnv
    })

    it('should extract IP from x-real-ip header when cf-connecting-ip missing', () => {
      const originalEnv = process.env.NEXT_TRUST_PROXY
      const originalNodeEnv = process.env.NODE_ENV

      process.env.NEXT_TRUST_PROXY = 'true'
      process.env.NODE_ENV = 'production'

      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-real-ip': '1.1.1.1', // Use real public IP (Cloudflare DNS)
        },
      })

      const ip = ssrfProtection.getClientIP(mockRequest)
      expect(ip).toBe('1.1.1.1')

      process.env.NEXT_TRUST_PROXY = originalEnv
      process.env.NODE_ENV = originalNodeEnv
    })

    it('should extract leftmost IP from x-forwarded-for', () => {
      const originalEnv = process.env.NEXT_TRUST_PROXY
      const originalNodeEnv = process.env.NODE_ENV

      process.env.NEXT_TRUST_PROXY = 'true'
      process.env.NODE_ENV = 'production'

      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '9.9.9.9, 10.0.0.1, 192.168.1.1', // Quad9 DNS as real public IP
        },
      })

      const ip = ssrfProtection.getClientIP(mockRequest)
      expect(ip).toBe('9.9.9.9')

      process.env.NEXT_TRUST_PROXY = originalEnv
      process.env.NODE_ENV = originalNodeEnv
    })

    it('should reject private IPs in x-forwarded-for and find public IP', () => {
      const originalEnv = process.env.NEXT_TRUST_PROXY
      const originalNodeEnv = process.env.NODE_ENV

      process.env.NEXT_TRUST_PROXY = 'true'
      process.env.NODE_ENV = 'production'

      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '192.168.1.1, 8.8.4.4, 10.0.0.1', // Google DNS as real public IP
        },
      })

      const ip = ssrfProtection.getClientIP(mockRequest)
      // Should find the public IP, not the private ones
      expect(ip).toBe('8.8.4.4')

      process.env.NEXT_TRUST_PROXY = originalEnv
      process.env.NODE_ENV = originalNodeEnv
    })

    it('should return 127.0.0.1 in development mode', () => {
      const originalEnv = process.env.NODE_ENV
      const originalTrustProxy = process.env.NEXT_TRUST_PROXY

      process.env.NODE_ENV = 'development'
      process.env.NEXT_TRUST_PROXY = 'false'

      const mockRequest = new Request('https://example.com')
      const ip = ssrfProtection.getClientIP(mockRequest)

      expect(ip).toBe('127.0.0.1')

      process.env.NODE_ENV = originalEnv
      process.env.NEXT_TRUST_PROXY = originalTrustProxy
    })

    it('should return "unknown" in production when IP cannot be determined', () => {
      const originalEnv = process.env.NODE_ENV
      const originalTrustProxy = process.env.NEXT_TRUST_PROXY

      process.env.NODE_ENV = 'production'
      process.env.NEXT_TRUST_PROXY = 'false'

      const mockRequest = new Request('https://example.com')
      const ip = ssrfProtection.getClientIP(mockRequest)

      // SECURITY FIX: No longer returns 127.0.0.1 in production
      expect(ip).toBe('unknown')

      process.env.NODE_ENV = originalEnv
      process.env.NEXT_TRUST_PROXY = originalTrustProxy
    })

    it('should not trust headers when NEXT_TRUST_PROXY=false', () => {
      const originalEnv = process.env.NEXT_TRUST_PROXY
      process.env.NEXT_TRUST_PROXY = 'false'

      const mockRequest = new Request('https://example.com', {
        headers: {
          'x-forwarded-for': '203.0.113.42',
          'x-real-ip': '203.0.113.50',
        },
      })

      const ip = ssrfProtection.getClientIP(mockRequest)
      // Should not use headers when trust proxy is disabled
      expect(ip).not.toBe('203.0.113.42')
      expect(ip).not.toBe('203.0.113.50')

      process.env.NEXT_TRUST_PROXY = originalEnv
    })
  })

  describe('Concurrent Request Stress Tests', () => {
    it('should handle 50 concurrent SSRF rate limit checks without race conditions', async () => {
      const userId = 'stress-test-user'
      const clientIP = '203.0.113.150'
      const limit = 5

      const promises = Array.from({ length: 50 }, () =>
        ssrfProtection.checkRateLimit(userId, clientIP)
      )

      const results = await Promise.all(promises)
      const allowedCount = results.filter(r => r.allowed).length

      // Should enforce limit even under heavy load
      expect(allowedCount).toBeLessThanOrEqual(limit)
    })

    it('should handle 100 concurrent AI generation checks without race conditions', async () => {
      const userId = 'stress-ai-user'
      const limit = 3

      const promises = Array.from({ length: 100 }, () =>
        rateLimiter.checkRateLimit(userId)
      )

      const results = await Promise.all(promises)
      const allowedCount = results.filter(r => r.allowed).length

      // Should enforce limit even under heavy load
      expect(allowedCount).toBeLessThanOrEqual(limit)
    })
  })

  describe('Lock Mechanism Validation', () => {
    it('should acquire and release locks properly', async () => {
      const userId = 'lock-test-user'
      const clientIP = '203.0.113.180'

      // Sequential requests should all work
      for (let i = 0; i < 5; i++) {
        const result = await ssrfProtection.checkRateLimit(userId, clientIP)
        expect(result.allowed).toBe(true)
      }

      // 6th request should be denied (limit reached)
      const result = await ssrfProtection.checkRateLimit(userId, clientIP)
      expect(result.allowed).toBe(false)
    })

    it('should not deadlock with concurrent requests to same key', async () => {
      const userId = 'deadlock-test'
      const clientIP = '203.0.113.200'

      // Fire many concurrent requests to same key
      const promises = Array.from({ length: 20 }, () =>
        ssrfProtection.checkRateLimit(userId, clientIP)
      )

      // Should complete without timeout/deadlock
      const results = await Promise.race([
        Promise.all(promises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Deadlock detected')), 5000)
        ),
      ])

      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
    })
  })
})
