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

  it('falls back to memory-based rate limiting when redis pipeline errors', async () => {
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

    // SECURITY FIX: Now falls back to memory-based rate limiting instead of failing open
    // This ensures rate limits are still enforced even when Redis is unavailable
    expect(result.allowed).toBe(true) // First request is allowed
    expect(result.degraded).toBe(true) // Memory mode indicates degraded service
    expect(result.backend).toBe('memory') // Fell back to memory backend
  }, 15000)

  it('enforces rate limits even when redis fails (circuit breaker)', async () => {
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

    // Make 3 requests (rate limit is 3 per minute)
    await redisRateLimiter.checkRateLimit('user-2')
    await redisRateLimiter.checkRateLimit('user-2')
    await redisRateLimiter.checkRateLimit('user-2')

    // 4th request should be blocked by memory fallback
    const result = await redisRateLimiter.checkRateLimit('user-2')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('rate_limit_minute')
  })
})
