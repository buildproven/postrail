/**
 * Real integration tests for /api/platforms/twitter/post
 * Tests actual code execution with mocked dependencies
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/platforms/twitter/post/route'
import { NextRequest } from 'next/server'
import {
  createMockSupabaseClient,
  mockSupabaseAuthUser,
  mockSupabaseAuthError,
} from '../mocks/supabase'
import { createMockTwitterClient } from '../mocks/twitter-api'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Create a factory to hold the mock instance
let mockTwitterClientInstance: any = null

// Mock Twitter API
vi.mock('twitter-api-v2', () => {
  // Create a mock constructor function
  function MockTwitterApi(this: any) {
    // Return the mock instance
    if (mockTwitterClientInstance) {
      return mockTwitterClientInstance
    }
    // Fallback: return empty object with minimal structure
    return { v2: { tweet: vi.fn() } }
  }

  return {
    TwitterApi: MockTwitterApi,
  }
})

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'

// Helper to create properly mocked Supabase with table-specific chains
function createTwitterPostMockSupabase(
  overrides: {
    postData?: any
    postError?: any
    connectionData?: any
    connectionError?: any
    updateResult?: any
  } = {}
) {
  const mockSupabase = createMockSupabaseClient()

  mockSupabase.from = vi.fn((table: string) => {
    if (table === 'social_posts') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data:
            overrides.postData !== undefined
              ? overrides.postData
              : {
                  id: 'post-123',
                  platform: 'twitter',
                  newsletter_id: 'newsletter-123',
                  newsletters: { user_id: 'user-123' },
                },
          error: overrides.postError || null,
        }),
        update: vi.fn(() => ({
          eq: vi
            .fn()
            .mockResolvedValue(
              overrides.updateResult || { data: null, error: null }
            ),
        })),
      }
    }
    if (table === 'platform_connections') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data:
            overrides.connectionData !== undefined
              ? overrides.connectionData
              : {
                  is_active: true,
                  metadata: {
                    apiKey: 'encrypted:key',
                    apiSecret: 'encrypted:secret',
                    accessToken: 'encrypted:token',
                    accessTokenSecret: 'encrypted:token-secret',
                  },
                },
          error: overrides.connectionError || null,
        }),
      }
    }
    return {}
  }) as any

  return mockSupabase
}

describe('/api/platforms/twitter/post - Real Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
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
        'http://localhost:3000/api/platforms/twitter/post',
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

    it('should enforce 280 character limit', async () => {
      const longContent = 'a'.repeat(281)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
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
      expect(data.limit).toBe(280)
      expect(data.current).toBe(281)
    })

    it('should accept content at exactly 280 characters', async () => {
      const exactContent = 'a'.repeat(280)

      const mockSupabase = createTwitterPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      // Mock Twitter client
      mockTwitterClientInstance = createMockTwitterClient()

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
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
      const mockSupabase = createTwitterPostMockSupabase({
        postData: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'different-user' },
        },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('Unauthorized')
    })

    it('should verify post is configured for Twitter platform', async () => {
      const mockSupabase = createTwitterPostMockSupabase({
        postData: {
          id: 'post-123',
          platform: 'linkedin', // Not Twitter
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not configured for Twitter')
    })
  })

  describe('Twitter Connection', () => {
    it('should require Twitter connection', async () => {
      const mockSupabase = createTwitterPostMockSupabase({
        connectionData: null,
        connectionError: { message: 'Not found', code: 'PGRST116' },
      })
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not connected')
    })

    it('should require active connection', async () => {
      const mockSupabase = createTwitterPostMockSupabase({
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
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('inactive')
    })
  })

  describe('Tweet Publishing', () => {
    it('should publish tweet and update database', async () => {
      const mockSupabase = createTwitterPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      // Mock Twitter client
      mockTwitterClientInstance = createMockTwitterClient()

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet content',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.tweetId).toBeTruthy()
      expect(mockTwitterClientInstance.v2.tweet).toHaveBeenCalledWith(
        'Test tweet content'
      )
    })

    it('should decrypt credentials before use', async () => {
      const mockSupabase = createTwitterPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      mockTwitterClientInstance = createMockTwitterClient()

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
          }),
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(decrypt).toHaveBeenCalledWith('encrypted:key')
      expect(decrypt).toHaveBeenCalledWith('encrypted:secret')
      expect(decrypt).toHaveBeenCalledWith('encrypted:token')
      expect(decrypt).toHaveBeenCalledWith('encrypted:token-secret')
    })
  })

  describe('Error Handling', () => {
    it('should handle Twitter rate limit errors', async () => {
      const mockSupabase = createTwitterPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      // Mock Twitter client with rate limit error
      const mockTwitterClient = createMockTwitterClient()
      const rateLimitError: any = new Error('Rate limit exceeded')
      rateLimitError.message = 'rate limit'
      mockTwitterClient.v2.tweet.mockRejectedValue(rateLimitError)
      mockTwitterClientInstance = mockTwitterClient

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
          }),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Rate limit')
    })

    it('should update post status to failed on error', async () => {
      const mockSupabase = createTwitterPostMockSupabase()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      // Mock Twitter client with generic error
      mockTwitterClientInstance = createMockTwitterClient()
      mockTwitterClientInstance.v2.tweet.mockRejectedValue(
        new Error('Twitter error')
      )

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/post',
        {
          method: 'POST',
          body: JSON.stringify({
            socialPostId: 'post-123',
            content: 'Test tweet',
          }),
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(400)
    })
  })
})
