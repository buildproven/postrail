import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { schedulePost, isQStashConfigured } from '@/lib/platforms/qstash'
import {
  calculateOptimalTime,
  type Platform,
  type PostType,
} from '@/lib/scheduling'

interface ScheduleRequest {
  postId: string
  scheduledTime: string // ISO 8601 timestamp
}

interface BulkScheduleRequest {
  newsletterId: string
  newsletterPublishDate: string // ISO 8601 timestamp
  useSmartTiming?: boolean // Default true - use platform-optimized times
  customTimes?: {
    preCTA?: string // Custom pre-CTA time (ISO 8601)
    postCTA?: string // Custom post-CTA time (ISO 8601)
  }
}

/**
 * POST /api/posts/schedule
 * Schedule a single post or bulk schedule all posts for a newsletter
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    // Bulk scheduling for entire newsletter
    if (body.newsletterId) {
      return handleBulkSchedule(body as BulkScheduleRequest, user.id, supabase)
    }

    // Single post scheduling
    return handleSingleSchedule(body as ScheduleRequest, user.id, supabase)
  } catch (error) {
    console.error('Scheduling error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleSingleSchedule(
  body: ScheduleRequest,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { postId, scheduledTime } = body

  if (!postId || !scheduledTime) {
    return NextResponse.json(
      { error: 'postId and scheduledTime are required' },
      { status: 400 }
    )
  }

  const scheduledDate = new Date(scheduledTime)
  if (isNaN(scheduledDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid scheduledTime format' },
      { status: 400 }
    )
  }

  if (scheduledDate <= new Date()) {
    return NextResponse.json(
      { error: 'scheduledTime must be in the future' },
      { status: 400 }
    )
  }

  // Verify user owns this post
  const { data: post, error: fetchError } = await supabase
    .from('social_posts')
    .select('*, newsletters(user_id)')
    .eq('id', postId)
    .single()

  if (fetchError || !post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  if (post.newsletters.user_id !== userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (post.status === 'published') {
    return NextResponse.json(
      { error: 'Post already published' },
      { status: 400 }
    )
  }

  // Check platform is connected
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('is_active')
    .eq('user_id', userId)
    .eq('platform', post.platform === 'x' ? 'twitter' : post.platform)
    .single()

  if (!connection?.is_active) {
    return NextResponse.json(
      {
        error: `${post.platform} is not connected. Please connect your account first.`,
      },
      { status: 400 }
    )
  }

  // Update post with scheduled time
  const { error: updateError } = await supabase
    .from('social_posts')
    .update({
      scheduled_time: scheduledDate.toISOString(),
      status: 'scheduled',
    })
    .eq('id', postId)

  if (updateError) {
    console.error('Failed to update post:', updateError)
    return NextResponse.json(
      { error: 'Failed to schedule post' },
      { status: 500 }
    )
  }

  // Schedule with QStash if configured
  let qstashMessageId: string | undefined
  if (isQStashConfigured()) {
    try {
      const result = await schedulePost(postId, scheduledDate)
      qstashMessageId = result.messageId
    } catch (qstashError) {
      console.error('QStash scheduling failed:', qstashError)
      // Continue anyway - manual trigger can still work
    }
  }

  return NextResponse.json({
    success: true,
    postId,
    scheduledTime: scheduledDate.toISOString(),
    qstashMessageId,
  })
}

async function handleBulkSchedule(
  body: BulkScheduleRequest,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const {
    newsletterId,
    newsletterPublishDate,
    useSmartTiming = true,
    customTimes,
  } = body

  if (!newsletterId || !newsletterPublishDate) {
    return NextResponse.json(
      { error: 'newsletterId and newsletterPublishDate are required' },
      { status: 400 }
    )
  }

  const publishDate = new Date(newsletterPublishDate)
  if (isNaN(publishDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid newsletterPublishDate format' },
      { status: 400 }
    )
  }

  // Verify user owns the newsletter
  const { data: newsletter, error: newsletterError } = await supabase
    .from('newsletters')
    .select('id, user_id')
    .eq('id', newsletterId)
    .eq('user_id', userId)
    .single()

  if (newsletterError || !newsletter) {
    return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 })
  }

  // Get user timezone for smart scheduling
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', userId)
    .single()

  const userTimezone = userProfile?.timezone || 'America/New_York'

  // Fetch all posts for this newsletter
  const { data: posts, error: postsError } = await supabase
    .from('social_posts')
    .select('id, platform, post_type, status')
    .eq('newsletter_id', newsletterId)
    .in('status', ['draft', 'scheduled'])

  if (postsError || !posts?.length) {
    return NextResponse.json(
      { error: 'No posts found to schedule' },
      { status: 404 }
    )
  }

  // Get connected platforms
  const { data: connections } = await supabase
    .from('platform_connections')
    .select('platform, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)

  const connectedPlatforms = new Set(connections?.map(c => c.platform) || [])

  // Pre-calculate custom times if provided
  const customPreCTA = customTimes?.preCTA ? new Date(customTimes.preCTA) : null
  const customPostCTA = customTimes?.postCTA
    ? new Date(customTimes.postCTA)
    : null

  // Fallback fixed times (legacy behavior)
  const fixedPreCTATime = new Date(publishDate.getTime() - 24 * 60 * 60 * 1000)
  const fixedPostCTATime = new Date(publishDate.getTime() + 48 * 60 * 60 * 1000)

  const results: Array<{
    postId: string
    platform: string
    status: string
    scheduledTime?: string
    localTime?: string
    isOptimal?: boolean
    reason?: string
    error?: string
  }> = []

  // Track scheduled times for response
  const scheduledTimes: Record<string, { time: string; isOptimal: boolean }> =
    {}

  for (const post of posts) {
    const normalizedPlatform = post.platform === 'x' ? 'twitter' : post.platform

    // Skip if platform not connected
    if (!connectedPlatforms.has(normalizedPlatform)) {
      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'skipped',
        error: 'Platform not connected',
      })
      continue
    }

    // Skip already published
    if (post.status === 'published') {
      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'skipped',
        error: 'Already published',
      })
      continue
    }

    let scheduledTime: Date
    let localTime: string | undefined
    let isOptimal = false
    let reason: string | undefined

    // Determine scheduled time based on mode
    if (customTimes) {
      // Custom times override smart timing
      scheduledTime =
        post.post_type === 'pre_cta'
          ? customPreCTA || fixedPreCTATime
          : customPostCTA || fixedPostCTATime
      reason = 'Custom time specified'
    } else if (useSmartTiming) {
      // Use smart timing based on platform best practices
      const smartResult = calculateOptimalTime({
        newsletterPublishDate: publishDate,
        postType: post.post_type as PostType,
        platform: post.platform as Platform,
        timezone: userTimezone,
      })
      scheduledTime = smartResult.scheduledTime
      localTime = smartResult.localTime
      isOptimal = smartResult.isOptimal
      reason = smartResult.reason
    } else {
      // Legacy fixed timing
      scheduledTime =
        post.post_type === 'pre_cta' ? fixedPreCTATime : fixedPostCTATime
      reason = 'Fixed timing (24h before / 48h after)'
    }

    // Skip if scheduled time is in the past
    if (scheduledTime <= new Date()) {
      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'skipped',
        error: 'Scheduled time would be in the past',
      })
      continue
    }

    // Update post
    const { error: updateError } = await supabase
      .from('social_posts')
      .update({
        scheduled_time: scheduledTime.toISOString(),
        status: 'scheduled',
      })
      .eq('id', post.id)

    if (updateError) {
      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'failed',
        error: 'Database update failed',
      })
      continue
    }

    // Schedule with QStash
    let qstashMessageId: string | undefined
    if (isQStashConfigured()) {
      try {
        const result = await schedulePost(post.id, scheduledTime)
        qstashMessageId = result.messageId

        // Store message ID for potential cancellation
        await supabase
          .from('social_posts')
          .update({ qstash_message_id: qstashMessageId })
          .eq('id', post.id)
      } catch (qstashError) {
        console.error(
          'QStash scheduling failed for post:',
          post.id,
          qstashError
        )
      }
    }

    // Track for response summary
    const timeKey = `${post.post_type}:${post.platform}`
    scheduledTimes[timeKey] = {
      time: scheduledTime.toISOString(),
      isOptimal,
    }

    results.push({
      postId: post.id,
      platform: post.platform,
      status: 'scheduled',
      scheduledTime: scheduledTime.toISOString(),
      localTime,
      isOptimal,
      reason,
    })
  }

  const scheduled = results.filter(r => r.status === 'scheduled').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const failed = results.filter(r => r.status === 'failed').length
  const optimal = results.filter(r => r.isOptimal).length

  return NextResponse.json({
    success: true,
    summary: {
      scheduled,
      skipped,
      failed,
      total: posts.length,
      optimal,
      smartTimingEnabled: useSmartTiming && !customTimes,
    },
    results,
    scheduledTimes,
    timezone: userTimezone,
  })
}

/**
 * DELETE /api/posts/schedule
 * Cancel a scheduled post
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('postId')

    if (!postId) {
      return NextResponse.json({ error: 'postId is required' }, { status: 400 })
    }

    // Verify user owns this post
    const { data: post, error: fetchError } = await supabase
      .from('social_posts')
      .select('*, newsletters(user_id)')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (post.newsletters.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    if (post.status === 'published') {
      return NextResponse.json(
        { error: 'Cannot cancel published post' },
        { status: 400 }
      )
    }

    // Update post to draft status
    const { error: updateError } = await supabase
      .from('social_posts')
      .update({
        scheduled_time: null,
        status: 'draft',
      })
      .eq('id', postId)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to cancel schedule' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, postId })
  } catch (error) {
    console.error('Cancel scheduling error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/posts/schedule
 * Get all scheduled posts for a user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const newsletterId = searchParams.get('newsletterId')

    let query = supabase
      .from('social_posts')
      .select('*, newsletters(id, title, user_id)')
      .eq('newsletters.user_id', user.id)
      .eq('status', 'scheduled')
      .order('scheduled_time', { ascending: true })

    if (newsletterId) {
      query = query.eq('newsletter_id', newsletterId)
    }

    const { data: posts, error } = await query

    if (error) {
      console.error('Failed to fetch scheduled posts:', error)
      return NextResponse.json(
        { error: 'Failed to fetch scheduled posts' },
        { status: 500 }
      )
    }

    return NextResponse.json({ posts })
  } catch (error) {
    console.error('Fetch scheduled posts error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
