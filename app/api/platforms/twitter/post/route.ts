import { NextRequest, NextResponse } from 'next/server'
import { TwitterApi } from 'twitter-api-v2'
import { createClient } from '@/lib/supabase/server'
import { decrypt } from '@/lib/crypto'

/**
 * Twitter Post Publishing Endpoint
 *
 * Posts content to Twitter using user's BYOK credentials.
 * Supports:
 * - Text posts (up to 280 characters)
 * - Thread detection (future: auto-split long content)
 * - Rate limit handling
 */

interface TwitterPostRequest {
  socialPostId: string // ID of the social_post record
  content: string
  scheduleTime?: string // ISO timestamp (for future scheduling)
}

/**
 * Get decrypted Twitter credentials for user
 */
async function getTwitterClient(userId: string) {
  const supabase = await createClient()

  const { data: connection, error } = await supabase
    .from('platform_connections')
    .select('metadata, is_active')
    .eq('user_id', userId)
    .eq('platform', 'twitter')
    .single()

  if (error || !connection) {
    throw new Error('Twitter account not connected')
  }

  if (!connection.is_active) {
    throw new Error('Twitter connection is inactive. Please reconnect.')
  }

  const metadata = connection.metadata as {
    apiKey: string
    apiSecret: string
    accessToken: string
    accessTokenSecret: string
  }

  // Decrypt credentials
  const credentials = {
    appKey: decrypt(metadata.apiKey),
    appSecret: decrypt(metadata.apiSecret),
    accessToken: decrypt(metadata.accessToken),
    accessSecret: decrypt(metadata.accessTokenSecret),
  }

  return new TwitterApi(credentials)
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

    // Verify social post belongs to user and is for Twitter - include status for idempotency
    const { data: socialPost, error: postError } = await supabase
      .from('social_posts')
      .select('id, platform, newsletter_id, status, platform_post_id, published_at, error_message, updated_at, newsletters!inner(user_id)')
      .eq('id', socialPostId)
      .single()

    if (postError || !socialPost) {
      return NextResponse.json(
        { error: 'Social post not found' },
        { status: 404 }
      )
    }

    // TypeScript workaround for nested select
    const postWithNewsletter = socialPost as typeof socialPost & {
      newsletters: { user_id: string }
      status: string
      platform_post_id: string | null
      published_at: string | null
      error_message: string | null
      updated_at: string
    }

    if (postWithNewsletter.newsletters.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Unauthorized to post this content' },
        { status: 403 }
      )
    }

    if (socialPost.platform !== 'twitter') {
      return NextResponse.json(
        { error: 'This post is not configured for Twitter' },
        { status: 400 }
      )
    }

    // Idempotency protection: Check if post is already published
    if (postWithNewsletter.status === 'published' && postWithNewsletter.platform_post_id) {
      console.log(`Post ${socialPostId} already published as tweet ${postWithNewsletter.platform_post_id}`)
      return NextResponse.json({
        success: true,
        tweetId: postWithNewsletter.platform_post_id,
        tweetText: content,
        url: `https://twitter.com/i/web/status/${postWithNewsletter.platform_post_id}`,
        fromCache: true,
        message: 'Post was already published successfully',
        publishedAt: postWithNewsletter.published_at
      })
    }

    // Check if post is currently being processed (optimistic locking simulation)
    const now = new Date()
    const lastUpdate = new Date(postWithNewsletter.updated_at)
    const timeSinceUpdate = now.getTime() - lastUpdate.getTime()

    if (postWithNewsletter.status === 'publishing' && timeSinceUpdate < 60000) { // 1 minute
      return NextResponse.json(
        {
          error: 'Post is currently being processed',
          details: 'This post is already being published by another request. Please wait and try again.',
          status: 'publishing',
          lastUpdate: postWithNewsletter.updated_at
        },
        { status: 409 } // Conflict
      )
    }

    // Get Twitter client with user's credentials
    const client = await getTwitterClient(user.id)

    // Optimistic locking: Update status to 'publishing' before attempting to post
    const { error: lockError } = await supabase
      .from('social_posts')
      .update({
        status: 'publishing',
        updated_at: new Date().toISOString()
      })
      .eq('id', socialPostId)
      .eq('updated_at', postWithNewsletter.updated_at) // Ensure no concurrent updates

    if (lockError) {
      console.error('Failed to acquire lock on social post:', lockError)
      return NextResponse.json(
        {
          error: 'Post is being processed by another request',
          details: 'Unable to acquire lock on post. Another request may be processing it.'
        },
        { status: 409 } // Conflict
      )
    }

    // Post to Twitter
    try {
      const { data: tweet } = await client.v2.tweet(content)

      // Update social_post record with success
      const { error: updateError } = await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: tweet.id,
          error_message: null,
        })
        .eq('id', socialPostId)

      if (updateError) {
        console.error('Error updating social post:', updateError)
        // Post was successful, so we don't return error
      }

      return NextResponse.json({
        success: true,
        tweetId: tweet.id,
        tweetText: tweet.text,
        url: `https://twitter.com/i/web/status/${tweet.id}`,
      })
    } catch (twitterError: unknown) {
      console.error('Twitter API error:', twitterError)

      let errorMessage = 'Failed to post to Twitter'
      let errorDetails = 'Unknown error'

      if (twitterError instanceof Error) {
        const errorMsg = twitterError.message.toLowerCase()

        if (errorMsg.includes('rate limit')) {
          errorMessage = 'Rate limit exceeded'
          errorDetails =
            'You have exceeded Twitter API rate limits. Please wait 15 minutes and try again.'
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
    console.error('Twitter post error:', error)

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
