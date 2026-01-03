/**
 * Rate Limit Status API
 *
 * Provides current rate limiting status for monitoring and debugging.
 * Shows user's current limits and system-wide statistics.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { checkPermission } from '@/lib/rbac'
import { logger } from '@/lib/logger'

export async function GET() {
  try {
    // Check if status endpoints are enabled (defaults disabled in production)
    const statusEndpointsEnabled =
      process.env.ENABLE_STATUS_ENDPOINTS === 'true'
    if (!statusEndpointsEnabled) {
      return NextResponse.json(
        { error: 'Status endpoints disabled' },
        { status: 404 }
      )
    }

    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // SECURITY POLICY: Users can view their own rate limit status (self-service)
    // This is intentional - similar to GitHub/Twitter APIs that show user quotas

    // Get user's current rate limit status (user's own data only)
    const userStatus = await redisRateLimiter.getUserStatus(user.id)

    // SECURITY: System statistics only for admins
    const canViewSystemStats = await checkPermission(user.id, 'viewSystemStats')
    const systemStats = canViewSystemStats
      ? await redisRateLimiter.getStats()
      : null

    const headers: Record<string, string> = {}
    if (userStatus.backend) {
      headers['X-RateLimit-Backend'] = userStatus.backend
    }
    if (userStatus.degraded) {
      headers['X-Rate-Limit-Degraded'] = 'true'
      headers['Warning'] =
        '299 - "Rate limiting service degraded - per-instance limits only"'
    }

    const response: Record<string, unknown> = {
      user: {
        id: user.id,
        requestsRemaining: userStatus.requestsRemaining,
        resetTime: new Date(userStatus.resetTime).toISOString(),
        isLimited: userStatus.isLimited,
        degraded: userStatus.degraded,
      },
      limits: {
        requestsPerMinute: 3,
        requestsPerHour: 10,
        description: 'AI generation requests',
      },
    }

    // Include system statistics for admins only
    if (systemStats) {
      response.system = {
        backend: systemStats.backend,
        activeUsers: systemStats.activeUsers,
        timestamp: new Date(systemStats.timestamp).toISOString(),
        // Include backend-specific fields only when available
        ...(systemStats.backend === 'redis' && {
          redisHealth: systemStats.redisHealth,
        }),
        ...(systemStats.backend === 'memory' && {
          memoryKeys: systemStats.memoryKeys,
        }),
      }
    }

    return NextResponse.json(response, { headers })
  } catch (error) {
    logger.error({ error }, 'Rate limit status error')
    return NextResponse.json(
      { error: 'Failed to get rate limit status' },
      { status: 500 }
    )
  }
}
