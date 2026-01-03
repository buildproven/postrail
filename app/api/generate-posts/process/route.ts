import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { observability, withObservability } from '@/lib/observability'
import { POST as generatePostsHandler } from '../route'
import { verifyQStashSignature } from '@/lib/platforms/qstash'
import { z } from 'zod'

// QStash will POST here with a signed request containing jobId.
// We reuse the existing generate-posts logic by crafting a Request-like object.

const QStashRequestSchema = z.object({
  jobId: z.string(),
})

export async function POST(request: NextRequest) {
  return withObservability.trace('ai_generation_worker', async requestId => {
    try {
      const rawBody = await request.text()

      const signature = request.headers.get('Upstash-Signature')
      const url = request.url
      const qstashConfigured = Boolean(process.env.QSTASH_CURRENT_SIGNING_KEY)
      if (
        qstashConfigured &&
        !(await verifyQStashSignature(signature, rawBody, url))
      ) {
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        )
      }

      const supabase = createServiceClient()

      let parsedBody
      try {
        parsedBody = JSON.parse(rawBody)
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON in request body' },
          { status: 400 }
        )
      }

      const validation = QStashRequestSchema.safeParse(parsedBody)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: validation.error.message },
          { status: 400 }
        )
      }

      const { jobId } = validation.data

      // Fetch job
      const { data: job, error: jobError } = await supabase
        .from('generation_jobs')
        .select('*')
        .eq('id', jobId)
        .single()

      if (jobError || !job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      if (job.status !== 'pending') {
        return NextResponse.json({ status: job.status, jobId })
      }

      await supabase
        .from('generation_jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      // Build a NextRequest-like object for the main handler
      const body = JSON.stringify({
        title: job.title,
        content: job.content,
        newsletterDate: job.newsletter_date,
      })
      const handlerRequest = new Request(
        process.env.QSTASH_PROCESS_URL || 'http://localhost/api/generate-posts',
        {
          method: 'POST',
          body,
          headers: {
            'Content-Type': 'application/json',
            'x-worker-token': process.env.INTERNAL_WORKER_TOKEN || '',
            'x-service-user-id': job.user_id,
          },
        }
      ) as unknown as NextRequest

      // Execute main generation handler
      const response = await generatePostsHandler(handlerRequest)
      const json = await response.json()

      // Update job status and store result
      const { error: updateError } = await supabase
        .from('generation_jobs')
        .update({
          status: response.ok ? 'completed' : 'failed',
          result: json,
          error_message: response.ok ? null : json?.error,
          newsletter_id: response.ok ? json?.newsletterId : null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)

      if (updateError) {
        observability.error('Failed to update job status', {
          requestId,
          event: 'ai_generation_failure',
          metadata: { jobId, updateError },
        })
      }

      return NextResponse.json(
        { jobId, status: response.ok ? 'completed' : 'failed' },
        { status: response.status }
      )
    } catch (error) {
      observability.error('AI generation worker error', {
        requestId,
        event: 'ai_generation_failure',
        error: error as Error,
      })
      return NextResponse.json({ error: 'Worker failed' }, { status: 500 })
    }
  })
}
