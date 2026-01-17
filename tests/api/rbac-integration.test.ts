/**
 * RBAC Integration Tests
 *
 * Tests RBAC integration with API routes (rate-limit-status, ssrf-status).
 * Verifies admin-only features are properly protected.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as getRateLimitStatus } from '@/app/api/rate-limit-status/route'
import { GET as getSSRFStatus } from '@/app/api/ssrf-status/route'

// Mock dependencies
vi.mock('@/lib/supabase/server')
vi.mock('@/lib/redis-rate-limiter', () => ({
  redisRateLimiter: {
    getUserStatus: vi.fn(),
    getStats: vi.fn(),
    checkRateLimit: vi.fn().mockResolvedValue({
      allowed: true,
      requestsRemaining: 10,
      resetTime: Date.now() + 60000,
    }),
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({
    'X-RateLimit-Remaining': '10',
    'X-RateLimit-Reset': String(Date.now() + 60000),
    'X-RateLimit-Backend': 'redis',
  }),
}))
vi.mock('@/lib/ssrf-protection')
vi.mock('@/lib/rbac')

describe('RBAC Integration - API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Enable status endpoints for tests
    process.env.ENABLE_STATUS_ENDPOINTS = 'true'
  })

  describe('/api/rate-limit-status', () => {
    it('should return user status without system stats for non-admin', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { redisRateLimiter } = await import('@/lib/redis-rate-limiter')
      const { checkPermission } = await import('@/lib/rbac')

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'user-123', email: 'user@example.com' },
            },
            error: null,
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      vi.mocked(redisRateLimiter.getUserStatus).mockResolvedValue({
        requestsRemaining: 5,
        resetTime: Date.now() + 60000,
        isLimited: false,
        degraded: false,
      })

      // Non-admin user
      vi.mocked(checkPermission).mockResolvedValue(false)

      const response = await getRateLimitStatus()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user).toBeDefined()
      expect(data.user.id).toBe('user-123')
      expect(data.limits).toBeDefined()
      expect(data.system).toBeUndefined() // No system stats for non-admin
    })

    it('should return user status with system stats for admin', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { redisRateLimiter } = await import('@/lib/redis-rate-limiter')
      const { checkPermission } = await import('@/lib/rbac')

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'admin-123', email: 'admin@example.com' },
            },
            error: null,
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      vi.mocked(redisRateLimiter.getUserStatus).mockResolvedValue({
        requestsRemaining: 10,
        resetTime: Date.now() + 60000,
        isLimited: false,
        degraded: false,
      })

      vi.mocked(redisRateLimiter.getStats).mockResolvedValue({
        backend: 'redis',
        activeUsers: 50,
        redisHealth: true,
        timestamp: Date.now(),
      })

      // Admin user
      vi.mocked(checkPermission).mockResolvedValue(true)

      const response = await getRateLimitStatus()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user).toBeDefined()
      expect(data.user.id).toBe('admin-123')
      expect(data.limits).toBeDefined()
      expect(data.system).toBeDefined() // System stats for admin
      expect(data.system.backend).toBe('redis')
      expect(data.system.activeUsers).toBe(50)
      expect(data.system.redisHealth).toBe(true)
    })

    it('should return 401 for unauthenticated requests', async () => {
      const { createClient } = await import('@/lib/supabase/server')

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Not authenticated' },
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await getRateLimitStatus()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('should return 404 when status endpoints disabled', async () => {
      process.env.ENABLE_STATUS_ENDPOINTS = 'false'

      const response = await getRateLimitStatus()
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Status endpoints disabled')
    })
  })

  describe('/api/ssrf-status', () => {
    it('should return user status without system stats for non-admin', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { ssrfProtection } = await import('@/lib/ssrf-protection')
      const { checkPermission } = await import('@/lib/rbac')

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'user-123', email: 'user@example.com' },
            },
            error: null,
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      vi.mocked(ssrfProtection.getClientIP).mockReturnValue('127.0.0.1')
      vi.mocked(ssrfProtection.getRateLimitStatus).mockReturnValue({
        allowed: true,
        retryAfter: undefined,
        reason: undefined,
      })

      // Non-admin user
      vi.mocked(checkPermission).mockResolvedValue(false)

      const mockRequest = new NextRequest('http://localhost/api/ssrf-status')
      const response = await getSSRFStatus(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user).toBeDefined()
      expect(data.user.id).toBe('user-123')
      expect(data.protection).toBeDefined()
      expect(data.system).toBeUndefined() // No system stats for non-admin
    })

    it('should return user status with system stats for admin', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { ssrfProtection } = await import('@/lib/ssrf-protection')
      const { checkPermission } = await import('@/lib/rbac')

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'admin-123', email: 'admin@example.com' },
            },
            error: null,
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      vi.mocked(ssrfProtection.getClientIP).mockReturnValue('127.0.0.1')
      vi.mocked(ssrfProtection.getRateLimitStatus).mockReturnValue({
        allowed: true,
        retryAfter: undefined,
        reason: undefined,
      })

      vi.mocked(ssrfProtection.getStats).mockReturnValue({
        activeUserLimits: 30,
        activeIPLimits: 25,
        allowedPorts: [80, 443],
        blockedDomains: 1,
        rateLimits: {
          userRequestsPerMinute: 5,
          ipRequestsPerMinute: 10,
        },
        timestamp: Date.now(),
      })

      // Admin user
      vi.mocked(checkPermission).mockResolvedValue(true)

      const mockRequest = new NextRequest('http://localhost/api/ssrf-status')
      const response = await getSSRFStatus(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user).toBeDefined()
      expect(data.user.id).toBe('admin-123')
      expect(data.protection).toBeDefined()
      expect(data.system).toBeDefined() // System stats for admin
      expect(data.system.activeUserLimits).toBe(30)
      expect(data.system.activeIPLimits).toBe(25)
      expect(data.system.allowedPorts).toEqual([80, 443])
    })

    it('should return 401 for unauthenticated requests', async () => {
      const { createClient } = await import('@/lib/supabase/server')

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Not authenticated' },
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const mockRequest = new NextRequest('http://localhost/api/ssrf-status')
      const response = await getSSRFStatus(mockRequest)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('RBAC Permission Checking', () => {
    it('should verify checkPermission is called with correct parameters', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const { redisRateLimiter } = await import('@/lib/redis-rate-limiter')
      const { checkPermission } = await import('@/lib/rbac')

      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'user-123', email: 'user@example.com' },
            },
            error: null,
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      vi.mocked(redisRateLimiter.getUserStatus).mockResolvedValue({
        requestsRemaining: 5,
        resetTime: Date.now() + 60000,
        isLimited: false,
        degraded: false,
      })

      vi.mocked(checkPermission).mockResolvedValue(false)

      await getRateLimitStatus()

      expect(checkPermission).toHaveBeenCalledWith(
        'user-123',
        'viewSystemStats'
      )
    })
  })
})
