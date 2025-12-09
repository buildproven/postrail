/**
 * Real integration tests for /api/platforms/linkedin/post
 * Tests actual code execution with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/platforms/linkedin/post/route'
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
}))

// Mock global fetch for LinkedIn API
const mockFetch = vi.fn()
global.fetch = mockFetch

import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'

// Helper to create properly mocked Supabase with table-specific chains
function createLinkedInPostMockSupabase(
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
    platform: 'linkedin',
    newsletter_id: 'newsletter-123',
    status: 'publishing',
    platform_post_id: null,
    published_at: null,
    newsletters: { user_id: 'user-123' },
  }

  const defaultConnectionData = {
    is_active: true,
    oauth_token: 'encrypted:token',
    metadata: {
      accessToken: 'encrypted:access-token',
      organizations: [{ id: 12345, localizedName: 'Test Company' }],
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

describe('/api/platforms/linkedin/post - Real Integration Tests', () => {
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
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
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
        'http://localhost:3000/api/platforms/linkedin/post',
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

    it('should enforce 3000 character limit', async () => {
      const longContent = 'a'.repeat(3001)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
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
      expect(data.limit).toBe(3000)
      expect(data.current).toBe(3001)
    })

    it('should accept content at exactly 3000 characters', async () => {
      const exactContent = 'a'.repeat(3000)

      const mockSupabase = createLinkedInPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock LinkedIn API responses
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'urn:li:ugcPost:123456789' }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
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
      const mockSupabase = createLinkedInPostMockSupabase({
        postData: {
          id: 'post-123',
          platform: 'linkedin',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'different-user' },
        },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('Unauthorized')
    })

    it('should verify post is configured for LinkedIn platform', async () => {
      const mockSupabase = createLinkedInPostMockSupabase({
        postData: {
          id: 'post-123',
          platform: 'twitter', // Not LinkedIn
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not configured for LinkedIn')
    })
  })

  describe('LinkedIn Connection', () => {
    it('should require LinkedIn connection', async () => {
      const mockSupabase = createLinkedInPostMockSupabase({
        connectionData: null,
        connectionError: { message: 'Not found', code: 'PGRST116' },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not connected')
    })

    it('should require active connection', async () => {
      const mockSupabase = createLinkedInPostMockSupabase({
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
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('inactive')
    })
  })

  describe('LinkedIn Publishing', () => {
    it('should publish post and update database', async () => {
      const mockSupabase = createLinkedInPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock LinkedIn API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'urn:li:ugcPost:123456789' }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post content',
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
      const mockSupabase = createLinkedInPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock LinkedIn API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'urn:li:ugcPost:123456789' }),
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
          }),
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(decrypt).toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle LinkedIn rate limit errors', async () => {
      const mockSupabase = createLinkedInPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock LinkedIn API rate limit error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBeTruthy()
    })

    it('should handle LinkedIn authentication errors', async () => {
      const mockSupabase = createLinkedInPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      // Mock LinkedIn API auth error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      })

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test LinkedIn post',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBeTruthy()
    })
  })
})
