import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StatsCard } from '@/components/analytics/stats-card'
import { UsageProgress } from '@/components/analytics/usage-progress'
import { ActivityTimeline } from '@/components/analytics/activity-timeline'
import { PlatformChart } from '@/components/analytics/platform-chart'
import { EngagementPlaceholder } from '@/components/analytics/engagement-placeholder'

export const revalidate = 300

export default async function AnalyticsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch analytics data directly from database for server component
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Get user profile
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Get system limits
  const { data: limits } = await supabase
    .from('system_limits')
    .select('name, value')

  const limitMap: Record<string, number> = {}
  limits?.forEach(l => {
    limitMap[l.name] = l.value
  })

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

  const dailyLimit = isTrial
    ? limitMap['trial_daily_limit'] || 3
    : limitMap['paid_daily_limit'] || 50
  const totalLimit = isTrial ? limitMap['trial_total_limit'] || 10 : null

  // Get posts
  const { data: allPosts } = await supabase
    .from('social_posts')
    .select('*, newsletters!inner(user_id)')
    .eq('newsletters.user_id', user.id)
    .gte('created_at', thirtyDaysAgo.toISOString())

  const posts = allPosts || []

  // Calculate stats
  const byStatus = {
    draft: posts.filter(p => p.status === 'draft').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    published: posts.filter(p => p.status === 'published').length,
    failed: posts.filter(p => p.status === 'failed').length,
  }

  const byPlatform: Record<string, number> = {}
  posts.forEach(p => {
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1
  })

  const publishedCount = byStatus.published
  const attemptedCount = byStatus.published + byStatus.failed
  const successRate =
    attemptedCount > 0
      ? Math.round((publishedCount / attemptedCount) * 100)
      : 100

  // Publishing velocity
  const daysDiff = Math.max(
    1,
    (now.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24)
  )
  const velocityPerWeek = Math.round((publishedCount / daysDiff) * 7 * 10) / 10

  // Get connected platforms
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const connectedPlatforms = connections?.map(c => c.platform) || []

  // Engagement totals
  const totalImpressions = posts.reduce(
    (sum, p) => sum + (p.impressions || 0),
    0
  )
  const totalEngagements = posts.reduce(
    (sum, p) => sum + (p.engagements || 0),
    0
  )
  const totalClicks = posts.reduce((sum, p) => sum + (p.clicks || 0), 0)
  const engagementRate =
    totalImpressions > 0
      ? Math.round((totalEngagements / totalImpressions) * 10000) / 100
      : 0

  // Recent activity
  const { data: recentPosts } = await supabase
    .from('social_posts')
    .select(
      'id, platform, post_type, status, content, scheduled_time, published_at, created_at, newsletters!inner(user_id)'
    )
    .eq('newsletters.user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const activity = (recentPosts || []).map(p => ({
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">
          Track your social media performance
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Posts"
          value={posts.length}
          description="Last 30 days"
        />
        <StatsCard
          title="Published"
          value={byStatus.published}
          description={`${successRate}% success rate`}
        />
        <StatsCard
          title="Scheduled"
          value={byStatus.scheduled}
          description="Upcoming posts"
        />
        <StatsCard
          title="Failed"
          value={byStatus.failed}
          description={byStatus.failed > 0 ? 'Needs attention' : 'All good'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <UsageProgress
          generationsToday={userProfile?.generations_today || 0}
          generationsTotal={userProfile?.generations_total || 0}
          dailyLimit={dailyLimit}
          totalLimit={totalLimit}
          isTrial={isTrial}
          trialDaysRemaining={trialDaysRemaining}
          subscriptionStatus={userProfile?.subscription_status || 'trial'}
        />
        <EngagementPlaceholder
          hasConnectedPlatforms={connectedPlatforms.length > 0}
          impressions={totalImpressions}
          engagements={totalEngagements}
          clicks={totalClicks}
          engagementRate={engagementRate}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PlatformChart data={byPlatform} />
        <ActivityTimeline items={activity} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Publishing Velocity"
          value={`${velocityPerWeek}/week`}
          description="Average posts per week"
        />
        <StatsCard
          title="Platforms Connected"
          value={connectedPlatforms.length}
          description={
            connectedPlatforms.length === 0
              ? 'Connect to start posting'
              : connectedPlatforms.join(', ')
          }
        />
        <StatsCard
          title="Drafts"
          value={byStatus.draft}
          description="Ready to schedule"
        />
      </div>
    </div>
  )
}
