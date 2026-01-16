import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { logger } from '@/lib/logger'
import { getValidAccessToken } from '@/lib/oauth-refresh'

/**
 * Facebook Post Publishing Endpoint
 *
 * Posts content to Facebook Page using OAuth tokens.
 * Supports:
 * - Text posts (up to 63,206 characters)
 * - Page posts (not personal profile)
 */

interface FacebookPostRequest {
  socialPostId: string
  content: string
  pageId?: string // Optional: specify which page to post to
}

interface FacebookCredentials {
  pageAccessToken: string
  pageId: string
  pageName?: string
  allPages?: Array<{ id: string; name: string; category?: string }>
}

interface FacebookOAuthMetadata {
  pageAccessToken?: string
  pageId?: string
  pageName?: string
  allPages?: Array<{ id: string; name: string; category?: string }>
  userAccessToken?: string
}

/**
 * Get decrypted Facebook credentials for user
 * Supports both OAuth and BYOK formats
 * VBL5: Now includes automatic token refresh
 */
async function getFacebookCredentials(
  userId: string,
  requestedPageId?: string
): Promise<FacebookCredentials> {
  const supabase = await createClient()

  const { data: connection, error } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token, platform_user_id, is_active')
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .single()

  if (error || !connection) {
    throw new Error('Facebook account not connected')
  }

  if (!connection.is_active) {
    throw new Error('Facebook connection is inactive. Please reconnect.')
  }

  const metadata = connection.metadata as FacebookOAuthMetadata

  // VBL5: Get valid access token with automatic refresh
  const pageAccessToken = await getValidAccessToken(userId, 'facebook')

  // If a specific page is requested and we have multiple pages, find it
  if (requestedPageId && metadata.allPages) {
    const requestedPage = metadata.allPages.find(p => p.id === requestedPageId)
    if (requestedPage) {
      return {
        pageAccessToken,
        pageId: requestedPage.id,
        pageName: requestedPage.name,
        allPages: metadata.allPages,
      }
    }
  }

  // OAuth format: pageAccessToken in metadata
  if (metadata.pageAccessToken) {
    return {
      pageAccessToken,
      pageId: metadata.pageId || connection.platform_user_id,
      pageName: metadata.pageName,
      allPages: metadata.allPages,
    }
  }

  // Fallback: token in oauth_token field (BYOK format)
  if (connection.oauth_token) {
    return {
      pageAccessToken,
      pageId: metadata.pageId || connection.platform_user_id,
      pageName: metadata.pageName,
      allPages: metadata.allPages,
    }
  }

  throw new Error('Facebook credentials not found. Please reconnect.')
}

/**
 * POST: Publish a post to Facebook Page
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check
    const rateLimitResult = await redisRateLimiter.checkRateLimit(user.id)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          requestsRemaining: rateLimitResult.requestsRemaining,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
            'X-RateLimit-Remaining': String(rateLimitResult.requestsRemaining),
            'X-RateLimit-Reset': String(rateLimitResult.resetTime),
          },
        }
      )
    }

    const { socialPostId, content, pageId }: FacebookPostRequest =
      await request.json()

    // Validate inputs
    if (!socialPostId || !content) {
      return NextResponse.json(
        { error: 'socialPostId and content are required' },
        { status: 400 }
      )
    }

    // Check character limit (63,206 for Facebook)
    if (content.length > 63206) {
      return NextResponse.json(
        {
          error: 'Content exceeds Facebook character limit',
          limit: 63206,
          current: content.length,
        },
        { status: 400 }
      )
    }

    // Atomic fetch-and-lock to prevent race condition
    const { data: lockResult, error: lockError } = await supabase
      .from('social_posts')
      .update({
        status: 'publishing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', socialPostId)
      .in('status', ['draft', 'scheduled', 'failed'])
      .select(
        'id, platform, newsletter_id, status, platform_post_id, published_at, newsletters!inner(user_id)'
      )
      .single()

    // If lock failed, check current state
    if (lockError || !lockResult) {
      const { data: currentPost } = await supabase
        .from('social_posts')
        .select(
          'id, platform, status, platform_post_id, published_at, newsletters!inner(user_id)'
        )
        .eq('id', socialPostId)
        .single()

      if (!currentPost) {
        return NextResponse.json(
          { error: 'Social post not found' },
          { status: 404 }
        )
      }

      const currentPostTyped = currentPost as typeof currentPost & {
        newsletters: { user_id: string }
        platform_post_id: string | null
        published_at: string | null
      }

      if (currentPostTyped.newsletters.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Unauthorized to post this content' },
          { status: 403 }
        )
      }

      // Idempotency: Post already published
      if (
        currentPost.status === 'published' &&
        currentPostTyped.platform_post_id
      ) {
        return NextResponse.json({
          success: true,
          postId: currentPostTyped.platform_post_id,
          fromCache: true,
          message: 'Post was already published successfully',
          publishedAt: currentPostTyped.published_at,
        })
      }

      if (currentPost.status === 'publishing') {
        return NextResponse.json(
          {
            error: 'Post is currently being processed',
            details:
              'This post is already being published. Please wait and try again.',
            status: 'publishing',
          },
          { status: 409 }
        )
      }

      return NextResponse.json(
        {
          error: 'Failed to lock post for publishing',
          details: lockError?.message || 'Unknown error',
        },
        { status: 500 }
      )
    }

    const postWithNewsletter = lockResult as typeof lockResult & {
      newsletters: { user_id: string }
    }

    // Verify authorization
    if (postWithNewsletter.newsletters.user_id !== user.id) {
      await supabase
        .from('social_posts')
        .update({ status: 'draft' })
        .eq('id', socialPostId)
      return NextResponse.json(
        { error: 'Unauthorized to post this content' },
        { status: 403 }
      )
    }

    // Verify platform
    if (postWithNewsletter.platform !== 'facebook') {
      await supabase
        .from('social_posts')
        .update({ status: 'draft' })
        .eq('id', socialPostId)
      return NextResponse.json(
        { error: 'This post is not configured for Facebook' },
        { status: 400 }
      )
    }

    // Get Facebook credentials
    const credentials = await getFacebookCredentials(user.id, pageId)

    // Post to Facebook using Graph API
    try {
      const response = await fetch(
        `https://graph.facebook.com/v22.0/${credentials.pageId}/feed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: content,
            access_token: credentials.pageAccessToken,
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        logger.error(
          { status: response.status, errorData },
          'Facebook post error'
        )

        // Handle specific Facebook errors
        if (errorData.error?.code === 190) {
          throw new Error('401: Access token expired')
        }
        if (errorData.error?.code === 200) {
          throw new Error('403: Permission denied')
        }
        if (errorData.error?.code === 368) {
          throw new Error('duplicate: Content was already posted')
        }

        throw new Error(
          `Facebook API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`
        )
      }

      const postResult = await response.json()
      const fbPostId = postResult.id

      // Update social_post record with success
      await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: fbPostId,
          error_message: null,
        })
        .eq('id', socialPostId)

      // Facebook post IDs are in format "pageId_postId"
      const postUrl = `https://www.facebook.com/${fbPostId.replace('_', '/posts/')}`

      return NextResponse.json({
        success: true,
        postId: fbPostId,
        url: postUrl,
        pageName: credentials.pageName,
      })
    } catch (facebookError: unknown) {
      logger.error({ error: facebookError }, 'Facebook API error:')

      let errorMessage = 'Failed to post to Facebook'
      let errorDetails = 'Unknown error'

      if (facebookError instanceof Error) {
        const errorMsg = facebookError.message.toLowerCase()

        if (errorMsg.includes('rate limit') || errorMsg.includes('throttl')) {
          errorMessage = 'Rate limit exceeded'
          errorDetails =
            'You have exceeded Facebook API rate limits. Please wait and try again.'
        } else if (errorMsg.includes('401') || errorMsg.includes('expired')) {
          errorMessage = 'Authentication failed'
          errorDetails =
            'Your Facebook access token has expired. Please reconnect your account.'
        } else if (
          errorMsg.includes('403') ||
          errorMsg.includes('permission')
        ) {
          errorMessage = 'Permission denied'
          errorDetails =
            'Your Facebook app does not have permission to post. Check your app permissions.'
        } else if (errorMsg.includes('duplicate')) {
          errorMessage = 'Duplicate content'
          errorDetails =
            'This content was already posted recently. Facebook prevents duplicate posts.'
        } else {
          errorDetails = facebookError.message
        }
      }

      // Update social_post with error
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: `${errorMessage}: ${errorDetails}`,
        })
        .eq('id', socialPostId)

      return NextResponse.json(
        {
          error: errorMessage,
          details: errorDetails,
        },
        { status: 400 }
      )
    }
  } catch (error) {
    logger.error({ error }, 'Facebook post error:')

    if (error instanceof Error) {
      if (error.message.includes('not connected')) {
        return NextResponse.json(
          {
            error: 'Facebook not connected',
            details:
              'Please connect your Facebook Page in Settings → Connected Accounts',
          },
          { status: 400 }
        )
      }

      if (error.message.includes('inactive')) {
        return NextResponse.json(
          {
            error: 'Facebook connection inactive',
            details: 'Please reconnect your Facebook Page',
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
