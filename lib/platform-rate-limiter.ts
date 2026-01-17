/**
 * Platform Rate Limit Coordinator
 *
 * VBL6: Tracks and enforces platform-specific API rate limits
 *
 * Each social media platform has different rate limits:
 * - Twitter: 300 tweets/3 hours per user, 50 tweets/day for free tier
 * - LinkedIn: 100 UGC posts/day per member, 500 API calls/day
 * - Facebook: 200 API calls/hour per user, varies by app usage level
 *
 * This module tracks usage across all users to prevent platform-level rate limit errors.
 */

import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export type Platform = 'twitter' | 'linkedin' | 'facebook'

/**
 * Platform-specific rate limit configurations
 * VBL6: Based on official platform documentation (as of 2026)
 */
export const PLATFORM_LIMITS = {
  twitter: {
    free: {
      postsPerDay: 50,
      postsPerHour: 17, // Approximate: 50/3 hours = ~17/hour
    },
    basic: {
      postsPerDay: 300,
      postsPerHour: 100,
    },
  },
  linkedin: {
    postsPerDay: 100, // Per member
    apiCallsPerDay: 500, // Total API calls per user
  },
  facebook: {
    apiCallsPerHour: 200, // Per user
    postsPerDay: 50, // Estimated safe limit
  },
} as const

export interface RateLimitCheckResult {
  allowed: boolean
  reason?: string
  remaining?: {
    daily?: number
    hourly?: number
  }
  resetTimes?: {
    daily?: string
    hourly?: string
  }
}

/**
 * VBL6: Check if user can post to a platform based on platform rate limits
 *
 * This checks against platform-imposed limits, not our application limits.
 * Uses database tracking to coordinate across all users and prevent
 * platform-level rate limit errors.
 *
 * @param userId - User ID
 * @param platform - Platform to check
 * @param tier - Account tier (twitter only: 'free' | 'basic')
 * @returns Check result with remaining quota and reset times
 */
export async function checkPlatformRateLimit(
  userId: string,
  platform: Platform,
  tier: 'free' | 'basic' = 'basic'
): Promise<RateLimitCheckResult> {
  const supabase = await createClient()

  // Get user's posting history for this platform
  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  // Count posts in last 24 hours
  const { count: dailyCount, error: dailyError } = await supabase
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('platform', platform)
    .eq('newsletters.user_id', userId)
    .eq('status', 'published')
    .gte('published_at', oneDayAgo.toISOString())

  if (dailyError) {
    logger.error({
      type: 'platform_rate_limit.check_error',
      platform,
      userId,
      error: dailyError.message,
      msg: 'Failed to check daily platform rate limit',
    })
    // Fail open - allow the request if we can't check
    return { allowed: true }
  }

  // Count posts in last hour
  const { count: hourlyCount, error: hourlyError } = await supabase
    .from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('platform', platform)
    .eq('newsletters.user_id', userId)
    .eq('status', 'published')
    .gte('published_at', oneHourAgo.toISOString())

  if (hourlyError) {
    logger.error({
      type: 'platform_rate_limit.check_error',
      platform,
      userId,
      error: hourlyError.message,
      msg: 'Failed to check hourly platform rate limit',
    })
    // Fail open - allow the request if we can't check
    return { allowed: true }
  }

  // Check platform-specific limits
  const daily = dailyCount ?? 0
  const hourly = hourlyCount ?? 0

  switch (platform) {
    case 'twitter': {
      const limits = PLATFORM_LIMITS.twitter[tier]

      if (daily >= limits.postsPerDay) {
        logger.warn({
          type: 'platform_rate_limit.exceeded',
          platform,
          userId,
          limit: 'daily',
          count: daily,
          max: limits.postsPerDay,
          tier,
          msg: 'Twitter daily post limit exceeded',
        })

        return {
          allowed: false,
          reason: `Twitter ${tier} tier allows ${limits.postsPerDay} posts per day. Limit reached.`,
          remaining: {
            daily: 0,
            hourly: Math.max(0, limits.postsPerHour - hourly),
          },
          resetTimes: {
            daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            hourly: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          },
        }
      }

      if (hourly >= limits.postsPerHour) {
        logger.warn({
          type: 'platform_rate_limit.exceeded',
          platform,
          userId,
          limit: 'hourly',
          count: hourly,
          max: limits.postsPerHour,
          tier,
          msg: 'Twitter hourly post limit exceeded',
        })

        return {
          allowed: false,
          reason: `Twitter ${tier} tier allows ${limits.postsPerHour} posts per hour. Limit reached.`,
          remaining: {
            daily: limits.postsPerDay - daily,
            hourly: 0,
          },
          resetTimes: {
            daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            hourly: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          },
        }
      }

      return {
        allowed: true,
        remaining: {
          daily: limits.postsPerDay - daily,
          hourly: limits.postsPerHour - hourly,
        },
        resetTimes: {
          daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          hourly: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        },
      }
    }

    case 'linkedin': {
      const limits = PLATFORM_LIMITS.linkedin

      if (daily >= limits.postsPerDay) {
        logger.warn({
          type: 'platform_rate_limit.exceeded',
          platform,
          userId,
          limit: 'daily',
          count: daily,
          max: limits.postsPerDay,
          msg: 'LinkedIn daily post limit exceeded',
        })

        return {
          allowed: false,
          reason: `LinkedIn allows ${limits.postsPerDay} posts per day. Limit reached.`,
          remaining: {
            daily: 0,
          },
          resetTimes: {
            daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          },
        }
      }

      return {
        allowed: true,
        remaining: {
          daily: limits.postsPerDay - daily,
        },
        resetTimes: {
          daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        },
      }
    }

    case 'facebook': {
      const limits = PLATFORM_LIMITS.facebook

      if (daily >= limits.postsPerDay) {
        logger.warn({
          type: 'platform_rate_limit.exceeded',
          platform,
          userId,
          limit: 'daily',
          count: daily,
          max: limits.postsPerDay,
          msg: 'Facebook daily post limit exceeded',
        })

        return {
          allowed: false,
          reason: `Facebook allows approximately ${limits.postsPerDay} posts per day. Limit reached.`,
          remaining: {
            daily: 0,
          },
          resetTimes: {
            daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          },
        }
      }

      if (hourly >= limits.apiCallsPerHour) {
        logger.warn({
          type: 'platform_rate_limit.exceeded',
          platform,
          userId,
          limit: 'hourly',
          count: hourly,
          max: limits.apiCallsPerHour,
          msg: 'Facebook hourly API limit exceeded',
        })

        return {
          allowed: false,
          reason: `Facebook allows ${limits.apiCallsPerHour} API calls per hour. Limit reached.`,
          remaining: {
            daily: limits.postsPerDay - daily,
            hourly: 0,
          },
          resetTimes: {
            daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            hourly: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
          },
        }
      }

      return {
        allowed: true,
        remaining: {
          daily: limits.postsPerDay - daily,
          hourly: limits.apiCallsPerHour - hourly,
        },
        resetTimes: {
          daily: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          hourly: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        },
      }
    }

    default:
      // Unknown platform - fail open
      return { allowed: true }
  }
}

/**
 * VBL6: Get remaining quota for all platforms for a user
 *
 * Useful for dashboard display and planning scheduled posts
 */
export async function getPlatformQuotas(userId: string): Promise<{
  twitter: RateLimitCheckResult
  linkedin: RateLimitCheckResult
  facebook: RateLimitCheckResult
}> {
  const [twitter, linkedin, facebook] = await Promise.all([
    checkPlatformRateLimit(userId, 'twitter'),
    checkPlatformRateLimit(userId, 'linkedin'),
    checkPlatformRateLimit(userId, 'facebook'),
  ])

  return { twitter, linkedin, facebook }
}
