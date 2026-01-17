/**
 * Real integration tests for /api/platforms/facebook/post
 * Tests actual code execution with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/platforms/facebook/post/route'
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

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

// Mock rate limiter
vi.mock('@/lib/redis-rate-limiter', () => ({
  redisRateLimiter: {
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

// Mock global fetch for Facebook API
const mockFetch = vi.fn()
global.fetch = mockFetch

import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'

// Helper to create properly mocked Supabase with table-specific chains
function createFacebookPostMockSupabase(
  overrides: {
    postData?: any
    postError?: any
    connectionData?: any
    connectionError?: any
    lockSuccess?: boolean
  } = {}
) {
  const mockSupabase = createMockSupabaseClient()

  const defaultPostData = {
    id: 'post-123',
    platform: 'facebook',
    newsletter_id: 'newsletter-123',
    status: 'publishing',
    platform_post_id: null,
    published_at: null,
    newsletters: { user_id: 'user-123' },
  }

  const defaultConnectionData = {
    is_active: true,
    oauth_token: 'encrypted:token',
    platform_user_id: '123456789',
    metadata: {
      pageAccessToken: 'encrypted:page-access-token',
      pageId: '123456789',
      pageName: 'Test Business Page',
      allPages: [
        { id: '123456789', name: 'Test Business Page', category: 'Business' },
      ],
    },
  }

  mockSupabase.from = vi.fn((table: string) => {
    if (table === 'social_posts') {
      const postData =
        overrides.postData !== undefined ? overrides.postData : defaultPostData

      const chainMock = {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: overrides.lockSuccess === false ? null : postData,
          error:
            overrides.lockSuccess === false
              ? { message: 'No rows returned' }
              : overrides.postError || null,
        }),
      }
      return chainMock
    }
    if (table === 'platform_connections') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data:
            overrides.connectionData !== undefined
              ? overrides.connectionData
              : defaultConnectionData,
          error: overrides.connectionError || null,
        }),
      }
    }
    return {}
  }) as any

  return mockSupabase
}

describe('/api/platforms/facebook/post - Real Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Validation', () => {
    beforeEach(() => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    })

    it('should require socialPostId and content', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({ content: 'Test' }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('socialPostId')
    })

    it('should enforce 63206 character limit', async () => {
      const longContent = 'a'.repeat(63207)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: longContent,
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('character limit')
      expect(data.limit).toBe(63206)
      expect(data.current).toBe(63207)
    })

    it('should accept content at exactly 63206 characters', async () => {
      const exactContent = 'a'.repeat(63206)

      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123456789_987654321' }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: exactContent,
          }),
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe('Authorization', () => {
    it('should verify post belongs to authenticated user', async () => {
      const mockSupabase = createFacebookPostMockSupabase({
        postData: {
          id: 'post-123',
          platform: 'facebook',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'different-user' },
        },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('Unauthorized')
    })

    it('should verify post is configured for Facebook platform', async () => {
      const mockSupabase = createFacebookPostMockSupabase({
        postData: {
          id: 'post-123',
          platform: 'twitter', // Not Facebook
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not configured for Facebook')
    })
  })

  describe('Facebook Connection', () => {
    it('should require Facebook connection', async () => {
      const mockSupabase = createFacebookPostMockSupabase({
        connectionData: null,
        connectionError: { message: 'Not found', code: 'PGRST116' },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not connected')
    })

    it('should require active connection', async () => {
      const mockSupabase = createFacebookPostMockSupabase({
        connectionData: {
          is_active: false,
          metadata: {},
        },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('inactive')
    })
  })

  describe('Facebook Publishing', () => {
    it('should publish post and update database', async () => {
      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123456789_987654321' }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post content',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.postId).toBeTruthy()
    })

    it('should decrypt credentials before use', async () => {
      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123456789_987654321' }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(decrypt).toHaveBeenCalled()
    })

    it('should include page name in response', async () => {
      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: '123456789_987654321' }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.pageName).toBe('Test Business Page')
    })
  })

  describe('Error Handling', () => {
    it('should handle Facebook rate limit errors', async () => {
      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API rate limit error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: 32,
            message: 'Rate limit exceeded',
            type: 'OAuthException',
          },
        }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBeTruthy()
    })

    it('should handle Facebook expired token error (code 190)', async () => {
      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API auth error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: 190,
            message: 'Invalid access token',
            type: 'OAuthException',
          },
        }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Authentication')
    })

    it('should handle Facebook permission denied error (code 200)', async () => {
      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API permission error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: 200,
            message: 'Permission denied',
            type: 'OAuthException',
          },
        }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Permission')
    })

    it('should handle Facebook duplicate content error (code 368)', async () => {
      const mockSupabase = createFacebookPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock Facebook API duplicate error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: 368,
            message: 'Duplicate content',
            type: 'OAuthException',
          },
        }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test Facebook post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Duplicate')
    })
  })
})
