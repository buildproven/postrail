import { NextRequest, NextResponse } from 'next/server'
import { TwitterApi } from 'twitter-api-v2'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { logger } from '@/lib/logger'

/**
 * Twitter Post Publishing Endpoint
 *
 * Posts content to Twitter using OAuth 2.0 or BYOK credentials.
 * Supports:
 * - Text posts (up to 280 characters)
 * - OAuth 2.0 (1-click connect)
 * - BYOK (bring your own keys) for legacy connections
 */

interface TwitterPostRequest {
  socialPostId: string
  content: string
}

interface TwitterOAuthMetadata {
  accessToken: string
  refreshToken?: string | null
  tokenType?: string
  scope?: string
  // BYOK format (legacy)
  apiKey?: string
  apiSecret?: string
  accessTokenSecret?: string
}

/**
 * Get Twitter client for user - supports both OAuth 2.0 and BYOK
 */
async function getTwitterClient(userId: string): Promise<TwitterApi> {
  const supabase = await createClient()

  const { data: connection, error } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token, is_active')
    .eq('user_id', userId)
    .eq('platform', 'twitter')
    .single()

  if (error || !connection) {
    throw new Error('Twitter account not connected')
  }

  if (!connection.is_active) {
    throw new Error('Twitter connection is inactive. Please reconnect.')
  }

  const metadata = connection.metadata as TwitterOAuthMetadata

  // OAuth 2.0 format (new): has accessToken in metadata, no apiKey
  if (metadata.accessToken && !metadata.apiKey) {
    const accessToken = decrypt(metadata.accessToken)
    return new TwitterApi(accessToken)
  }

  // BYOK format (legacy): has apiKey, apiSecret, accessToken, accessTokenSecret
  if (
    metadata.apiKey &&
    metadata.apiSecret &&
    metadata.accessToken &&
    metadata.accessTokenSecret
  ) {
    return new TwitterApi({
      appKey: decrypt(metadata.apiKey),
      appSecret: decrypt(metadata.apiSecret),
      accessToken: decrypt(metadata.accessToken),
      accessSecret: decrypt(metadata.accessTokenSecret),
    })
  }

  // Fallback: try oauth_token field
  if (connection.oauth_token) {
    const accessToken = decrypt(connection.oauth_token)
    return new TwitterApi(accessToken)
  }

  throw new Error('Twitter credentials not found. Please reconnect.')
}

/**
 * POST: Publish a post to Twitter
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

    const { socialPostId, content }: TwitterPostRequest = await request.json()

    // Validate inputs
    if (!socialPostId || !content) {
      return NextResponse.json(
        { error: 'socialPostId and content are required' },
        { status: 400 }
      )
    }

    // Check character limit (280 for Twitter)
    if (content.length > 280) {
      return NextResponse.json(
        {
          error: 'Content exceeds Twitter character limit',
          limit: 280,
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
          tweetId: currentPostTyped.platform_post_id,
          url: `https://twitter.com/i/web/status/${currentPostTyped.platform_post_id}`,
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
    if (postWithNewsletter.platform !== 'twitter') {
      await supabase
        .from('social_posts')
        .update({ status: 'draft' })
        .eq('id', socialPostId)
      return NextResponse.json(
        { error: 'This post is not configured for Twitter' },
        { status: 400 }
      )
    }

    // Get Twitter client
    const client = await getTwitterClient(user.id)

    // Post to Twitter
    try {
      const { data: tweet } = await client.v2.tweet(content)

      // Update social_post record with success
      await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: tweet.id,
          error_message: null,
        })
        .eq('id', socialPostId)

      return NextResponse.json({
        success: true,
        tweetId: tweet.id,
        tweetText: tweet.text,
        url: `https://twitter.com/i/web/status/${tweet.id}`,
      })
    } catch (twitterError: unknown) {
      logger.error({ error: twitterError }, 'Twitter API error:')

      let errorMessage = 'Failed to post to Twitter'
      let errorDetails = 'Unknown error'

      if (twitterError instanceof Error) {
        const errorMsg = twitterError.message.toLowerCase()

        if (errorMsg.includes('rate limit')) {
          errorMessage = 'Rate limit exceeded'
          errorDetails =
            'You have exceeded Twitter API rate limits. Please wait and try again.'
        } else if (errorMsg.includes('duplicate')) {
          errorMessage = 'Duplicate content'
          errorDetails =
            'This content was already posted recently. Twitter prevents duplicate posts.'
        } else if (
          errorMsg.includes('unauthorized') ||
          errorMsg.includes('401')
        ) {
          errorMessage = 'Authentication failed'
          errorDetails =
            'Your Twitter connection has expired. Please reconnect your account.'
        } else if (errorMsg.includes('forbidden') || errorMsg.includes('403')) {
          errorMessage = 'Permission denied'
          errorDetails =
            'Your Twitter app does not have permission to post tweets.'
        } else {
          errorDetails = twitterError.message
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
    logger.error({ error }, 'Twitter post error:')

    if (error instanceof Error) {
      if (error.message.includes('not connected')) {
        return NextResponse.json(
          {
            error: 'Twitter not connected',
            details:
              'Please connect your Twitter account in Settings → Connected Accounts',
          },
          { status: 400 }
        )
      }

      if (error.message.includes('inactive')) {
        return NextResponse.json(
          {
            error: 'Twitter connection inactive',
            details: 'Please reconnect your Twitter account',
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
