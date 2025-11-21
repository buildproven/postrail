/**
 * SSRF Protection Status API
 *
 * Provides current SSRF protection status for monitoring and debugging.
 * Shows rate limit status and protection statistics.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ssrfProtection } from '@/lib/ssrf-protection'

export async function GET(request: NextRequest) {
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

    // SECURITY POLICY: Users can view their own SSRF protection status (self-service)
    // Shows only user's own rate limit status and protection features, no system data

    // Get client IP
    const clientIP = ssrfProtection.getClientIP(request)

    // Check current rate limit status (without incrementing)
    const rateLimitCheck = await ssrfProtection.checkRateLimit(
      user.id,
      clientIP
    )

    // SECURITY: System statistics only for admins (blocked for now)
    // TODO: Implement proper admin role checking
    // const systemStats = ssrfProtection.getStats()

    return NextResponse.json({
      user: {
        id: user.id,
        canMakeRequest: rateLimitCheck.allowed,
        retryAfter: rateLimitCheck.retryAfter,
        rateLimitReason: rateLimitCheck.reason,
      },
      protection: {
        features: [
          'DNS resolution validation',
          'Private IP blocking',
          'Port filtering (80/443 only)',
          'Rate limiting per user/IP',
          'Domain blocklist',
          'Cloud metadata protection',
          'Redirect prevention',
        ],
        description:
          'Multi-layered SSRF protection with enhanced security controls',
      },
      // client: {  // REMOVED: Potential IP disclosure
      //   ip: clientIP,
      // },
      // system: {  // REMOVED: Sensitive system data
      //   activeUserLimits: systemStats.activeUserLimits,
      //   activeIPLimits: systemStats.activeIPLimits,
      //   allowedPorts: systemStats.allowedPorts,
      //   blockedDomains: systemStats.blockedDomains,
      //   rateLimits: systemStats.rateLimits,
      //   timestamp: new Date(systemStats.timestamp).toISOString(),
      // },
    })
  } catch (error) {
    console.error('SSRF status error:', error)
    return NextResponse.json(
      { error: 'Failed to get SSRF protection status' },
      { status: 500 }
    )
  }
}
