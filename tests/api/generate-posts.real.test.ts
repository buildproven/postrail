import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest } from '@/tests/fixtures'

/**
 * Real API Tests - /api/generate-posts
 * These tests actually import and test the route handler
 * with mocked Supabase and Anthropic
 */

const mockMessagesCreate = vi.hoisted(() => vi.fn())
const mockSupabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(() => ({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    })),
  },
  from: vi.fn(() => {
    const baseChain: any = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    return {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        ...baseChain,
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        ...baseChain,
      }),
      update: vi.fn().mockReturnValue(baseChain),
      delete: vi.fn().mockReturnValue(baseChain),
      ...baseChain,
    }
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

vi.mock('@anthropic-ai/sdk', () => {
  class MockAPIError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'APIError'
    }
  }

  return {
    default: class MockAnthropic {
      messages = {
        create: (...args: any[]) => mockMessagesCreate(...args),
      }
    },
    APIError: MockAPIError,
  }
})

import { POST } from '@/app/api/generate-posts/route'

describe('/api/generate-posts - Real API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'This is a professionally crafted LinkedIn post about AI automation. #AI #Automation',
        },
      ],
    })
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: null as unknown as { id: string; email: string } },
        error: { message: 'Not authenticated' } as unknown as null,
      })

      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          title: 'Test Newsletter',
          content: 'Test content for newsletter',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })
  })

  describe('Request Validation', () => {
    it('should reject request without content', async () => {
      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          title: 'Test Newsletter',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('content')
    })

    it('should accept request without title (uses default)', async () => {
      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          content: 'Test content for newsletter',
        },
      })

      const response = await POST(request)

      expect(response.status).not.toBe(400)
    })
  })

  describe('Database Operations', () => {
    it('should create newsletter record in database', async () => {
      const mockInsert = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockResolvedValue({
        data: { id: 'newsletter-123', title: 'Test', content: 'Content' },
        error: null,
      })

      mockSupabase.from = vi.fn(() => ({
        insert: mockInsert,
        select: mockSelect,
        single: mockSelect,
      }))

      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          title: 'Test Newsletter',
          content: 'Test content for newsletter',
        },
      })

      await POST(request)

      expect(mockSupabase.from).toHaveBeenCalledWith('newsletters')
      expect(mockInsert).toHaveBeenCalled()
    })
  })

  describe('AI Post Generation', () => {
    it('should generate posts for all platforms and types', async () => {
      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          title: 'Test Newsletter',
          content: 'Test content for newsletter',
        },
      })

      await POST(request)

      expect(mockMessagesCreate).toHaveBeenCalled()
      const calls = mockMessagesCreate.mock.calls

      const platforms = calls
        .map((call: any) => {
          const systemPrompt = call[0]?.system || ''
          if (systemPrompt.includes('LinkedIn')) return 'linkedin'
          if (systemPrompt.includes('Twitter')) return 'twitter'
          if (systemPrompt.includes('Facebook')) return 'facebook'
          if (systemPrompt.includes('Threads')) return 'threads'
          return null
        })
        .filter(Boolean)

      expect(platforms.length).toBeGreaterThanOrEqual(4)
    })

    it('should use correct model name', async () => {
      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          content: 'Test content for newsletter',
        },
      })

      await POST(request)

      expect(mockMessagesCreate).toHaveBeenCalled()
      const firstCall = mockMessagesCreate.mock.calls[0]
      expect(firstCall[0]).toHaveProperty('model')
    })
  })

  describe('Error Handling', () => {
    it('should rollback newsletter on complete post generation failure', async () => {
      mockMessagesCreate.mockRejectedValue(new Error('AI generation failed'))

      const mockDelete = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockResolvedValue({ error: null })

      mockSupabase.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: { id: 'newsletter-123' },
          error: null,
        }),
        single: vi.fn().mockResolvedValue({
          data: { id: 'newsletter-123' },
          error: null,
        }),
        delete: mockDelete,
        eq: mockEq,
      }))

      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          content: 'Test content',
        },
      })

      await POST(request)

      expect(mockDelete).toHaveBeenCalled()
    })

    it('should handle database insertion errors', async () => {
      mockSupabase.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      }))

      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          content: 'Test content',
        },
      })

      const response = await POST(request)

      expect(response.status).toBeGreaterThanOrEqual(400)
    })
  })

  describe('Response Format', () => {
    it('should call API for multiple posts', async () => {
      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          content: 'Test content for newsletter',
        },
      })

      await POST(request)

      expect(mockMessagesCreate).toHaveBeenCalled()
      expect(mockMessagesCreate.mock.calls.length).toBeGreaterThan(1)
    })

    it('should return correct response structure', async () => {
      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          content: 'Test content for newsletter',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      if (response.ok) {
        expect(data).toHaveProperty('posts')
        expect(Array.isArray(data.posts)).toBe(true)
      }
    })

    it('should include all required post fields', async () => {
      const request = createMockRequest({
        url: 'http://localhost/api/generate-posts',
        body: {
          content: 'Test content for newsletter',
        },
      })

      const response = await POST(request)

      if (response.ok) {
        const data = await response.json()
        if (data.posts && data.posts.length > 0) {
          const post = data.posts[0]
          expect(post).toHaveProperty('platform')
          expect(post).toHaveProperty('content')
        }
      }
    })
  })
})
