import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { schedulePost, isQStashConfigured } from '@/lib/platforms/qstash'
import { logger } from '@/lib/logger'

interface RouteParams {
  params: Promise<{ postId: string }>
}

/**
 * POST /api/posts/[postId]/retry
 * Manually retry a failed post
 * Resets retry count and schedules immediate publish
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch the post and verify ownership
    const { data: post, error: fetchError } = await supabase
      .from('social_posts')
      .select('*, newsletters(user_id)')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (post.newsletters?.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Only allow retry for failed posts
    if (post.status !== 'failed') {
      return NextResponse.json(
        { error: `Cannot retry post with status: ${post.status}` },
        { status: 400 }
      )
    }

    // Check platform is still connected
    const platformName = post.platform === 'x' ? 'twitter' : post.platform
    const { data: connection } = await supabase
      .from('platform_connections')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('platform', platformName)
      .single()

    if (!connection?.is_active) {
      return NextResponse.json(
        {
          error: `${post.platform} is not connected. Please reconnect your account first.`,
        },
        { status: 400 }
      )
    }

    // Reset retry count and schedule immediate publish
    const scheduledTime = new Date(Date.now() + 5000) // 5 seconds from now

    const { error: updateError } = await supabase
      .from('social_posts')
      .update({
        status: 'scheduled',
        retry_count: 0,
        last_retry_at: null,
        error_message: null,
        scheduled_time: scheduledTime.toISOString(),
      })
      .eq('id', postId)

    if (updateError) {
      logger.error({ error: updateError }, 'Failed to reset post for retry:')
      return NextResponse.json(
        { error: 'Failed to schedule retry' },
        { status: 500 }
      )
    }

    // Schedule with QStash if configured
    let qstashMessageId: string | undefined
    if (isQStashConfigured()) {
      try {
        const result = await schedulePost(postId, scheduledTime)
        qstashMessageId = result.messageId

        // Store message ID for potential cancellation
        await supabase
          .from('social_posts')
          .update({ qstash_message_id: qstashMessageId })
          .eq('id', postId)
      } catch (qstashError) {
        logger.error({ error: qstashError }, 'QStash scheduling failed:')
        // Continue anyway - manual trigger can still work
      }
    }

    return NextResponse.json({
      success: true,
      postId,
      status: 'scheduled',
      scheduledTime: scheduledTime.toISOString(),
      qstashMessageId,
      message: 'Post scheduled for immediate retry',
    })
  } catch (error) {
    logger.error({ error }, 'Retry post error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/posts/[postId]/retry
 * Get retry status for a post
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { postId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: post, error: fetchError } = await supabase
      .from('social_posts')
      .select(
        'id, status, retry_count, max_retries, last_retry_at, error_message, newsletters!inner(user_id)'
      )
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const newsletter = post.newsletters as unknown as { user_id: string }
    if (newsletter?.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    return NextResponse.json({
      postId: post.id,
      status: post.status,
      retryCount: post.retry_count ?? 0,
      maxRetries: post.max_retries ?? 3,
      lastRetryAt: post.last_retry_at,
      errorMessage: post.error_message,
      canRetry: post.status === 'failed',
    })
  } catch (error) {
    logger.error({ error }, 'Get retry status error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
