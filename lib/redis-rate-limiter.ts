import { logger } from '@/lib/logger'
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
import { observability } from './observability'
import { sendCriticalAlert } from './alerts'

export interface GenerationResult {
  newsletterId: string
  postsGenerated: number
  posts: Array<{
    platform: string
    postType: string
    content: string
    characterCount: number
  }>
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number
  reason?: string
  requestsRemaining: number
  resetTime: number
  degraded?: boolean
  backend?: 'redis' | 'memory'
}

export interface DedupResult {
  isDuplicate: boolean
  cachedResult?: GenerationResult
  requestId?: string
}

interface RateLimitConfig {
  requestsPerMinute: number
  requestsPerHour: number
  windowMinute: number
  windowHour: number
}

interface HealthCheckDetails {
  timestamp: string
  latency?: number
  redisConfigured?: boolean
  memoryKeys?: number
  error?: string
}

interface CachedDedupResult {
  result: GenerationResult
  timestamp: number
}

type MemoryStoreValue = number | CachedDedupResult

export class RedisRateLimiter {
  private redis: Redis | null = null
  private readonly config: RateLimitConfig
  private readonly enabled: boolean
  private degradedNotified = false

  // Circuit breaker state
  private circuitBreakerOpen = false
  private consecutiveFailures = 0
  private lastFailureTime = 0
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3 // Open circuit after 3 failures
  private readonly CIRCUIT_BREAKER_RESET_MS = 30000 // Try Redis again after 30s

  // Fallback to in-memory when Redis unavailable (development)
  private readonly memoryStore: Map<string, MemoryStoreValue> = new Map()

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
        observability.warn(
          '🚫 Rate limiting DISABLED via RATE_LIMIT_MODE=disabled'
        )
        break
      case 'memory':
        this.enabled = false
        observability.warn(
          '⚠️ Rate limiting forced to MEMORY mode (per-instance only)'
        )
        if (isProduction) {
          observability.error(
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
          observability.info(
            '🔄 Auto-detected Redis configuration, enabling distributed rate limiting'
          )
        } else {
          observability.warn(
            '⚠️ No Redis configuration found, falling back to memory-only rate limiting'
          )
          if (isProduction) {
            observability.error(
              '🔴 PRODUCTION WARNING: Set RATE_LIMIT_MODE=redis and configure Upstash for production'
            )
          }
        }
        break
    }

    // Initialize Redis if enabled (env vars already validated via hasRedisConfig)
    if (this.enabled) {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
      if (!redisUrl || !redisToken) {
        // Should never happen due to hasRedisConfig check, but satisfies TypeScript
        this.enabled = false
        observability.error('Redis config missing despite hasRedisConfig check')
      } else {
        try {
          this.redis = new Redis({ url: redisUrl, token: redisToken })
          observability.info('✅ Redis rate limiter initialized successfully')
        } catch (error) {
          observability.error('❌ Redis rate limiter failed to initialize:', {
            error: error instanceof Error ? error : new Error(String(error)),
          })
          this.enabled = false
          observability.info('🔄 Falling back to memory-only rate limiting')
          if (isProduction) {
            observability.error(
              '🔴 PRODUCTION ERROR: Redis rate limiting failed, service may be degraded'
            )
          }
        }
      }
    }
  }

  /**
   * Check rate limit for a user (distributed or in-memory)
   * Uses circuit breaker pattern to handle Redis failures gracefully
   */
  async checkRateLimit(
    userId: string,
    contentHash?: string
  ): Promise<RateLimitResult> {
    // Check if circuit breaker should be reset (half-open state)
    if (this.circuitBreakerOpen) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime
      if (timeSinceLastFailure > this.CIRCUIT_BREAKER_RESET_MS) {
        // Try Redis again (half-open state)
        observability.info('🔄 Circuit breaker: attempting Redis recovery')
        this.circuitBreakerOpen = false
      }
    }

    // Use memory fallback if circuit breaker is open
    if (this.circuitBreakerOpen) {
      return this.checkRateLimitMemory(userId, contentHash)
    }

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
      // Redis pipeline.exec() returns [error, result][] or null - extract result with proper typing
      type PipelineResult = [Error | null, string | null][] | null
      const typedResults = results as PipelineResult
      const minuteCount = parseInt(typedResults?.[0]?.[1] || '0', 10) || 0
      const hourCount = parseInt(typedResults?.[1]?.[1] || '0', 10) || 0
      const cachedResult = contentHash ? typedResults?.[2]?.[1] : null

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

      // Reset circuit breaker on success
      if (this.consecutiveFailures > 0) {
        observability.info(
          '✅ Redis rate limiter recovered, resetting circuit breaker'
        )
        this.consecutiveFailures = 0
        this.circuitBreakerOpen = false
        this.degradedNotified = false
      }

      return {
        allowed: true,
        requestsRemaining: this.config.requestsPerMinute - minuteCount - 1,
        resetTime:
          Math.floor(now / this.config.windowMinute + 1) *
          this.config.windowMinute,
        backend: 'redis',
      }
    } catch (error) {
      // Track consecutive failures for circuit breaker
      this.consecutiveFailures++
      this.lastFailureTime = Date.now()

      observability.error(
        `🔴 Redis rate limit check failed (failure ${this.consecutiveFailures}/${this.CIRCUIT_BREAKER_THRESHOLD})`,
        { error: error instanceof Error ? error : new Error(String(error)) }
      )

      // Open circuit breaker if threshold reached
      if (this.consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
        this.circuitBreakerOpen = true
        observability.fatal(
          '🔴 CIRCUIT BREAKER OPEN: Redis failures exceeded threshold, switching to memory fallback',
          {
            metadata: {
              consecutiveFailures: this.consecutiveFailures,
              error: error instanceof Error ? error.message : 'unknown',
            },
          }
        )

        // Send critical alert to monitoring systems (Slack/PagerDuty)
        sendCriticalAlert(
          'Redis Rate Limiter Circuit Breaker Opened',
          `Rate limiting has degraded to memory-only mode after ${this.consecutiveFailures} consecutive Redis failures. This means rate limits are NOT shared across server instances and can be bypassed with multiple instances.`,
          {
            consecutiveFailures: this.consecutiveFailures,
            threshold: this.CIRCUIT_BREAKER_THRESHOLD,
            error: error instanceof Error ? error.message : 'unknown',
            impact:
              'Rate limits per-instance only - production security degraded',
            action: 'Check Redis/Upstash health immediately',
          }
        ).catch(alertError => {
          // CRITICAL: Alert failures must be surfaced - operators need to know about circuit breaker
          observability.fatal(
            'CRITICAL: Alert system failure during circuit breaker',
            {
              metadata: {
                alertError:
                  alertError instanceof Error
                    ? alertError.message
                    : String(alertError),
                originalIssue: 'Redis circuit breaker opened',
                securityImpact: 'Rate limits not enforced across instances',
              },
            }
          )
          // Log to console as last resort
          logger.error(
            'ALERTING SYSTEM FAILED - manual intervention required',
            alertError
          )
        })
      }

      if (!this.degradedNotified) {
        this.degradedNotified = true
        observability.warn(
          'Rate limiter degraded - redis unavailable, using memory fallback',
          {
            metadata: {
              backend: 'redis',
              error: error instanceof Error ? error.message : 'unknown',
            },
          }
        )
      }

      // SECURITY FIX: Fall back to memory-based rate limiting instead of failing open
      // This ensures rate limits are still enforced even when Redis is unavailable
      return this.checkRateLimitMemory(userId, contentHash)
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

    const minuteValue = this.memoryStore.get(minuteKey)
    const minuteCount = typeof minuteValue === 'number' ? minuteValue : 0
    const hourValue = this.memoryStore.get(hourKey)
    const hourCount = typeof hourValue === 'number' ? hourValue : 0

    // Check deduplication
    if (contentHash) {
      const dedupKey = `dedup:${userId}:${contentHash}`
      const cached = this.memoryStore.get(dedupKey)
      if (
        cached &&
        typeof cached === 'object' &&
        'timestamp' in cached &&
        now - cached.timestamp < 10 * 60 * 1000
      ) {
        // 10 minute cache
        return {
          allowed: true,
          requestsRemaining: this.config.requestsPerMinute - minuteCount,
          resetTime:
            Math.floor(now / this.config.windowMinute + 1) *
            this.config.windowMinute,
          reason: 'cached_result',
          degraded: true, // Memory-only mode indicates degraded service
          backend: 'memory',
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
        backend: 'memory',
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
        backend: 'memory',
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
      backend: 'memory',
    }
  }

  /**
   * Store deduplication result (Redis or memory)
   */
  async storeDedupResult(
    userId: string,
    contentHash: string,
    result: GenerationResult
  ): Promise<void> {
    const dedupKey = `dedup:${userId}:${contentHash}`

    if (this.enabled && this.redis) {
      try {
        await this.redis.set(dedupKey, JSON.stringify(result), { ex: 600 }) // 10 minutes TTL
      } catch (error) {
        observability.warn('Failed to store dedup result in Redis:', {
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    } else {
      this.memoryStore.set(dedupKey, { result, timestamp: Date.now() })
    }
  }

  /**
   * Get cached deduplication result (Redis or memory)
   */
  async getCachedResult(
    userId: string,
    contentHash: string
  ): Promise<GenerationResult | null> {
    const dedupKey = `dedup:${userId}:${contentHash}`

    if (this.enabled && this.redis) {
      try {
        const cached = await this.redis.get(dedupKey)
        return cached && typeof cached === 'string' ? JSON.parse(cached) : null
      } catch (error) {
        observability.warn('Failed to get cached result from Redis:', {
          error: error instanceof Error ? error : new Error(String(error)),
        })
        return null
      }
    } else {
      const cached = this.memoryStore.get(dedupKey)
      if (
        cached &&
        typeof cached === 'object' &&
        'timestamp' in cached &&
        'result' in cached
      ) {
        if (Date.now() - cached.timestamp < 10 * 60 * 1000) {
          return cached.result
        }
      }
      return null
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
    backend?: 'redis' | 'memory'
  }> {
    const now = Date.now()
    const minuteKey = `rate_limit:${userId}:minute:${Math.floor(now / this.config.windowMinute)}`

    let minuteCount = 0

    if (this.enabled && this.redis) {
      try {
        minuteCount = (await this.redis.get(minuteKey)) || 0
      } catch (error) {
        observability.warn('Failed to get user status from Redis:', {
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    } else {
      const memoryKey = `${userId}:minute:${Math.floor(now / this.config.windowMinute)}`
      const value = this.memoryStore.get(memoryKey)
      minuteCount = typeof value === 'number' ? value : 0
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
      backend: this.enabled ? 'redis' : 'memory',
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
        observability.warn('Redis health check failed:', {
          error: error instanceof Error ? error : new Error(String(error)),
        })
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
        key.startsWith('dedup:') &&
        typeof value === 'object' &&
        'timestamp' in value &&
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
      observability.debug(
        `🧹 Cleaned up ${expiredKeys.length} expired rate limit keys`
      )
    }
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<{
    healthy: boolean
    backend: string
    details: HealthCheckDetails
  }> {
    const timestamp = new Date().toISOString()

    if (this.enabled && this.redis) {
      try {
        const start = Date.now()
        await this.redis.ping()
        const latency = Date.now() - start

        return {
          healthy: latency < 1000, // Consider unhealthy if >1s latency
          backend: 'redis',
          details: { timestamp, latency, redisConfigured: true },
        }
      } catch (error) {
        return {
          healthy: false,
          backend: 'redis',
          details: {
            timestamp,
            error: error instanceof Error ? error.message : 'Unknown error',
            redisConfigured: true,
          },
        }
      }
    } else {
      return {
        healthy: true,
        backend: 'memory',
        details: {
          timestamp,
          memoryKeys: this.memoryStore.size,
          redisConfigured: false,
        },
      }
    }
  }
}

// Export singleton instance
export const redisRateLimiter = new RedisRateLimiter()
