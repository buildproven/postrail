/**
 * Real integration tests for /api/platforms/twitter/post
 * Tests actual code execution with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/platforms/twitter/post/route'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient, mockSupabaseAuthUser, mockSupabaseAuthError } from '../../mocks/supabase'
import { createMockTwitterClient } from '../../mocks/twitter-api'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock Twitter API
vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(),
}))

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

import { createClient } from '@/lib/supabase/server'
import { TwitterApi } from 'twitter-api-v2'
import { decrypt } from '@/lib/crypto'

describe('/api/platforms/twitter/post - Real Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Validation', () => {
    beforeEach(() => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
    })

    it('should require socialPostId and content', async () => {
      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({ content: 'Test' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('socialPostId')
    })

    it('should enforce 280 character limit', async () => {
      const longContent = 'a'.repeat(281)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: longContent,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('character limit')
      expect(data.limit).toBe(280)
      expect(data.current).toBe(281)
    })

    it('should accept content at exactly 280 characters', async () => {
      const exactContent = 'a'.repeat(280)

      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      // Mock post lookup - post belongs to user
      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      // Mock connection lookup
      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: {
          is_active: true,
          metadata: {
            apiKey: 'encrypted:key',
            apiSecret: 'encrypted:secret',
            accessToken: 'encrypted:token',
            accessTokenSecret: 'encrypted:token-secret',
          },
        },
        error: null,
      })

      // Mock Twitter client
      const mockTwitterClient = createMockTwitterClient()
      vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

      // Mock update
      mockSupabase.from('social_posts').update.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockResolvedValue({ data: null, error: null })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: exactContent,
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(200)
    })
  })

  describe('Authorization', () => {
    it('should verify post belongs to authenticated user', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      // Mock post lookup - post belongs to different user
      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'different-user' },
        },
        error: null,
      })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toContain('Unauthorized')
    })

    it('should verify post is configured for Twitter platform', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      // Mock post lookup - post is for different platform
      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'linkedin', // Not Twitter
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not configured for Twitter')
    })
  })

  describe('Twitter Connection', () => {
    it('should require Twitter connection', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      // Mock post lookup
      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      // Mock connection lookup - no connection
      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('not connected')
    })

    it('should require active connection', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      // Mock post lookup
      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      // Mock connection lookup - inactive connection
      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: {
          is_active: false,
          metadata: {},
        },
        error: null,
      })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('inactive')
    })
  })

  describe('Tweet Publishing', () => {
    it('should publish tweet and update database', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      // Mock post lookup
      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      // Mock connection lookup
      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: {
          is_active: true,
          metadata: {
            apiKey: 'encrypted:key',
            apiSecret: 'encrypted:secret',
            accessToken: 'encrypted:token',
            accessTokenSecret: 'encrypted:token-secret',
          },
        },
        error: null,
      })

      // Mock Twitter client
      const mockTwitterClient = createMockTwitterClient()
      vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

      // Mock update
      const updateSpy = vi.fn().mockReturnThis()
      mockSupabase.from('social_posts').update = updateSpy
      mockSupabase.from('social_posts').eq.mockResolvedValue({ data: null, error: null })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet content',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.tweetId).toBeTruthy()
      expect(mockTwitterClient.v2.tweet).toHaveBeenCalledWith('Test tweet content')
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'published',
          platform_post_id: expect.any(String),
        })
      )
    })

    it('should decrypt credentials before use', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: {
          is_active: true,
          metadata: {
            apiKey: 'encrypted:key',
            apiSecret: 'encrypted:secret',
            accessToken: 'encrypted:token',
            accessTokenSecret: 'encrypted:token-secret',
          },
        },
        error: null,
      })

      const mockTwitterClient = createMockTwitterClient()
      vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

      mockSupabase.from('social_posts').update.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockResolvedValue({ data: null, error: null })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

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
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: {
          is_active: true,
          metadata: {
            apiKey: 'encrypted:key',
            apiSecret: 'encrypted:secret',
            accessToken: 'encrypted:token',
            accessTokenSecret: 'encrypted:token-secret',
          },
        },
        error: null,
      })

      const mockTwitterClient = createMockTwitterClient()
      const rateLimitError: any = new Error('Rate limit exceeded')
      rateLimitError.message = 'rate limit'
      mockTwitterClient.v2.tweet.mockRejectedValue(rateLimitError)

      vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

      mockSupabase.from('social_posts').update.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockResolvedValue({ data: null, error: null })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('Rate limit')
    })

    it('should update post status to failed on error', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      mockSupabase.from('social_posts').select.mockReturnThis()
      mockSupabase.from('social_posts').eq.mockReturnThis()
      mockSupabase.from('social_posts').single.mockResolvedValue({
        data: {
          id: 'post-123',
          platform: 'twitter',
          newsletter_id: 'newsletter-123',
          newsletters: { user_id: 'user-123' },
        },
        error: null,
      })

      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: {
          is_active: true,
          metadata: {
            apiKey: 'encrypted:key',
            apiSecret: 'encrypted:secret',
            accessToken: 'encrypted:token',
            accessTokenSecret: 'encrypted:token-secret',
          },
        },
        error: null,
      })

      const mockTwitterClient = createMockTwitterClient()
      mockTwitterClient.v2.tweet.mockRejectedValue(new Error('Twitter error'))

      vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

      const updateSpy = vi.fn().mockReturnThis()
      mockSupabase.from('social_posts').update = updateSpy
      mockSupabase.from('social_posts').eq.mockResolvedValue({ data: null, error: null })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/post', {
        method: 'POST',
        body: JSON.stringify({
          socialPostId: 'post-123',
          content: 'Test tweet',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: expect.any(String),
        })
      )
    })
  })
})
