import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { publishGenerationJob } from '@/lib/platforms/qstash'

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

    const { title, content } = await request.json()
    if (!content) {
      return NextResponse.json({ error: 'Newsletter content is required' }, { status: 400 })
    }

    // Rate limit before enqueue
    const contentHash = redisRateLimiter.generateContentHash(
      title || 'Untitled Newsletter',
      content,
      user.id
    )

    const rateLimit = await redisRateLimiter.checkRateLimit(user.id, contentHash)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', reason: rateLimit.reason, retryAfter: rateLimit.retryAfter },
        { status: 429 }
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
      })
      .select()
      .single()

    if (jobError) {
      return NextResponse.json({ error: 'Failed to enqueue job' }, { status: 500 })
    }

    if (!process.env.QSTASH_TOKEN || !process.env.QSTASH_PROCESS_URL || !process.env.QSTASH_CURRENT_SIGNING_KEY) {
      return NextResponse.json(
        { error: 'Queue not configured (missing QStash env vars)' },
        { status: 500 }
      )
    }

    await publishGenerationJob(job.id)

    return NextResponse.json({ jobId: job.id, status: 'queued' })
  } catch (error) {
    console.error('Queue enqueue error:', error)
    return NextResponse.json({ error: 'Failed to enqueue generation' }, { status: 500 })
  }
}
