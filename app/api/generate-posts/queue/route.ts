import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { publishGenerationJob } from '@/lib/platforms/qstash'
import { checkFeatureAccess, checkUsageLimits } from '@/lib/feature-gate'
import { checkTrialAccess } from '@/lib/trial-guard'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// Zod schema for request validation
const queueRequestSchema = z.object({
  title: z.string().max(500).optional(),
  content: z.string().min(50, 'Content must be at least 50 characters'),
  newsletterDate: z.string().datetime().optional(),
})

// Lightweight enqueue endpoint: accepts a request, records a pending job, and publishes to QStash.
// A separate worker endpoint (process) will consume.

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
    const parseResult = queueRequestSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { title, content, newsletterDate} = parseResult.data

    // L9 fix: Parallelize independent checks for better performance
    const contentHash = redisRateLimiter.generateContentHash(
      title || 'Untitled Newsletter',
      content,
      user.id
    )

    const [featureCheck, usage, rateLimit] = await Promise.all([
      checkFeatureAccess(user.id, 'basic_generation'),
      checkUsageLimits(user.id),
      redisRateLimiter.checkRateLimit(user.id, contentHash),
    ])

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

    if (!usage.allowed) {
      let message = 'Daily usage limit reached. Please try again later.'
      if (usage.tier === 'trial') {
        const trialCheck = await checkTrialAccess(user.id)
        message = trialCheck.error || message
      }
      return NextResponse.json(
        { error: message, limit: usage.limit, remaining: usage.remaining },
        { status: 429 }
      )
    }
    if (!rateLimit.allowed) {
      // L6 fix: Add standard rate limit headers
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          reason: rateLimit.reason,
          retryAfter: rateLimit.retryAfter,
          requestsRemaining: rateLimit.requestsRemaining,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter || 60),
            'X-RateLimit-Remaining': String(rateLimit.requestsRemaining),
            'X-RateLimit-Reset': String(rateLimit.resetTime),
          },
        }
      )
    }

    // Insert job record
    const { data: job, error: jobError } = await supabase
      .from('generation_jobs')
      .insert({
        user_id: user.id,
        title: title || 'Untitled Newsletter',
        content,
        status: 'pending',
        content_hash: contentHash,
        newsletter_date: newsletterDate
          ? new Date(newsletterDate).toISOString()
          : null,
      })
      .select()
      .single()

    if (jobError) {
      return NextResponse.json(
        { error: 'Failed to enqueue job' },
        { status: 500 }
      )
    }

    if (
      !process.env.QSTASH_TOKEN ||
      !process.env.QSTASH_PROCESS_URL ||
      !process.env.QSTASH_CURRENT_SIGNING_KEY
    ) {
      return NextResponse.json(
        { error: 'Queue not configured (missing QStash env vars)' },
        { status: 500 }
      )
    }

    await publishGenerationJob(job.id)

    return NextResponse.json({ jobId: job.id, status: 'queued' })
  } catch (error) {
    logger.error({ error }, 'Queue enqueue error')
    return NextResponse.json(
      { error: 'Failed to enqueue generation' },
      { status: 500 }
    )
  }
}
