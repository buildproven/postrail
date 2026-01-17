/**
 * User Profile Cache with Redis
 *
 * L14: Performance optimization - caches frequently-accessed user profile data
 *
 * Caches:
 * - Subscription status (tier, status, expiry dates)
 * - Feature access checks
 * - Trial quota status (total generations, daily limits)
 *
 * TTL: 5 minutes (300 seconds)
 * Invalidation:
 * - On subscription updates via Stripe webhooks
 * - L12: After trial quota increments (recordTrialGeneration)
 */

import { Redis } from '@upstash/redis'
import { logger } from '@/lib/logger'

const CACHE_TTL = 300 // 5 minutes in seconds
const CACHE_PREFIX = 'user:profile:'

interface CachedProfile {
  subscription_status: string
  subscription_tier: string
  subscription_id: string | null
  stripe_customer_id: string | null
  trial_ends_at: string | null
  subscription_current_period_end: string | null
  subscription_cancel_at_period_end: boolean | null
  cached_at: string
}

class UserProfileCache {
  private redis: Redis | null = null
  private isRedisAvailable = false

  constructor() {
    this.initializeRedis()
  }

  /**
   * Initialize Redis connection
   */
  private initializeRedis() {
    const redisUrl = process.env.UPSTASH_REDIS_REST_URL
    const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

    if (!redisUrl || !redisToken) {
      logger.warn(
        'Redis not configured for user profile cache - caching disabled'
      )
      return
    }

    try {
      this.redis = new Redis({
        url: redisUrl,
        token: redisToken,
      })
      this.isRedisAvailable = true
      logger.info('User profile cache initialized with Redis')
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Redis for profile cache')
      this.isRedisAvailable = false
    }
  }

  /**
   * Get cache key for user profile
   */
  private getCacheKey(userId: string): string {
    return `${CACHE_PREFIX}${userId}`
  }

  /**
   * Get cached user profile
   */
  async get(userId: string): Promise<CachedProfile | null> {
    if (!this.isRedisAvailable || !this.redis) {
      return null
    }

    try {
      const cached = await this.redis.get<CachedProfile>(
        this.getCacheKey(userId)
      )

      if (cached) {
        logger.debug(
          { userId, cached_at: cached.cached_at },
          'Profile cache hit'
        )
        return cached
      }

      logger.debug({ userId }, 'Profile cache miss')
      return null
    } catch (error) {
      logger.error({ error, userId }, 'Redis get error for profile cache')
      return null
    }
  }

  /**
   * Set cached user profile
   */
  async set(
    userId: string,
    profile: Omit<CachedProfile, 'cached_at'>
  ): Promise<void> {
    if (!this.isRedisAvailable || !this.redis) {
      return
    }

    try {
      const cachedProfile: CachedProfile = {
        ...profile,
        cached_at: new Date().toISOString(),
      }

      await this.redis.setex(
        this.getCacheKey(userId),
        CACHE_TTL,
        JSON.stringify(cachedProfile)
      )

      logger.debug({ userId, ttl: CACHE_TTL }, 'Profile cached in Redis')
    } catch (error) {
      logger.error({ error, userId }, 'Redis set error for profile cache')
    }
  }

  /**
   * L14: Invalidate cached profile
   * Called on:
   * - Subscription updates (Stripe webhooks)
   * - L12: Trial quota increments (recordTrialGeneration)
   */
  async invalidate(userId: string): Promise<void> {
    if (!this.isRedisAvailable || !this.redis) {
      return
    }

    try {
      await this.redis.del(this.getCacheKey(userId))
      logger.info({ userId }, 'Profile cache invalidated')
    } catch (error) {
      logger.error({ error, userId }, 'Redis del error for profile cache')
    }
  }

  /**
   * L14: Invalidate cache for multiple users (batch operation)
   */
  async invalidateBatch(userIds: string[]): Promise<void> {
    if (!this.isRedisAvailable || !this.redis) {
      return
    }

    try {
      const keys = userIds.map(id => this.getCacheKey(id))
      if (keys.length > 0) {
        await this.redis.del(...keys)
        logger.info(
          { count: userIds.length },
          'Profile cache batch invalidated'
        )
      }
    } catch (error) {
      logger.error(
        { error, count: userIds.length },
        'Redis batch del error for profile cache'
      )
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.isRedisAvailable
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    available: boolean
    totalKeys: number
    ttl: number
  }> {
    if (!this.isRedisAvailable || !this.redis) {
      return { available: false, totalKeys: 0, ttl: CACHE_TTL }
    }

    try {
      // Count keys with our prefix (approximation)
      const keys = await this.redis.keys(`${CACHE_PREFIX}*`)
      return {
        available: true,
        totalKeys: keys.length,
        ttl: CACHE_TTL,
      }
    } catch (error) {
      logger.error({ error }, 'Error getting cache stats')
      return { available: false, totalKeys: 0, ttl: CACHE_TTL }
    }
  }
}

// Singleton instance
export const userProfileCache = new UserProfileCache()

/**
 * Convenience function for cache-or-fetch pattern
 */
export async function withProfileCache<T>(
  userId: string,
  fetchFn: () => Promise<T>,
  mapToCache: (data: T) => Omit<CachedProfile, 'cached_at'>
): Promise<T> {
  // Try cache first
  const cached = await userProfileCache.get(userId)
  if (cached) {
    return cached as unknown as T
  }

  // Cache miss - fetch from database
  const data = await fetchFn()

  // Store in cache for next time
  await userProfileCache.set(userId, mapToCache(data))

  return data
}
