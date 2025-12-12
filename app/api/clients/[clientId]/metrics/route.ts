import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  authenticateService,
  hasPermission,
  canAccessClient,
} from '@/lib/service-auth'

export const runtime = 'nodejs'

interface MetricsParams {
  params: Promise<{ clientId: string }>
}

interface PlatformMetrics {
  posts: number
  published: number
  scheduled: number
  draft: number
  failed: number
  impressions: number
  engagements: number
  clicks: number
}

interface MetricsResponse {
  clientId: string
  clientName: string
  period: {
    from: string
    to: string
  }
  summary: {
    postsTotal: number
    postsPublished: number
    postsScheduled: number
    postsDraft: number
    postsFailed: number
    totalImpressions: number
    totalEngagements: number
    totalClicks: number
    engagementRate: number
    topPlatform: string | null
  }
  byPlatform: Record<string, PlatformMetrics>
  trends: {
    impressionsTrend: string
    engagementTrend: string
    publishingVelocity: number // posts per week
  }
}

/**
 * GET /api/clients/[clientId]/metrics
 *
 * Get aggregated metrics for a Growth Autopilot client.
 * Requires service authentication.
 *
 * Query params:
 * - from: ISO date (default: 30 days ago)
 * - to: ISO date (default: now)
 */
export async function GET(
  request: NextRequest,
  { params }: MetricsParams
): Promise<NextResponse> {
  try {
    const { clientId } = await params

    // Authenticate service
    const serviceContext = await authenticateService(request)

    if (!serviceContext) {
      return NextResponse.json(
        { error: 'Unauthorized. Valid service API key required.' },
        { status: 401 }
      )
    }

    // Check permission
    if (!hasPermission(serviceContext, 'read_metrics')) {
      return NextResponse.json(
        { error: 'Forbidden. Missing read_metrics permission.' },
        { status: 403 }
      )
    }

    // Check client access
    if (!canAccessClient(serviceContext, clientId)) {
      return NextResponse.json(
        { error: 'Forbidden. Cannot access this client.' },
        { status: 403 }
      )
    }

    // Parse date range
    const url = new URL(request.url)
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')

    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const fromDate = fromParam ? new Date(fromParam) : defaultFrom
    const toDate = toParam ? new Date(toParam) : now

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use ISO 8601.' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from('growth_autopilot_clients')
      .select('id, client_name')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get posts for the period
    const { data: posts, error: postsError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('client_id', clientId)
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())

    if (postsError) {
      console.error('Metrics query error:', postsError)
      return NextResponse.json(
        { error: 'Failed to fetch metrics' },
        { status: 500 }
      )
    }

    const allPosts = posts || []

    // Calculate metrics by platform
    const platforms = ['linkedin', 'threads', 'facebook', 'x']
    const byPlatform: Record<string, PlatformMetrics> = {}

    for (const platform of platforms) {
      const platformPosts = allPosts.filter(p => p.platform === platform)
      const metrics: PlatformMetrics = {
        posts: platformPosts.length,
        published: platformPosts.filter(p => p.status === 'published').length,
        scheduled: platformPosts.filter(p => p.status === 'scheduled').length,
        draft: platformPosts.filter(p => p.status === 'draft').length,
        failed: platformPosts.filter(p => p.status === 'failed').length,
        impressions: platformPosts.reduce(
          (sum, p) => sum + (p.impressions || 0),
          0
        ),
        engagements: platformPosts.reduce(
          (sum, p) => sum + (p.engagements || 0),
          0
        ),
        clicks: platformPosts.reduce((sum, p) => sum + (p.clicks || 0), 0),
      }
      Object.assign(byPlatform, { [platform]: metrics })
    }

    // Calculate summary
    const totalPosts = allPosts.length
    const published = allPosts.filter(p => p.status === 'published').length
    const scheduled = allPosts.filter(p => p.status === 'scheduled').length
    const draft = allPosts.filter(p => p.status === 'draft').length
    const failed = allPosts.filter(p => p.status === 'failed').length
    const totalImpressions = allPosts.reduce(
      (sum, p) => sum + (p.impressions || 0),
      0
    )
    const totalEngagements = allPosts.reduce(
      (sum, p) => sum + (p.engagements || 0),
      0
    )
    const totalClicks = allPosts.reduce((sum, p) => sum + (p.clicks || 0), 0)
    const engagementRate =
      totalImpressions > 0
        ? Math.round((totalEngagements / totalImpressions) * 10000) / 100
        : 0

    // Find top platform by impressions
    let topPlatform: string | null = null
    let maxImpressions = 0
    for (const [platform, metrics] of Object.entries(byPlatform)) {
      if (metrics.impressions > maxImpressions) {
        maxImpressions = metrics.impressions
        topPlatform = platform
      }
    }

    // Calculate trends (compare first half vs second half of period)
    const midpoint = new Date(
      (fromDate.getTime() + toDate.getTime()) / 2
    ).toISOString()
    const firstHalf = allPosts.filter(p => p.created_at < midpoint)
    const secondHalf = allPosts.filter(p => p.created_at >= midpoint)

    const firstHalfImpressions = firstHalf.reduce(
      (sum, p) => sum + (p.impressions || 0),
      0
    )
    const secondHalfImpressions = secondHalf.reduce(
      (sum, p) => sum + (p.impressions || 0),
      0
    )
    const firstHalfEngagements = firstHalf.reduce(
      (sum, p) => sum + (p.engagements || 0),
      0
    )
    const secondHalfEngagements = secondHalf.reduce(
      (sum, p) => sum + (p.engagements || 0),
      0
    )

    const impressionsTrend = calculateTrendPercentage(
      firstHalfImpressions,
      secondHalfImpressions
    )
    const engagementTrend = calculateTrendPercentage(
      firstHalfEngagements,
      secondHalfEngagements
    )

    // Publishing velocity (posts per week)
    const daysDiff = Math.max(
      1,
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const publishingVelocity = Math.round((published / daysDiff) * 7 * 10) / 10

    const response: MetricsResponse = {
      clientId: client.id,
      clientName: client.client_name,
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      summary: {
        postsTotal: totalPosts,
        postsPublished: published,
        postsScheduled: scheduled,
        postsDraft: draft,
        postsFailed: failed,
        totalImpressions,
        totalEngagements,
        totalClicks,
        engagementRate,
        topPlatform,
      },
      byPlatform,
      trends: {
        impressionsTrend,
        engagementTrend,
        publishingVelocity,
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Metrics endpoint error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

function calculateTrendPercentage(first: number, second: number): string {
  if (first === 0 && second === 0) return '0%'
  if (first === 0) return '+100%'
  const change = ((second - first) / first) * 100
  const rounded = Math.round(change)
  return rounded >= 0 ? `+${rounded}%` : `${rounded}%`
}
