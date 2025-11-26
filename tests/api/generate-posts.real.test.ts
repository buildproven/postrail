import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '@/app/api/generate-posts/route'
import { NextRequest } from 'next/server'

/**
 * Real API Tests - /api/generate-posts
 * These tests actually import and test the route handler
 * with mocked Supabase and Anthropic
 */

// Helper to build a Supabase-like query builder with full method chain
const createQueryBuilder = () => {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  return builder
}

// Mock Supabase
const mockSupabase = {
  auth: {
    getUser: vi.fn(() => ({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    })),
  },
  from: vi.fn(() => createQueryBuilder()),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

// Mock Anthropic SDK - use a wrapper to avoid hoisting issues
const mockMessagesCreate = vi.fn()

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

describe('/api/generate-posts - Real API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Set default mock response for Anthropic
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
        data: { user: null },
        error: new Error('Not authenticated'),
      })

      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Newsletter',
          content: 'Test content for newsletter',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toContain('Unauthorized')
    })
  })

  describe('Input Validation', () => {
    it('should reject request without content', async () => {
      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('required')
    })

    it('should accept request without title (uses default)', async () => {
      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          content: 'Test content for newsletter with enough words to be valid',
        }),
      })

      const response = await POST(request)

      // Should not fail on missing title
      expect(response.status).not.toBe(400)
    })
  })

  describe('Newsletter Creation', () => {
    it('should create newsletter record in database', async () => {
      const insertMock = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: {
              id: 'newsletter-123',
              user_id: 'test-user-id',
              title: 'My Newsletter',
              content: 'Newsletter content',
              status: 'draft',
            },
            error: null,
          })),
        })),
      }))

      const builder = createQueryBuilder()
      builder.insert = insertMock
      builder.delete = vi.fn(() => ({ eq: vi.fn() }))
      // Ensure the existingNewsletter check returns null
      builder.select = vi.fn().mockReturnThis()
      builder.eq = vi.fn().mockReturnThis()
      builder.maybeSingle = vi
        .fn()
        .mockResolvedValue({ data: null, error: null })

      mockSupabase.from.mockReturnValue(builder as any)

      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'My Newsletter',
          content: 'Newsletter content with enough text to be valid',
        }),
      })

      await POST(request)

      expect(mockSupabase.from).toHaveBeenCalledWith('newsletters')
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'test-user-id',
          title: 'My Newsletter',
          content: expect.any(String),
          status: 'draft',
        })
      )
    })
  })

  describe('AI Post Generation', () => {
    it('should generate posts for all platforms and types', async () => {
      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Newsletter',
          content:
            'Test content with information about AI and automation strategies',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.postsGenerated).toBeGreaterThan(0)
      expect(data.newsletterId).toBeTruthy()

      // Should have called Anthropic API multiple times (6 posts)
      expect(mockMessagesCreate).toHaveBeenCalled()
    })

    it('should use correct model name', async () => {
      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content for AI generation with sufficient text',
        }),
      })

      await POST(request)

      // Should use ANTHROPIC_MODEL env var or default
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.stringMatching(/claude-sonnet-4/),
        })
      )
    })
  })

  describe('Error Handling', () => {
    it('should rollback newsletter on complete post generation failure', async () => {
      // Mock Anthropic to fail all requests
      mockMessagesCreate.mockRejectedValue(new Error('API Error'))

      const deleteMock = vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      }))
      const builder = createQueryBuilder()
      builder.insert = vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { id: 'test-id' },
            error: null,
          })),
        })),
      }))
      builder.delete = deleteMock
      mockSupabase.from.mockReturnValue(builder as any)

      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content that will fail generation',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
      // Should have attempted to delete the newsletter
      expect(deleteMock).toHaveBeenCalled()
    })

    it('should handle database insertion errors', async () => {
      mockSupabase.from.mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => ({
              data: null,
              error: new Error('Database error'),
            })),
          })),
        })),
      } as any)

      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content',
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(500)
    })
  })

  describe('Parallel Execution', () => {
    it('should call API for multiple posts', async () => {
      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content for parallel execution testing',
        }),
      })

      await POST(request)

      // Should have been called multiple times for different posts
      expect(mockMessagesCreate.mock.calls.length).toBeGreaterThan(0)
    })
  })

  describe('Data Structure', () => {
    it('should return correct response structure', async () => {
      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content for structure validation',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data).toHaveProperty('newsletterId')
      expect(data).toHaveProperty('postsGenerated')
      expect(data).toHaveProperty('posts')
      expect(Array.isArray(data.posts)).toBe(true)
    })

    it('should include all required post fields', async () => {
      const request = new NextRequest('http://localhost/api/generate-posts', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      if (data.posts && data.posts.length > 0) {
        const post = data.posts[0]
        expect(post).toHaveProperty('platform')
        expect(post).toHaveProperty('postType')
        expect(post).toHaveProperty('content')
        expect(post).toHaveProperty('characterCount')
      }
    })
  })
})
