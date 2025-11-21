/**
 * Twitter Posting Status API
 *
 * Provides status information for Twitter posting operations
 * and debugging idempotency protection.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Twitter connection status
    const { data: connection } = await supabase
      .from('platform_connections')
      .select('is_active, created_at, updated_at')
      .eq('user_id', user.id)
      .eq('platform', 'twitter')
      .single()

    // Get recent Twitter posts for this user
    const { data: recentPosts } = await supabase
      .from('social_posts')
      .select(
        `
        id,
        platform,
        status,
        platform_post_id,
        published_at,
        error_message,
        updated_at,
        created_at,
        newsletters!inner(user_id)
      `
      )
      .eq('platform', 'twitter')
      .eq('newsletters.user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(10)

    // Count posts by status
    const statusCounts =
      recentPosts?.reduce(
        (acc, post) => {
          acc[post.status] = (acc[post.status] || 0) + 1
          return acc
        },
        {} as Record<string, number>
      ) || {}

    // Check for posts in 'publishing' status that might be stuck
    const stuckPosts =
      recentPosts?.filter(post => {
        if (post.status !== 'publishing') return false
        const now = new Date()
        const updated = new Date(post.updated_at)
        const timeSinceUpdate = now.getTime() - updated.getTime()
        return timeSinceUpdate > 5 * 60 * 1000 // 5 minutes
      }) || []

    return NextResponse.json({
      user: {
        id: user.id,
        twitterConnected: !!connection?.is_active,
        connectionDate: connection?.created_at,
        lastConnectionUpdate: connection?.updated_at,
      },
      posts: {
        recent: recentPosts?.slice(0, 5).map(post => ({
          id: post.id,
          status: post.status,
          platform_post_id: post.platform_post_id,
          published_at: post.published_at,
          error_message: post.error_message,
          updated_at: post.updated_at,
          url: post.platform_post_id
            ? `https://twitter.com/i/web/status/${post.platform_post_id}`
            : null,
        })),
        statusCounts,
        stuckPosts: stuckPosts.map(post => ({
          id: post.id,
          status: post.status,
          timeSinceUpdate: Date.now() - new Date(post.updated_at).getTime(),
          updated_at: post.updated_at,
        })),
      },
      idempotency: {
        description: 'Twitter posting includes idempotency protection',
        features: [
          'Duplicate post detection',
          'Status-based replay protection',
          'Optimistic locking with updated_at',
          'Publishing status timeout (1 minute)',
          'Platform post ID tracking',
        ],
        statusFlow: [
          'draft → publishing → published (success)',
          'draft → publishing → failed (error)',
          'published → return cached result (idempotent)',
        ],
      },
      troubleshooting: {
        stuckPosts:
          stuckPosts.length > 0
            ? 'Some posts appear stuck in publishing status'
            : 'No stuck posts detected',
        recommendation:
          stuckPosts.length > 0
            ? 'Posts stuck in publishing status for >5 minutes may need manual intervention'
            : 'All posts appear to be in normal status',
      },
    })
  } catch (error) {
    console.error('Twitter status error:', error)
    return NextResponse.json(
      { error: 'Failed to get Twitter status' },
      { status: 500 }
    )
  }
}
