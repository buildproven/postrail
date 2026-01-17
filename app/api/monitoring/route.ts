/**
 * System Monitoring and Observability API
 *
 * Provides structured logs, metrics, and health status for monitoring
 * and incident response. Includes security event tracking and alerting.
 */

import { NextRequest, NextResponse } from 'next/server'
import { observability } from '@/lib/observability'
import { requireAdmin } from '@/lib/rbac'
import {
  RedisRateLimiter,
  createRateLimitHeaders,
} from '@/lib/redis-rate-limiter'

// Rate limiting for monitoring endpoint to prevent DoS via expensive log queries
const monitoringRateLimiter = new RedisRateLimiter()

export async function GET(request: NextRequest) {
  try {
    // Check admin role using proper RBAC helpers
    const adminCheck = await requireAdmin(request)
    if (!adminCheck.authorized) {
      // Log unauthorized monitoring access attempts for security monitoring
      observability.warn('Unauthorized monitoring access attempt', {
        userId: adminCheck.userId,
        event: 'monitoring_unauthorized_access',
        metadata: {
          path: request.nextUrl?.pathname,
          errorMessage: adminCheck.error,
        },
      })

      return NextResponse.json(
        { error: adminCheck.error },
        { status: adminCheck.status }
      )
    }

    const userId = adminCheck.userId!

    // Apply rate limiting even for admin users to prevent DoS via expensive log queries
    // Admin users get higher limits than regular users, but still need protection
    const rateLimitResult = await monitoringRateLimiter.checkRateLimit(userId)
    if (!rateLimitResult.allowed) {
      observability.warn('Admin monitoring endpoint rate limited', {
        userId,
        event: 'monitoring_rate_limited',
        metadata: {
          reason: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfter,
          requestsRemaining: rateLimitResult.requestsRemaining,
        },
      })

      return NextResponse.json(
        {
          error: 'Too many monitoring requests',
          retryAfter: rateLimitResult.retryAfter,
          requestsRemaining: rateLimitResult.requestsRemaining,
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      )
    }

    const user = { id: userId }

    // Parse query parameters
    const url = new URL(request.url)
    const section = url.searchParams.get('section') || 'all'
    const since = url.searchParams.get('since')
    const rawLimit = parseInt(url.searchParams.get('limit') || '50')
    // Clamp limit to prevent memory exhaustion - max 100 entries for safety
    const limit = Math.min(Math.max(rawLimit, 1), 100)

    // Check if monitoring endpoint is enabled (admin-only functionality)
    const monitoringEnabled = process.env.ENABLE_MONITORING_ENDPOINT === 'true'
    if (!monitoringEnabled) {
      return NextResponse.json(
        {
          error:
            'Monitoring endpoint disabled. Set ENABLE_MONITORING_ENDPOINT=true to enable admin monitoring.',
        },
        { status: 403 }
      )
    }

    // Admin-only monitoring functionality (RBAC implemented above)
    const sinceTimestamp = since ? parseInt(since) : Date.now() - 60 * 60 * 1000
    const response: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      user: {
        id: user.id,
        isAdmin: true,
      },
    }

    const health = await observability.getHealthStatus()
    response.health = health

    if (section === 'all' || section === 'logs') {
      // Get logs with optional filtering
      const levelParam = url.searchParams.get('level')
      const validLevels = ['debug', 'info', 'warn', 'error', 'fatal'] as const
      const level =
        levelParam &&
        validLevels.includes(levelParam as (typeof validLevels)[number])
          ? (levelParam as (typeof validLevels)[number])
          : undefined
      const eventParam = url.searchParams.get('event')
      // Cast to EventType - invalid values will just return no results
      const event = eventParam as
        | import('@/lib/observability').EventType
        | undefined
      const requestId = url.searchParams.get('requestId') || undefined

      response.logs = observability.getLogs({
        level,
        event,
        requestId,
        since: sinceTimestamp,
        limit,
      })
    }

    if (section === 'all' || section === 'metrics') {
      // Get metrics summary
      response.metrics = observability.getMetrics({
        since: sinceTimestamp,
        window: 60 * 60 * 1000, // 1 hour window
      })
    }

    if (section === 'all' || section === 'stats') {
      // Get system statistics
      response.stats = observability.getStats()
    }

    if (section === 'all' || section === 'security') {
      // Security-specific events and metrics
      const securityEvents = observability
        .getLogs({
          since: sinceTimestamp,
          limit: Math.min(limit, 50), // Use user's bounded limit, capped at 50 for security events
        })
        .filter(
          log =>
            log.event &&
            [
              'ai_generation_rate_limited',
              'scrape_ssrf_blocked',
              'scrape_rate_limited',
              'twitter_post_duplicate',
            ].includes(log.event)
        )

      const securityMetrics = observability.getMetrics({
        since: sinceTimestamp,
      })

      response.security = {
        events: securityEvents,
        protectionCounts: {
          aiRateLimited: securityMetrics.counts.ai_generation_rate_limited || 0,
          ssrfBlocked: securityMetrics.counts.scrape_ssrf_blocked || 0,
          scrapeRateLimited: securityMetrics.counts.scrape_rate_limited || 0,
          twitterDuplicates: securityMetrics.counts.twitter_post_duplicate || 0,
        },
        summary: `${securityEvents.length} security events in the last hour`,
      }
    }

    if (section === 'alerts') {
      // Check for alert conditions
      const alerts = []

      // High error rate alert
      const errorRate = health.metrics.errorRate
      if (errorRate > 0.1) {
        alerts.push({
          severity: errorRate > 0.2 ? 'critical' : 'warning',
          type: 'high_error_rate',
          message: `Error rate is ${(errorRate * 100).toFixed(1)}%`,
          threshold: '10%',
          current: `${(errorRate * 100).toFixed(1)}%`,
        })
      }

      // Slow response time alert
      const avgResponseTime = health.metrics.averageResponseTime
      if (avgResponseTime > 3000) {
        alerts.push({
          severity: avgResponseTime > 10000 ? 'critical' : 'warning',
          type: 'slow_response_time',
          message: `Average response time is ${avgResponseTime}ms`,
          threshold: '3000ms',
          current: `${avgResponseTime}ms`,
        })
      }

      // Memory usage alert
      const stats = observability.getStats()
      const logUsage = stats.memoryUsage.logs / stats.memoryUsage.maxLogs
      if (logUsage > 0.8) {
        alerts.push({
          severity: logUsage > 0.95 ? 'critical' : 'warning',
          type: 'high_memory_usage',
          message: `Log memory usage is ${(logUsage * 100).toFixed(1)}%`,
          threshold: '80%',
          current: `${(logUsage * 100).toFixed(1)}%`,
        })
      }

      // Security alert - multiple rate limit hits
      const recentRateLimits = observability
        .getLogs({
          since: Date.now() - 10 * 60 * 1000, // Last 10 minutes
          limit: Math.min(limit * 2, 200), // Use bounded limit, allow up to 200 for rate limit analysis
        })
        .filter(log => log.event && log.event.includes('rate_limited'))

      if (recentRateLimits.length > 20) {
        alerts.push({
          severity: 'warning',
          type: 'potential_abuse',
          message: `${recentRateLimits.length} rate limit hits in 10 minutes`,
          threshold: '20 hits/10min',
          current: `${recentRateLimits.length} hits/10min`,
        })
      }

      response.alerts = {
        count: alerts.length,
        items: alerts,
      }
    }

    // Performance optimization guide
    if (section === 'optimization') {
      const metrics = observability.getMetrics({ since: sinceTimestamp })

      const recommendations = []

      // AI generation optimization
      const aiFailures = metrics.counts.ai_generation_failure || 0
      const aiSuccess = metrics.counts.ai_generation_success || 0
      const aiTotal = aiFailures + aiSuccess

      if (aiTotal > 0) {
        const aiFailureRate = aiFailures / aiTotal
        if (aiFailureRate > 0.1) {
          recommendations.push({
            area: 'AI Generation',
            issue: `${(aiFailureRate * 100).toFixed(1)}% failure rate`,
            recommendation:
              'Review Anthropic API limits, add retry logic, or implement circuit breaker',
          })
        }
      }

      // SSRF protection effectiveness
      const ssrfBlocked = metrics.counts.scrape_ssrf_blocked || 0
      const scrapeSuccess = metrics.counts.scrape_success || 0

      if (ssrfBlocked > scrapeSuccess * 0.1) {
        recommendations.push({
          area: 'SSRF Protection',
          issue: `High SSRF block rate: ${ssrfBlocked} blocked vs ${scrapeSuccess} successful`,
          recommendation:
            'Review blocked domains and consider user education about acceptable URLs',
        })
      }

      response.optimization = {
        recommendations,
        summary: `${recommendations.length} optimization opportunities identified`,
      }
    }

    return NextResponse.json(response, {
      headers: createRateLimitHeaders(rateLimitResult),
    })
  } catch (error) {
    observability.error('Monitoring endpoint error', {
      error: error as Error,
      source: 'monitoring-api',
    })

    return NextResponse.json(
      { error: 'Failed to get monitoring data' },
      { status: 500 }
    )
  }
}
