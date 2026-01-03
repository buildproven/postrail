import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { checkFeatureAccess } from '@/lib/feature-gate'
import { z } from 'zod'
// M4 fix: Extract business logic to service layer
import {
  scheduleSinglePost,
  scheduleBulkPosts,
  cancelScheduledPost,
  getScheduledPosts,
} from '@/lib/scheduling-service'

// M10 fix: Zod schemas for request validation
const singleScheduleSchema = z.object({
  postId: z.string().uuid('Invalid post ID format'),
  scheduledTime: z.string().datetime('Invalid datetime format (use ISO 8601)'),
})

const bulkScheduleSchema = z.object({
  newsletterId: z.string().uuid('Invalid newsletter ID format'),
  newsletterPublishDate: z
    .string()
    .datetime('Invalid datetime format (use ISO 8601)'),
  useSmartTiming: z.boolean().optional().default(true),
  customTimes: z
    .object({
      preCTA: z.string().datetime().optional(),
      postCTA: z.string().datetime().optional(),
    })
    .optional(),
})

interface ScheduleRequest {
  postId: string
  scheduledTime: string
}

interface BulkScheduleRequest {
  newsletterId: string
  newsletterPublishDate: string
  useSmartTiming?: boolean
  customTimes?: {
    preCTA?: string
    postCTA?: string
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

    // M2 fix: Check if user has scheduling feature access
    const featureCheck = await checkFeatureAccess(user.id, 'scheduling')
    if (!featureCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Feature not available',
          message: featureCheck.message,
          requiredTier: featureCheck.requiredTier,
          currentTier: featureCheck.tier,
        },
        { status: 403 }
      )
    }

    const body = await request.json()

    // M10 fix: Validate request with appropriate Zod schema
    if (body.newsletterId) {
      const parseResult = bulkScheduleSchema.safeParse(body)
      if (!parseResult.success) {
        return NextResponse.json(
          {
            error: 'Invalid request',
            details: parseResult.error.flatten().fieldErrors,
          },
          { status: 400 }
        )
      }
      return handleBulkSchedule(parseResult.data, user.id, supabase)
    }

    // Single post scheduling
    const parseResult = singleScheduleSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }
    return handleSingleSchedule(parseResult.data, user.id, supabase)
  } catch (error) {
    logger.error({ error }, 'Scheduling error')
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

  const result = await scheduleSinglePost(
    postId,
    scheduledTime,
    userId,
    supabase
  )

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
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

  const result = await scheduleBulkPosts(
    newsletterId,
    newsletterPublishDate,
    userId,
    supabase,
    { useSmartTiming, customTimes }
  )

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json(result)
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
    const postIdParam = searchParams.get('postId')

    // Validate postId format (consistent with POST validation)
    const postIdSchema = z.string().uuid('Invalid post ID format')
    const parseResult = postIdSchema.safeParse(postIdParam)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid post ID format' },
        { status: 400 }
      )
    }

    const result = await cancelScheduledPost(
      parseResult.data,
      user.id,
      supabase
    )

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error({ error }, 'Cancel scheduling error')
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

    const result = await getScheduledPosts(
      user.id,
      supabase,
      newsletterId || undefined
    )

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    logger.error({ error }, 'Fetch scheduled posts error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
