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
  const { data: job, error } = await supabase
    .from('generation_jobs')
    .select('id,status,result,error')
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json(job)
}
