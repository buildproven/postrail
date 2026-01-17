import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  authenticateService,
  hasPermission,
  canAccessClient,
  checkServiceRateLimit,
} from '@/lib/service-auth'
import { logger } from '@/lib/logger'
import { createRateLimitHeaders } from '@/lib/redis-rate-limiter'

export const runtime = 'nodejs'
export const maxDuration = 60 // Allow up to 60s for bulk operations

type Platform = 'linkedin' | 'threads' | 'facebook' | 'x'
type PostType = 'pre_cta' | 'post_cta'

interface BulkPostRequest {
  clientId: string
  posts: Array<{
    content: string
    platform: Platform
    postType?: PostType
    scheduledFor?: string // ISO date
    metadata?: Record<string, unknown>
  }>
}

interface PostResult {
  id: string
  platform: Platform
  status: 'draft' | 'scheduled'
  scheduledFor: string | null
}

/**
 * POST /api/posts/bulk
 *
 * Create multiple posts for a Growth Autopilot client.
 * Requires service authentication (Bearer pr_sk_*).
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate service
    const serviceContext = await authenticateService(request)

    if (!serviceContext) {
      return NextResponse.json(
        { error: 'Unauthorized. Valid service API key required.' },
        { status: 401 }
      )
    }

    // Check permission
    if (!hasPermission(serviceContext, 'create_post')) {
      return NextResponse.json(
        { error: 'Forbidden. Missing create_post permission.' },
        { status: 403 }
      )
    }

    const rateLimitResult = await checkServiceRateLimit(serviceContext)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          reason: rateLimitResult.reason,
          retryAfter: rateLimitResult.retryAfter,
          requestsRemaining: rateLimitResult.requestsRemaining,
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      )
    }

    const body: BulkPostRequest = await request.json()

    // Validate request
    if (!body.clientId) {
      return NextResponse.json(
        { error: 'clientId is required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(body.posts) || body.posts.length === 0) {
      return NextResponse.json(
        { error: 'posts array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (body.posts.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 posts per request' },
        { status: 400 }
      )
    }

    // Check client access
    if (!canAccessClient(serviceContext, body.clientId)) {
      return NextResponse.json(
        { error: 'Forbidden. Cannot access this client.' },
        { status: 403 }
      )
    }

    const supabase = createServiceClient()

    // Verify client exists
    const { data: client, error: clientError } = await supabase
      .from('growth_autopilot_clients')
      .select('id, client_name, active')
      .eq('id', body.clientId)
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    if (!client.active) {
      return NextResponse.json(
        { error: 'Client account is inactive' },
        { status: 403 }
      )
    }

    // Prepare posts for insertion
    const validPlatforms = ['linkedin', 'threads', 'facebook', 'x']
    const postsToInsert = body.posts
      .filter(p => validPlatforms.includes(p.platform))
      .map(post => ({
        client_id: body.clientId,
        platform: post.platform,
        post_type: post.postType || 'post_cta',
        content: post.content,
        character_count: post.content.length,
        scheduled_time: post.scheduledFor || null,
        status: post.scheduledFor ? 'scheduled' : 'draft',
        metadata: post.metadata || null,
      }))

    if (postsToInsert.length === 0) {
      return NextResponse.json(
        { error: 'No valid posts to create' },
        { status: 400 }
      )
    }

    // Insert posts
    const { data: createdPosts, error: insertError } = await supabase
      .from('social_posts')
      .insert(postsToInsert)
      .select('id, platform, status, scheduled_time')

    if (insertError) {
      logger.error({ error: insertError }, 'Bulk post insert error')
      return NextResponse.json(
        { error: 'Failed to create posts' },
        { status: 500 }
      )
    }

    const results: PostResult[] = (createdPosts || []).map(p => ({
      id: p.id,
      platform: p.platform as Platform,
      status: p.status as 'draft' | 'scheduled',
      scheduledFor: p.scheduled_time,
    }))

    return NextResponse.json(
      {
        success: true,
        clientId: body.clientId,
        created: results.length,
        posts: results,
      },
      { headers: createRateLimitHeaders(rateLimitResult) }
    )
  } catch (error) {
    logger.error({ error }, 'Bulk post error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
