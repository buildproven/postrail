/**
 * Rate Limit Status API
 *
 * Provides current rate limiting status for monitoring and debugging.
 * Shows user's current limits and system-wide statistics.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'

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

    // SECURITY: System statistics only for admins (blocked for now)
    // TODO: Implement proper admin role checking
    // const systemStats = rateLimiter.getStats()

    const headers: Record<string, string> = {}
    if (userStatus.degraded) {
      headers['X-Rate-Limit-Degraded'] = 'true'
      headers['Warning'] =
        '299 - "Rate limiting service degraded - per-instance limits only"'
    }

    return NextResponse.json(
      {
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
        // system: {  // REMOVED: Sensitive system data
        //   activeUsers: systemStats.activeUsers,
        //   pendingRequests: systemStats.pendingRequests,
        //   cachedResults: systemStats.cachedResults,
        //   timestamp: new Date(systemStats.timestamp).toISOString(),
        // },
      },
      { headers }
    )
  } catch (error) {
    console.error('Rate limit status error:', error)
    return NextResponse.json(
      { error: 'Failed to get rate limit status' },
      { status: 500 }
    )
  }
}
