import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { logger } from '@/lib/logger'

export const revalidate = 60

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // M5 fix: Parallelize independent dashboard queries for better performance
  // M16 FIX: Add error logging for DB query failures
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [
    { count: newsletterCount, error: newsletterError },
    { data: connections, error: connectionsError },
    { data: userProfile, error: profileError },
    { data: recentPosts, error: postsError },
  ] = await Promise.all([
    supabase
      .from('newsletters')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user?.id),
    supabase
      .from('platform_connections')
      .select('platform, is_active')
      .eq('user_id', user?.id),
    supabase
      .from('user_profiles')
      .select(
        'generations_today, generations_total, subscription_status, trial_ends_at'
      )
      .eq('id', user?.id)
      .single(),
    supabase
      .from('social_posts')
      .select('status, impressions, newsletters!inner(user_id)')
      .eq('newsletters.user_id', user?.id)
      .gte('created_at', thirtyDaysAgo.toISOString()),
  ])

  // Log any query errors
  if (newsletterError) {
    logger.error(
      { error: newsletterError, userId: user?.id },
      'Failed to fetch newsletter count for dashboard'
    )
  }
  if (connectionsError) {
    logger.error(
      { error: connectionsError, userId: user?.id },
      'Failed to fetch platform connections for dashboard'
    )
  }
  if (profileError) {
    logger.error(
      { error: profileError, userId: user?.id },
      'Failed to fetch user profile for dashboard'
    )
  }
  if (postsError) {
    logger.error(
      { error: postsError, userId: user?.id },
      'Failed to fetch recent posts for dashboard'
    )
  }

  const connectedPlatforms = new Map(
    connections?.map(c => [c.platform, c.is_active]) || []
  )

  const publishedCount =
    recentPosts?.filter(p => p.status === 'published').length || 0
  const scheduledCount =
    recentPosts?.filter(p => p.status === 'scheduled').length || 0
  const totalImpressions =
    recentPosts?.reduce((sum, p) => sum + (p.impressions || 0), 0) || 0

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

  const platformStatus = (platform: string) => {
    const isActive = connectedPlatforms.get(platform)
    if (isActive) return { text: 'Connected', color: 'text-green-600' }
    if (connectedPlatforms.has(platform))
      return { text: 'Inactive', color: 'text-yellow-600' }
    return { text: 'Not connected', color: 'text-muted-foreground' }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user?.email}</p>
        </div>
        {isTrial && trialDaysRemaining !== null && (
          <Badge
            variant={trialDaysRemaining <= 3 ? 'destructive' : 'secondary'}
          >
            {trialDaysRemaining} days left in trial
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Newsletters</CardTitle>
            <CardDescription>
              Manage your newsletter social posts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newsletterCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              {newsletterCount === 1 ? 'newsletter' : 'newsletters'} created
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href="/dashboard/newsletters/new">
                Create Newsletter Post
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Platforms</CardTitle>
            <CardDescription>
              Connect your social media accounts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {['twitter', 'linkedin', 'facebook', 'threads'].map(platform => {
                const status = platformStatus(platform)
                return (
                  <div
                    key={platform}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm capitalize">
                      {platform === 'twitter' ? 'Twitter/X' : platform}
                    </span>
                    <span className={`text-xs ${status.color}`}>
                      {status.text}
                    </span>
                  </div>
                )
              })}
            </div>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/dashboard/platforms">Connect Platforms</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Analytics</CardTitle>
            <CardDescription>
              Track your social media performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-2xl font-bold">{publishedCount}</div>
                <p className="text-xs text-muted-foreground">published</p>
              </div>
              <div>
                <div className="text-2xl font-bold">{scheduledCount}</div>
                <p className="text-xs text-muted-foreground">scheduled</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {totalImpressions > 0
                ? `${totalImpressions.toLocaleString()} impressions`
                : 'Impressions tracked with OAuth'}
            </p>
            <Button asChild className="mt-4 w-full" variant="outline">
              <Link href="/dashboard/analytics">View Analytics</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Follow these steps to start automating your newsletter social posts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li className={connectedPlatforms.size > 0 ? 'text-green-600' : ''}>
              Connect your social media platforms (LinkedIn, Threads, Facebook)
              {connectedPlatforms.size > 0 && ' ✓'}
            </li>
            <li className={(newsletterCount || 0) > 0 ? 'text-green-600' : ''}>
              Create your first newsletter post by pasting content or URL
              {(newsletterCount || 0) > 0 && ' ✓'}
            </li>
            <li>Review AI-generated posts for each platform</li>
            <li className={scheduledCount > 0 ? 'text-green-600' : ''}>
              Schedule posts to publish before and after your newsletter
              {scheduledCount > 0 && ' ✓'}
            </li>
            <li className={publishedCount > 0 ? 'text-green-600' : ''}>
              Track performance with built-in analytics
              {publishedCount > 0 && ' ✓'}
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
