import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { logger } from '@/lib/logger'
import { getValidAccessToken } from '@/lib/oauth-refresh'

/**
 * LinkedIn Post Publishing Endpoint
 *
 * Posts content to LinkedIn using OAuth tokens.
 * Supports:
 * - Text posts (up to 3000 characters)
 * - Personal profile posts (w_member_social)
 * - Organization/Company Page posts (w_organization_social)
 */

interface LinkedInPostRequest {
  socialPostId: string
  content: string
  organizationId?: string // Optional: post as org instead of personal
}

interface LinkedInCredentials {
  accessToken: string
  organizations?: Array<{ id: number; localizedName: string }>
  organizationId?: string // For BYOK compatibility
}

interface LinkedInOAuthMetadata {
  accessToken: string
  refreshToken?: string | null
  organizations?: Array<{ id: number; localizedName: string }>
  // BYOK format
  organizationId?: string
}

/**
 * Get decrypted LinkedIn credentials for user
 * Supports both OAuth and BYOK formats
 * VBL5: Now includes automatic token refresh
 */
async function getLinkedInCredentials(
  userId: string
): Promise<LinkedInCredentials> {
  const supabase = await createClient()

  const { data: connection, error } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token, is_active')
    .eq('user_id', userId)
    .eq('platform', 'linkedin')
    .single()

  if (error || !connection) {
    throw new Error('LinkedIn account not connected')
  }

  if (!connection.is_active) {
    throw new Error('LinkedIn connection is inactive. Please reconnect.')
  }

  const metadata = connection.metadata as LinkedInOAuthMetadata

  // OAuth format: accessToken is in metadata
  // VBL5: Use getValidAccessToken for automatic refresh
  if (metadata.accessToken) {
    try {
      const accessToken = await getValidAccessToken(userId, 'linkedin')
      return {
        accessToken,
        organizations: metadata.organizations,
        organizationId: metadata.organizationId,
      }
    } catch (refreshError) {
      logger.error(
        { error: refreshError, userId },
        'Failed to get valid LinkedIn access token'
      )
      throw new Error(
        'Unable to access your LinkedIn credentials. Please reconnect your LinkedIn account in Settings → Connected Accounts'
      )
    }
  }

  // Fallback: token might be in oauth_token field
  if (connection.oauth_token) {
    try {
      const accessToken = await getValidAccessToken(userId, 'linkedin')
      return {
        accessToken,
        organizations: metadata.organizations,
        organizationId: metadata.organizationId,
      }
    } catch (refreshError) {
      logger.error(
        { error: refreshError, userId },
        'Failed to get valid LinkedIn oauth_token'
      )
      throw new Error(
        'Unable to access your LinkedIn credentials. Please reconnect your LinkedIn account in Settings → Connected Accounts'
      )
    }
  }

  throw new Error('LinkedIn credentials not found. Please reconnect.')
}

/**
 * POST: Publish a post to LinkedIn
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

    const { socialPostId, content, organizationId }: LinkedInPostRequest =
      await request.json()

    // Validate inputs
    if (!socialPostId || !content) {
      return NextResponse.json(
        { error: 'socialPostId and content are required' },
        { status: 400 }
      )
    }

    // Check character limit (3000 for LinkedIn)
    if (content.length > 3000) {
      return NextResponse.json(
        {
          error: 'Content exceeds LinkedIn character limit',
          limit: 3000,
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
    if (postWithNewsletter.platform !== 'linkedin') {
      await supabase
        .from('social_posts')
        .update({ status: 'draft' })
        .eq('id', socialPostId)
      return NextResponse.json(
        { error: 'This post is not configured for LinkedIn' },
        { status: 400 }
      )
    }

    // Get LinkedIn credentials
    const credentials = await getLinkedInCredentials(user.id)

    // Determine author: organization or personal profile
    // Priority: request param > stored organizationId > first org from OAuth > personal
    let author: string
    const orgId =
      organizationId ||
      credentials.organizationId ||
      (credentials.organizations &&
        credentials.organizations[0]?.id?.toString())

    if (orgId) {
      author = `urn:li:organization:${orgId}`
    } else {
      // Post as personal profile - need to get user's LinkedIn URN
      const meResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      })
      if (!meResponse.ok) {
        throw new Error('Failed to get LinkedIn user info')
      }
      const meData = await meResponse.json()
      author = `urn:li:person:${meData.sub}`
    }

    // Post to LinkedIn using the Posts API (v2)
    try {
      const postBody = {
        author: author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: content,
            },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      }

      const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(postBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(
          { status: response.status, errorText },
          'LinkedIn post error'
        )
        throw new Error(`LinkedIn API error: ${response.status} - ${errorText}`)
      }

      const postResult = await response.json()
      const postId = postResult.id

      // Update social_post record with success
      await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: postId,
          error_message: null,
        })
        .eq('id', socialPostId)

      // Extract the activity ID for the URL
      const activityId = postId
        .replace('urn:li:share:', '')
        .replace('urn:li:ugcPost:', '')

      return NextResponse.json({
        success: true,
        postId: postId,
        url: `https://www.linkedin.com/feed/update/${postId}`,
        activityId: activityId,
      })
    } catch (linkedinError: unknown) {
      logger.error({ error: linkedinError }, 'LinkedIn API error:')

      let errorMessage = 'Failed to post to LinkedIn'
      let errorDetails = 'Unknown error'

      if (linkedinError instanceof Error) {
        const errorMsg = linkedinError.message.toLowerCase()

        if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
          errorMessage = 'Rate limit exceeded'
          errorDetails =
            'You have exceeded LinkedIn API rate limits. Please wait and try again.'
        } else if (
          errorMsg.includes('401') ||
          errorMsg.includes('unauthorized')
        ) {
          errorMessage = 'Authentication failed'
          errorDetails =
            'Your LinkedIn access token has expired. Please reconnect your account.'
        } else if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
          errorMessage = 'Permission denied'
          errorDetails =
            'Your LinkedIn app does not have permission to post. Check your app permissions.'
        } else {
          errorDetails = linkedinError.message
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
    logger.error({ error }, 'LinkedIn post error:')

    if (error instanceof Error) {
      if (error.message.includes('not connected')) {
        return NextResponse.json(
          {
            error: 'LinkedIn not connected',
            details:
              'Please connect your LinkedIn account in Settings → Connected Accounts',
          },
          { status: 400 }
        )
      }

      if (error.message.includes('inactive')) {
        return NextResponse.json(
          {
            error: 'LinkedIn connection inactive',
            details: 'Please reconnect your LinkedIn account',
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
