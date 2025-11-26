import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('redisRateLimiter - degraded redis path', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    process.env.RATE_LIMIT_MODE = 'redis'
  })

  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.RATE_LIMIT_MODE
  })

  it('fails open with degraded flag when redis pipeline errors', async () => {
    vi.doMock('@upstash/redis', () => {
      class MockPipeline {
        get = vi.fn().mockReturnThis()
        exec = vi.fn().mockRejectedValue(new Error('boom'))
      }
      class MockRedis {
        pipeline() {
          return new MockPipeline()
        }
      }
      return { Redis: MockRedis }
    })

    const { redisRateLimiter } = await import('@/lib/redis-rate-limiter')
    const result = await redisRateLimiter.checkRateLimit('user-1')

    expect(result.allowed).toBe(true)
    expect(result.degraded).toBe(true)
    expect(result.reason).toBe('rate_limit_service_degraded')
    expect(result.backend).toBe('redis')
  })
})
