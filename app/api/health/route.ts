import { NextResponse } from 'next/server'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'

/**
 * Lightweight readiness endpoint.
 * Returns 200 when core dependencies (redis rate limiter) are ready,
 * 503 when running in degraded memory mode in production or health check fails.
 */
export async function GET() {
  const rateLimitHealth = await redisRateLimiter.healthCheck()

  const isProd = process.env.NODE_ENV === 'production'
  const isDegraded =
    rateLimitHealth.backend === 'memory' || rateLimitHealth.healthy === false

  const ready = isProd ? !isDegraded : true

  const status = ready ? 200 : 503
  return NextResponse.json(
    {
      status: ready ? 'ready' : 'degraded',
      rateLimiter: rateLimitHealth,
    },
    {
      status,
      headers: {
        'X-RateLimit-Backend': rateLimitHealth.backend,
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        ...(isDegraded && { 'X-RateLimit-Degraded': 'true' }),
      },
    }
  )
}
