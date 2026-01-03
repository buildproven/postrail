/**
 * Scheduling Service
 * M4 fix: Extract scheduling business logic from route handler
 *
 * Handles:
 * - Single post scheduling
 * - Bulk newsletter post scheduling
 * - Schedule cancellation
 * - Fetching scheduled posts
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { schedulePost, isQStashConfigured } from '@/lib/platforms/qstash'
import {
  calculateOptimalTime,
  type Platform,
  type PostType,
} from '@/lib/scheduling'
import { logger } from '@/lib/logger'
import type { SocialPost } from '@/lib/schemas'

interface ScheduledPostWithNewsletter extends SocialPost {
  newsletters: { id: string; title: string; user_id: string } | null
}

export interface SingleScheduleResult {
  success: true
  postId: string
  scheduledTime: string
  qstashMessageId?: string
  qstashScheduled: boolean
}

export interface BulkScheduleResult {
  success: true
  summary: {
    scheduled: number
    skipped: number
    failed: number
    total: number
    optimal: number
    smartTimingEnabled: boolean
  }
  results: Array<{
    postId: string
    platform: string
    status: string
    scheduledTime?: string
    localTime?: string
    isOptimal?: boolean
    reason?: string
    error?: string
    qstashScheduled?: boolean
  }>
  scheduledTimes: Record<string, { time: string; isOptimal: boolean }>
  timezone: string
}

export interface SchedulingError {
  error: string
  status: number
}

/**
 * Schedule a single post
 */
export async function scheduleSinglePost(
  postId: string,
  scheduledTime: string,
  userId: string,
  supabase: SupabaseClient
): Promise<SingleScheduleResult | SchedulingError> {
  const scheduledDate = new Date(scheduledTime)

  if (scheduledDate <= new Date()) {
    return {
      error: 'scheduledTime must be in the future',
      status: 400,
    }
  }

  // Verify user owns this post
  const { data: post, error: fetchError } = await supabase
    .from('social_posts')
    .select('*, newsletters(user_id)')
    .eq('id', postId)
    .single()

  if (fetchError || !post) {
    return { error: 'Post not found', status: 404 }
  }

  if (post.newsletters.user_id !== userId) {
    return { error: 'Unauthorized', status: 403 }
  }

  if (post.status === 'published') {
    return {
      error: 'Post already published',
      status: 400,
    }
  }

  // Check platform is connected
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('is_active')
    .eq('user_id', userId)
    .eq('platform', post.platform === 'x' ? 'twitter' : post.platform)
    .single()

  if (!connection?.is_active) {
    return {
      error: `${post.platform} is not connected. Please connect your account first.`,
      status: 400,
    }
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
    logger.error({ error: updateError }, 'Failed to update post')
    return {
      error: 'Failed to schedule post',
      status: 500,
    }
  }

  // Schedule with QStash if configured
  let qstashMessageId: string | undefined
  let qstashScheduled = false
  if (isQStashConfigured()) {
    try {
      const result = await schedulePost(postId, scheduledDate)
      qstashMessageId = result.messageId
      qstashScheduled = true
      logger.info({
        type: 'qstash.schedule.success',
        postId,
        messageId: qstashMessageId,
        scheduledTime: scheduledDate.toISOString(),
      })
    } catch (qstashError) {
      logger.error({
        type: 'qstash.schedule.failed',
        postId,
        scheduledTime: scheduledDate.toISOString(),
        error:
          qstashError instanceof Error
            ? qstashError.message
            : String(qstashError),
      })
      // Post is marked as scheduled in DB - manual publish will still work
      // but automated publishing won't trigger
    }
  }

  return {
    success: true,
    postId,
    scheduledTime: scheduledDate.toISOString(),
    qstashMessageId,
    qstashScheduled,
  }
}

/**
 * Bulk schedule all posts for a newsletter
 */
export async function scheduleBulkPosts(
  newsletterId: string,
  newsletterPublishDate: string,
  userId: string,
  supabase: SupabaseClient,
  options: {
    useSmartTiming?: boolean
    customTimes?: {
      preCTA?: string
      postCTA?: string
    }
  } = {}
): Promise<BulkScheduleResult | SchedulingError> {
  const { useSmartTiming = true, customTimes } = options

  const publishDate = new Date(newsletterPublishDate)

  // Verify user owns the newsletter
  const { data: newsletter, error: newsletterError } = await supabase
    .from('newsletters')
    .select('id, user_id')
    .eq('id', newsletterId)
    .eq('user_id', userId)
    .single()

  if (newsletterError || !newsletter) {
    return { error: 'Newsletter not found', status: 404 }
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
    return {
      error: 'No posts found to schedule',
      status: 404,
    }
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

  // Step 1: Calculate scheduled times and prepare batch updates
  const postsToSchedule: Array<{
    id: string
    platform: string
    post_type: string
    scheduledTime: Date
    localTime?: string
    isOptimal: boolean
    reason: string
  }> = []

  const results: BulkScheduleResult['results'] = []
  const scheduledTimes: Record<string, { time: string; isOptimal: boolean }> =
    {}
  const now = new Date()

  // Process all posts to determine scheduled times
  for (const post of posts) {
    const normalizedPlatform = post.platform === 'x' ? 'twitter' : post.platform

    if (!connectedPlatforms.has(normalizedPlatform)) {
      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'skipped',
        error: 'Platform not connected',
      })
      continue
    }

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
    let reason: string

    if (customTimes) {
      scheduledTime =
        post.post_type === 'pre_cta'
          ? customPreCTA || fixedPreCTATime
          : customPostCTA || fixedPostCTATime
      reason = 'Custom time specified'
    } else if (useSmartTiming) {
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
      scheduledTime =
        post.post_type === 'pre_cta' ? fixedPreCTATime : fixedPostCTATime
      reason = 'Fixed timing (24h before / 48h after)'
    }

    if (scheduledTime <= now) {
      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'skipped',
        error: 'Scheduled time would be in the past',
      })
      continue
    }

    postsToSchedule.push({
      id: post.id,
      platform: post.platform,
      post_type: post.post_type,
      scheduledTime,
      localTime,
      isOptimal,
      reason,
    })
  }

  // Step 2: Batch update all posts at once
  const dbUpdates = postsToSchedule.map(post =>
    supabase
      .from('social_posts')
      .update({
        scheduled_time: post.scheduledTime.toISOString(),
        status: 'scheduled',
      })
      .eq('id', post.id)
  )

  const updateResults = await Promise.all(dbUpdates)

  // Track which posts failed to update
  const failedUpdates = new Set<string>()
  updateResults.forEach((result, index) => {
    if (result.error) {
      failedUpdates.add(postsToSchedule[index].id)
      results.push({
        postId: postsToSchedule[index].id,
        platform: postsToSchedule[index].platform,
        status: 'failed',
        error: 'Database update failed',
      })
    }
  })

  // Step 3: Parallelize QStash scheduling for successfully updated posts
  if (isQStashConfigured()) {
    const qstashPromises = postsToSchedule
      .filter(post => !failedUpdates.has(post.id))
      .map(async post => {
        try {
          const result = await schedulePost(post.id, post.scheduledTime)
          logger.info({
            type: 'qstash.schedule.success',
            postId: post.id,
            platform: post.platform,
            messageId: result.messageId,
            scheduledTime: post.scheduledTime.toISOString(),
          })
          return { postId: post.id, messageId: result.messageId, success: true }
        } catch (qstashError) {
          logger.error({
            type: 'qstash.schedule.failed',
            postId: post.id,
            platform: post.platform,
            scheduledTime: post.scheduledTime.toISOString(),
            error:
              qstashError instanceof Error
                ? qstashError.message
                : String(qstashError),
          })
          return { postId: post.id, success: false }
        }
      })

    const qstashResults = await Promise.all(qstashPromises)

    // Step 4: Batch update QStash message IDs
    const messageIdUpdates = qstashResults
      .filter(r => r.success && r.messageId)
      .map(r =>
        supabase
          .from('social_posts')
          .update({ qstash_message_id: r.messageId })
          .eq('id', r.postId)
      )

    if (messageIdUpdates.length > 0) {
      await Promise.all(messageIdUpdates)
    }

    // Build results with QStash status
    const qstashStatusMap = new Map(
      qstashResults.map(r => [r.postId, r.success])
    )

    for (const post of postsToSchedule) {
      if (failedUpdates.has(post.id)) continue

      const timeKey = `${post.post_type}:${post.platform}`
      scheduledTimes[timeKey] = {
        time: post.scheduledTime.toISOString(),
        isOptimal: post.isOptimal,
      }

      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'scheduled',
        scheduledTime: post.scheduledTime.toISOString(),
        localTime: post.localTime,
        isOptimal: post.isOptimal,
        reason: post.reason,
        qstashScheduled: qstashStatusMap.get(post.id) || false,
      })
    }
  } else {
    // No QStash - just add results for successfully updated posts
    for (const post of postsToSchedule) {
      if (failedUpdates.has(post.id)) continue

      const timeKey = `${post.post_type}:${post.platform}`
      scheduledTimes[timeKey] = {
        time: post.scheduledTime.toISOString(),
        isOptimal: post.isOptimal,
      }

      results.push({
        postId: post.id,
        platform: post.platform,
        status: 'scheduled',
        scheduledTime: post.scheduledTime.toISOString(),
        localTime: post.localTime,
        isOptimal: post.isOptimal,
        reason: post.reason,
        qstashScheduled: false,
      })
    }
  }

  const scheduled = results.filter(r => r.status === 'scheduled').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const failed = results.filter(r => r.status === 'failed').length
  const optimal = results.filter(r => r.isOptimal).length

  return {
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
  }
}

/**
 * Cancel a scheduled post
 */
export async function cancelScheduledPost(
  postId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{ success: true; postId: string } | SchedulingError> {
  // Verify user owns this post
  const { data: post, error: fetchError } = await supabase
    .from('social_posts')
    .select('*, newsletters(user_id)')
    .eq('id', postId)
    .single()

  if (fetchError || !post) {
    return { error: 'Post not found', status: 404 }
  }

  if (post.newsletters.user_id !== userId) {
    return { error: 'Unauthorized', status: 403 }
  }

  if (post.status === 'published') {
    return {
      error: 'Cannot cancel published post',
      status: 400,
    }
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
    return {
      error: 'Failed to cancel schedule',
      status: 500,
    }
  }

  return { success: true, postId }
}

/**
 * Get all scheduled posts for a user (optionally filtered by newsletter)
 */
export async function getScheduledPosts(
  userId: string,
  supabase: SupabaseClient,
  newsletterId?: string
): Promise<{ posts: ScheduledPostWithNewsletter[] } | SchedulingError> {
  let query = supabase
    .from('social_posts')
    .select('*, newsletters(id, title, user_id)')
    .eq('newsletters.user_id', userId)
    .eq('status', 'scheduled')
    .order('scheduled_time', { ascending: true })

  if (newsletterId) {
    query = query.eq('newsletter_id', newsletterId)
  }

  const { data: posts, error } = await query

  if (error) {
    logger.error({ error }, 'Failed to fetch scheduled posts')
    return {
      error: 'Failed to fetch scheduled posts',
      status: 500,
    }
  }

  return { posts: posts || [] }
}
