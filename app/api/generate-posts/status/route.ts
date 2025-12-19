import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Poll job status
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: job, error } = await supabase
    .from('generation_jobs')
    .select('id,status,result,error_message,newsletter_id,user_id')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    result: job.result,
    error: job.error_message,
    newsletterId: job.newsletter_id,
  })
}
