import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/generate-posts/status/route'
import { NextRequest } from 'next/server'

const createQueryBuilder = () => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
})

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

describe('/api/generate-posts/status - Real API Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should reject unauthenticated requests', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Not authenticated', status: 401 },
    } as any)

    const request = new NextRequest(
      'http://localhost/api/generate-posts/status?jobId=job-1'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toContain('Unauthorized')
  })

  it('should forbid access to other user jobs', async () => {
    const builder = createQueryBuilder()
    builder.single = vi.fn().mockResolvedValue({
      data: {
        id: 'job-1',
        status: 'completed',
        result: { newsletterId: 'newsletter-1' },
        error_message: null,
        newsletter_id: 'newsletter-1',
        user_id: 'other-user',
      },
      error: null,
    })
    mockSupabase.from.mockReturnValueOnce(builder as any)

    const request = new NextRequest(
      'http://localhost/api/generate-posts/status?jobId=job-1'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('Forbidden')
  })

  it('should return job status for owner', async () => {
    const builder = createQueryBuilder()
    builder.single = vi.fn().mockResolvedValue({
      data: {
        id: 'job-1',
        status: 'completed',
        result: { newsletterId: 'newsletter-1' },
        error_message: null,
        newsletter_id: 'newsletter-1',
        user_id: 'test-user-id',
      },
      error: null,
    })
    mockSupabase.from.mockReturnValueOnce(builder as any)

    const request = new NextRequest(
      'http://localhost/api/generate-posts/status?jobId=job-1'
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('completed')
    expect(data.newsletterId).toBe('newsletter-1')
  })
})
