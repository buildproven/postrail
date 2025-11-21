/**
 * Redis-based Rate Limiter
 *
 * Distributed rate limiting using Redis/Upstash for serverless environments.
 * Replaces in-memory Maps and setInterval sweepers with TTL-based keys.
 *
 * Benefits:
 * - Shared state across server instances
 * - No memory leaks from setInterval timers
 * - Automatic cleanup via Redis TTL
 * - Serverless-friendly (stateless)
 */

import { Redis } from '@upstash/redis'
import { createHash } from 'crypto'

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number
  reason?: string
  requestsRemaining: number
  resetTime: number
  degraded?: boolean
}

export interface DedupResult {
  isDuplicate: boolean
  cachedResult?: any
  requestId?: string
}

interface RateLimitConfig {
  requestsPerMinute: number
  requestsPerHour: number
  windowMinute: number
  windowHour: number
}

export class RedisRateLimiter {
  private redis: Redis | null = null
  private readonly config: RateLimitConfig
  private readonly enabled: boolean

  // Fallback to in-memory when Redis unavailable (development)
  private readonly memoryStore: Map<string, any> = new Map()

  constructor() {
    this.config = {
      requestsPerMinute: 3,
      requestsPerHour: 10,
      windowMinute: 60 * 1000, // 1 minute
      windowHour: 60 * 60 * 1000, // 1 hour
    }

    // Check explicit rate limiting mode configuration
    const rateLimitMode = process.env.RATE_LIMIT_MODE?.toLowerCase() || 'auto'
    const hasRedisConfig = !!(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    )
    const isProduction = process.env.NODE_ENV === 'production'

    // Determine enabled state based on mode and configuration
    switch (rateLimitMode) {
      case 'disabled':
        this.enabled = false
        console.warn('🚫 Rate limiting DISABLED via RATE_LIMIT_MODE=disabled')
        break
      case 'memory':
        this.enabled = false
        console.warn(
          '⚠️ Rate limiting forced to MEMORY mode (per-instance only)'
        )
        if (isProduction) {
          console.error(
            '🔴 PRODUCTION WARNING: Memory-only rate limiting is not recommended for production'
          )
        }
        break
      case 'redis':
        if (!hasRedisConfig) {
          throw new Error(
            'RATE_LIMIT_MODE=redis requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN'
          )
        }
        this.enabled = true
        break
      case 'auto':
      default:
        this.enabled = hasRedisConfig
        if (this.enabled) {
          console.log(
            '🔄 Auto-detected Redis configuration, enabling distributed rate limiting'
          )
        } else {
          console.warn(
            '⚠️ No Redis configuration found, falling back to memory-only rate limiting'
          )
          if (isProduction) {
            console.error(
              '🔴 PRODUCTION WARNING: Set RATE_LIMIT_MODE=redis and configure Upstash for production'
            )
          }
        }
        break
    }

    // Initialize Redis if enabled
    if (this.enabled) {
      try {
        this.redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL!,
          token: process.env.UPSTASH_REDIS_REST_TOKEN!,
        })
        console.log('✅ Redis rate limiter initialized successfully')
      } catch (error) {
        console.error('❌ Redis rate limiter failed to initialize:', error)
        this.enabled = false
        console.log('🔄 Falling back to memory-only rate limiting')
        if (isProduction) {
          console.error(
            '🔴 PRODUCTION ERROR: Redis rate limiting failed, service may be degraded'
          )
        }
      }
    }
  }

  /**
   * Check rate limit for a user (distributed or in-memory)
   */
  async checkRateLimit(
    userId: string,
    contentHash?: string
  ): Promise<RateLimitResult> {
    if (this.enabled && this.redis) {
      return this.checkRateLimitRedis(userId, contentHash)
    } else {
      return this.checkRateLimitMemory(userId, contentHash)
    }
  }

  /**
   * Redis-based rate limiting with TTL keys
   */
  private async checkRateLimitRedis(
    userId: string,
    contentHash?: string
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const minuteKey = `rate_limit:${userId}:minute:${Math.floor(now / this.config.windowMinute)}`
    const hourKey = `rate_limit:${userId}:hour:${Math.floor(now / this.config.windowHour)}`

    try {
      // Check current counts using pipeline for efficiency
      const pipeline = this.redis!.pipeline()
      pipeline.get(minuteKey)
      pipeline.get(hourKey)

      if (contentHash) {
        const dedupKey = `dedup:${userId}:${contentHash}`
        pipeline.get(dedupKey)
      }

      const results = await pipeline.exec()
      const minuteCount = (results[0] as number) || 0
      const hourCount = (results[1] as number) || 0
      const cachedResult = contentHash ? results[2] : null

      // Check if this is a duplicate request
      if (contentHash && cachedResult) {
        return {
          allowed: true,
          requestsRemaining: this.config.requestsPerMinute - minuteCount,
          resetTime:
            Math.floor(now / this.config.windowMinute + 1) *
            this.config.windowMinute,
          reason: 'cached_result',
        }
      }

      // Check limits
      if (minuteCount >= this.config.requestsPerMinute) {
        const nextWindow =
          Math.floor(now / this.config.windowMinute + 1) *
          this.config.windowMinute
        return {
          allowed: false,
          retryAfter: Math.ceil((nextWindow - now) / 1000),
          reason: 'rate_limit_minute',
          requestsRemaining: 0,
          resetTime: nextWindow,
        }
      }

      if (hourCount >= this.config.requestsPerHour) {
        const nextWindow =
          Math.floor(now / this.config.windowHour + 1) * this.config.windowHour
        return {
          allowed: false,
          retryAfter: Math.ceil((nextWindow - now) / 1000),
          reason: 'rate_limit_hour',
          requestsRemaining: 0,
          resetTime: nextWindow,
        }
      }

      // Increment counters with TTL
      const incrementPipeline = this.redis!.pipeline()
      incrementPipeline.incr(minuteKey)
      incrementPipeline.expire(minuteKey, 60) // 1 minute TTL
      incrementPipeline.incr(hourKey)
      incrementPipeline.expire(hourKey, 3600) // 1 hour TTL

      await incrementPipeline.exec()

      return {
        allowed: true,
        requestsRemaining: this.config.requestsPerMinute - minuteCount - 1,
        resetTime:
          Math.floor(now / this.config.windowMinute + 1) *
          this.config.windowMinute,
      }
    } catch (error) {
      console.error(
        '🔴 CRITICAL: Redis rate limit check failed - service degraded:',
        error
      )
      // Return degraded service instead of completely failing open
      return {
        allowed: false, // More conservative - deny when uncertain
        retryAfter: 60,
        reason: 'rate_limit_service_degraded',
        requestsRemaining: 0,
        resetTime: now + 60000, // 1 minute retry
      }
    }
  }

  /**
   * Memory-based fallback (same interface, different storage)
   */
  private async checkRateLimitMemory(
    userId: string,
    contentHash?: string
  ): Promise<RateLimitResult> {
    const now = Date.now()
    const minuteKey = `${userId}:minute:${Math.floor(now / this.config.windowMinute)}`
    const hourKey = `${userId}:hour:${Math.floor(now / this.config.windowHour)}`

    // Clean expired keys periodically (much less frequently than before)
    if (Math.random() < 0.01) {
      // 1% chance to trigger cleanup
      this.cleanupMemoryStore()
    }

    const minuteCount = this.memoryStore.get(minuteKey) || 0
    const hourCount = this.memoryStore.get(hourKey) || 0

    // Check deduplication
    if (contentHash) {
      const dedupKey = `dedup:${userId}:${contentHash}`
      const cached = this.memoryStore.get(dedupKey)
      if (cached && now - cached.timestamp < 10 * 60 * 1000) {
        // 10 minute cache
        return {
          allowed: true,
          requestsRemaining: this.config.requestsPerMinute - minuteCount,
          resetTime:
            Math.floor(now / this.config.windowMinute + 1) *
            this.config.windowMinute,
          reason: 'cached_result',
          degraded: true, // Memory-only mode indicates degraded service
        }
      }
    }

    // Check limits
    if (minuteCount >= this.config.requestsPerMinute) {
      const nextWindow =
        Math.floor(now / this.config.windowMinute + 1) *
        this.config.windowMinute
      return {
        allowed: false,
        retryAfter: Math.ceil((nextWindow - now) / 1000),
        reason: 'rate_limit_minute',
        requestsRemaining: 0,
        resetTime: nextWindow,
        degraded: true, // Memory-only mode indicates degraded service
      }
    }

    if (hourCount >= this.config.requestsPerHour) {
      const nextWindow =
        Math.floor(now / this.config.windowHour + 1) * this.config.windowHour
      return {
        allowed: false,
        retryAfter: Math.ceil((nextWindow - now) / 1000),
        reason: 'rate_limit_hour',
        requestsRemaining: 0,
        resetTime: nextWindow,
        degraded: true, // Memory-only mode indicates degraded service
      }
    }

    // Increment counters
    this.memoryStore.set(minuteKey, minuteCount + 1)
    this.memoryStore.set(hourKey, hourCount + 1)

    return {
      allowed: true,
      requestsRemaining: this.config.requestsPerMinute - minuteCount - 1,
      resetTime:
        Math.floor(now / this.config.windowMinute + 1) *
        this.config.windowMinute,
      degraded: true, // Memory-only mode indicates degraded service
    }
  }

  /**
   * Store deduplication result (Redis or memory)
   */
  async storeDedupResult(
    userId: string,
    contentHash: string,
    result: any
  ): Promise<void> {
    const dedupKey = `dedup:${userId}:${contentHash}`

    if (this.enabled && this.redis) {
      try {
        await this.redis.set(dedupKey, JSON.stringify(result), { ex: 600 }) // 10 minutes TTL
      } catch (error) {
        console.warn('Failed to store dedup result in Redis:', error)
      }
    } else {
      this.memoryStore.set(dedupKey, { result, timestamp: Date.now() })
    }
  }

  /**
   * Generate content hash for deduplication
   */
  generateContentHash(title: string, content: string, userId: string): string {
    return createHash('sha256')
      .update(`${userId}:${title}:${content}`)
      .digest('hex')
      .substring(0, 16)
  }

  /**
   * Get user status (for API responses)
   */
  async getUserStatus(userId: string): Promise<{
    requestsRemaining: number
    resetTime: number
    isLimited: boolean
    degraded?: boolean
  }> {
    const now = Date.now()
    const minuteKey = `rate_limit:${userId}:minute:${Math.floor(now / this.config.windowMinute)}`

    let minuteCount = 0

    if (this.enabled && this.redis) {
      try {
        minuteCount = (await this.redis.get(minuteKey)) || 0
      } catch (error) {
        console.warn('Failed to get user status from Redis:', error)
      }
    } else {
      const memoryKey = `${userId}:minute:${Math.floor(now / this.config.windowMinute)}`
      minuteCount = this.memoryStore.get(memoryKey) || 0
    }

    const requestsRemaining = Math.max(
      0,
      this.config.requestsPerMinute - minuteCount
    )
    const resetTime =
      Math.floor(now / this.config.windowMinute + 1) * this.config.windowMinute

    return {
      requestsRemaining,
      resetTime,
      isLimited: requestsRemaining === 0,
      degraded: !this.enabled, // Indicate if running on degraded in-memory fallback
    }
  }

  /**
   * Get system statistics (for admin monitoring)
   */
  async getStats(): Promise<{
    backend: 'redis' | 'memory'
    activeUsers: number
    memoryKeys?: number
    redisHealth?: boolean
    timestamp: number
  }> {
    const stats = {
      backend: this.enabled ? ('redis' as const) : ('memory' as const),
      activeUsers: 0,
      timestamp: Date.now(),
    }

    if (this.enabled && this.redis) {
      try {
        // Simple health check - Redis ping
        await this.redis.ping()
        return {
          ...stats,
          redisHealth: true,
          activeUsers: 0, // Would need Redis SCAN to count, expensive
        }
      } catch (error) {
        console.warn('Redis health check failed:', error)
        return {
          ...stats,
          redisHealth: false,
        }
      }
    } else {
      return {
        ...stats,
        memoryKeys: this.memoryStore.size,
      }
    }
  }

  /**
   * Cleanup expired memory store entries (replace setInterval)
   */
  private cleanupMemoryStore(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, value] of this.memoryStore.entries()) {
      // Remove keys older than 1 hour
      if (
        key.includes(':dedup:') &&
        value.timestamp &&
        now - value.timestamp > 60 * 60 * 1000
      ) {
        expiredKeys.push(key)
      }
      // Remove rate limit keys from previous time windows
      else if (key.includes(':minute:') || key.includes(':hour:')) {
        const [, , , window] = key.split(':')
        const windowTime =
          parseInt(window) *
          (key.includes(':minute:')
            ? this.config.windowMinute
            : this.config.windowHour)
        if (
          now >
          windowTime +
            (key.includes(':minute:')
              ? this.config.windowMinute
              : this.config.windowHour)
        ) {
          expiredKeys.push(key)
        }
      }
    }

    // Remove expired keys
    expiredKeys.forEach(key => this.memoryStore.delete(key))

    if (expiredKeys.length > 0) {
      console.log(`🧹 Cleaned up ${expiredKeys.length} expired rate limit keys`)
    }
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{
    healthy: boolean
    backend: string
    details: any
  }> {
    const _details: any = { timestamp: new Date().toISOString() }

    if (this.enabled && this.redis) {
      try {
        const start = Date.now()
        await this.redis.ping()
        const latency = Date.now() - start

        return {
          healthy: latency < 1000, // Consider unhealthy if >1s latency
          backend: 'redis',
          details: { latency, redisConfigured: true },
        }
      } catch (error) {
        return {
          healthy: false,
          backend: 'redis',
          details: {
            error: error instanceof Error ? error.message : 'Unknown error',
            redisConfigured: true,
          },
        }
      }
    } else {
      return {
        healthy: true,
        backend: 'memory',
        details: { memoryKeys: this.memoryStore.size, redisConfigured: false },
      }
    }
  }
}

// Export singleton instance
export const redisRateLimiter = new RedisRateLimiter()
