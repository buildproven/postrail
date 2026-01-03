import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

interface PlatformStats {
  posts: number
  published: number
  scheduled: number
  draft: number
  failed: number
  impressions: number
  engagements: number
  clicks: number
}

interface ActivityItem {
  id: string
  platform: string
  postType: string
  status: string
  content: string
  scheduledTime: string | null
  publishedAt: string | null
  createdAt: string
}

interface DashboardMetrics {
  posts: {
    total: number
    byStatus: {
      draft: number
      scheduled: number
      published: number
      failed: number
    }
    byPlatform: Record<string, number>
    successRate: number
  }
  usage: {
    generationsToday: number
    generationsTotal: number
    dailyLimit: number
    totalLimit: number | null
    trialDaysRemaining: number | null
    isTrial: boolean
    subscriptionStatus: string
  }
  publishing: {
    velocityPerWeek: number
    lastPublishedAt: string | null
    upcomingScheduled: number
    failedCount: number
  }
  engagement: {
    impressions: number
    engagements: number
    clicks: number
    engagementRate: number
    hasConnectedPlatforms: boolean
  }
  platforms: {
    connected: string[]
    stats: Record<string, PlatformStats>
  }
  activity: ActivityItem[]
  period: {
    from: string
    to: string
  }
}

/**
 * GET /api/analytics/dashboard
 *
 * Get aggregated analytics for the current user's dashboard.
 *
 * Query params:
 * - from: ISO date (default: 30 days ago)
 * - to: ISO date (default: now)
 * - limit: Number of activity items (default: 10, max: 50)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse query params
    const url = new URL(request.url)
    const fromParam = url.searchParams.get('from')
    const toParam = url.searchParams.get('to')
    const limitParam = url.searchParams.get('limit')

    const now = new Date()
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const fromDate = fromParam ? new Date(fromParam) : defaultFrom
    const toDate = toParam ? new Date(toParam) : now
    const activityLimit = Math.min(parseInt(limitParam || '10', 10), 50)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use ISO 8601.' },
        { status: 400 }
      )
    }

    // M1 fix: Parallelize independent database queries for performance
    const [
      { data: userProfile, error: profileError },
      { data: limits },
      { data: posts, error: postsError },
    ] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('id', user.id).single(),
      supabase.from('system_limits').select('name, value'),
      supabase
        .from('social_posts')
        .select('*, newsletters(user_id)')
        .eq('newsletters.user_id', user.id)
        .gte('created_at', fromDate.toISOString())
        .lte('created_at', toDate.toISOString()),
    ])

    // Check for user profile error (orphaned user)
    if (profileError) {
      logger.error(
        { error: profileError, userId: user.id },
        'User profile not found - orphaned user account'
      )
      return NextResponse.json(
        {
          error: 'Account setup incomplete',
          details:
            'Your user profile was not found. Please contact support or try signing out and back in.',
        },
        { status: 404 }
      )
    }

    if (!userProfile) {
      logger.error({ userId: user.id }, 'User profile is null after query')
      return NextResponse.json(
        {
          error: 'Account setup incomplete',
          details:
            'Your user profile could not be loaded. Please contact support.',
        },
        { status: 404 }
      )
    }

    if (postsError) {
      logger.error({ error: postsError }, 'Analytics query error')
      return NextResponse.json(
        { error: 'Failed to fetch analytics' },
        { status: 500 }
      )
    }

    const limitMap: Record<string, number> = {}
    limits?.forEach(l => {
      limitMap[l.name] = l.value
    })

    // Calculate trial status
    const isTrial = userProfile?.subscription_status === 'trial'
    const trialEndsAt = userProfile?.trial_ends_at
      ? new Date(userProfile.trial_ends_at)
      : null
    const trialDaysRemaining =
      trialEndsAt && isTrial
        ? Math.max(
            0,
            Math.ceil(
              (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            )
          )
        : null

    // Get daily/total limits based on subscription
    const dailyLimit = isTrial
      ? limitMap['trial_daily_limit'] || 3
      : limitMap['paid_daily_limit'] || 50
    const totalLimit = isTrial ? limitMap['trial_total_limit'] || 10 : null

    const allPosts = posts || []

    // Calculate post stats in a single pass (avoid multiple filter iterations)
    const byStatus = {
      draft: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
    }

    const platforms = ['linkedin', 'threads', 'facebook', 'x', 'twitter']
    const byPlatform: Record<string, number> = {}
    const platformStats: Record<string, PlatformStats> = {}

    // Initialize platform stats
    for (const platform of platforms) {
      platformStats[platform] = {
        posts: 0,
        published: 0,
        scheduled: 0,
        draft: 0,
        failed: 0,
        impressions: 0,
        engagements: 0,
        clicks: 0,
      }
    }

    // Single pass through all posts to calculate stats
    for (const post of allPosts) {
      // Count by status
      if (post.status === 'draft') byStatus.draft++
      else if (post.status === 'scheduled') byStatus.scheduled++
      else if (post.status === 'published') byStatus.published++
      else if (post.status === 'failed') byStatus.failed++

      // Count by platform
      if (platforms.includes(post.platform)) {
        if (!byPlatform[post.platform]) {
          byPlatform[post.platform] = 0
        }
        byPlatform[post.platform]++
        platformStats[post.platform].posts++

        // Update status counts
        if (post.status === 'published') {
          platformStats[post.platform].published++
        } else if (post.status === 'scheduled') {
          platformStats[post.platform].scheduled++
        } else if (post.status === 'draft') {
          platformStats[post.platform].draft++
        } else if (post.status === 'failed') {
          platformStats[post.platform].failed++
        }

        // Accumulate engagement metrics
        platformStats[post.platform].impressions += post.impressions || 0
        platformStats[post.platform].engagements += post.engagements || 0
        platformStats[post.platform].clicks += post.clicks || 0
      }
    }

    // Success rate
    const publishedCount = byStatus.published
    const attemptedCount = byStatus.published + byStatus.failed
    const successRate =
      attemptedCount > 0
        ? Math.round((publishedCount / attemptedCount) * 100)
        : 100

    // Publishing velocity (posts per week)
    const daysDiff = Math.max(
      1,
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const velocityPerWeek =
      Math.round((publishedCount / daysDiff) * 7 * 10) / 10

    // Get last published post
    const lastPublished = allPosts
      .filter(p => p.status === 'published' && p.published_at)
      .sort(
        (a, b) =>
          new Date(b.published_at).getTime() -
          new Date(a.published_at).getTime()
      )[0]

    // Count upcoming scheduled posts
    const upcomingScheduled = allPosts.filter(
      p =>
        p.status === 'scheduled' &&
        p.scheduled_time &&
        new Date(p.scheduled_time) > now
    ).length

    // Engagement totals
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

    // M1 fix: Parallelize remaining queries
    const [{ data: connections }, { data: recentPosts }] = await Promise.all([
      supabase
        .from('platform_connections')
        .select('platform, is_active')
        .eq('user_id', user.id)
        .eq('is_active', true),
      supabase
        .from('social_posts')
        .select(
          'id, platform, post_type, status, content, scheduled_time, published_at, created_at, newsletters(user_id)'
        )
        .eq('newsletters.user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(activityLimit),
    ])

    const connectedPlatforms = connections?.map(c => c.platform) || []

    const activity: ActivityItem[] = (recentPosts || []).map(p => ({
      id: p.id,
      platform: p.platform,
      postType: p.post_type,
      status: p.status,
      content:
        p.content.substring(0, 100) + (p.content.length > 100 ? '...' : ''),
      scheduledTime: p.scheduled_time,
      publishedAt: p.published_at,
      createdAt: p.created_at,
    }))

    const response: DashboardMetrics = {
      posts: {
        total: allPosts.length,
        byStatus,
        byPlatform,
        successRate,
      },
      usage: {
        generationsToday: userProfile?.generations_today || 0,
        generationsTotal: userProfile?.generations_total || 0,
        dailyLimit,
        totalLimit,
        trialDaysRemaining,
        isTrial,
        subscriptionStatus: userProfile?.subscription_status || 'trial',
      },
      publishing: {
        velocityPerWeek,
        lastPublishedAt: lastPublished?.published_at || null,
        upcomingScheduled,
        failedCount: byStatus.failed,
      },
      engagement: {
        impressions: totalImpressions,
        engagements: totalEngagements,
        clicks: totalClicks,
        engagementRate,
        hasConnectedPlatforms: connectedPlatforms.length > 0,
      },
      platforms: {
        connected: connectedPlatforms,
        stats: platformStats,
      },
      activity,
      period: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
    }

    return NextResponse.json(response)
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Dashboard analytics error'
    )
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
