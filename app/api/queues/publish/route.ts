import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyQStashSignature, schedulePost } from '@/lib/platforms/qstash'
import { TwitterApi } from 'twitter-api-v2'
import { decrypt } from '@/lib/crypto'
import { z } from 'zod'

// Exponential backoff delays in seconds: 1min, 5min, 30min
const RETRY_DELAYS = [60, 300, 1800] as const
const MAX_RETRIES = 3

// Webhook payload validation schema
const webhookPayloadSchema = z.object({
  jobId: z.string().uuid('Invalid jobId format - must be a valid UUID'),
})

type SocialPost = {
  id: string
  content: string
  platform: string
  status: string
  retry_count: number
  max_retries: number
  newsletters: { user_id: string }
}

// H4 fix: Zod schemas for platform metadata validation
const twitterMetadataSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  tokenType: z.string().optional(),
  scope: z.string().optional(),
})

const linkedinMetadataSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  organizationId: z.string().optional(),
  organizations: z
    .array(
      z.object({
        id: z.number(),
        localizedName: z.string(),
      })
    )
    .optional(),
})

const facebookMetadataSchema = z.object({
  pageAccessToken: z.string().min(1),
  pageId: z.string().min(1),
})

function validateTwitterMetadata(
  metadata: unknown
): z.infer<typeof twitterMetadataSchema> | null {
  const result = twitterMetadataSchema.safeParse(metadata)
  return result.success ? result.data : null
}

function validateLinkedInMetadata(
  metadata: unknown
): z.infer<typeof linkedinMetadataSchema> | null {
  const result = linkedinMetadataSchema.safeParse(metadata)
  return result.success ? result.data : null
}

function validateFacebookMetadata(
  metadata: unknown
): z.infer<typeof facebookMetadataSchema> | null {
  const result = facebookMetadataSchema.safeParse(metadata)
  return result.success ? result.data : null
}

async function publishToTwitter(
  post: SocialPost,
  userId: string,
  supabase: Awaited<ReturnType<typeof createServiceClient>>
) {
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token, oauth_refresh_token')
    .eq('user_id', userId)
    .eq('platform', 'twitter')
    .single()

  if (!connection) throw new Error('Twitter not connected')

  // H4 fix: Validate metadata with Zod
  const metadata = validateTwitterMetadata(connection.metadata)
  if (!metadata) {
    throw new Error(
      'Invalid Twitter credentials format. Please reconnect your account.'
    )
  }

  // Twitter OAuth 2.0 uses bearer token
  const accessToken = decrypt(metadata.accessToken)
  const client = new TwitterApi(accessToken)

  const { data: tweet } = await client.v2.tweet(post.content)
  return { postId: tweet.id, url: `https://twitter.com/i/status/${tweet.id}` }
}

async function publishToLinkedIn(
  post: SocialPost,
  userId: string,
  supabase: Awaited<ReturnType<typeof createServiceClient>>
) {
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token, platform_user_id')
    .eq('user_id', userId)
    .eq('platform', 'linkedin')
    .single()

  if (!connection) throw new Error('LinkedIn not connected')

  // H4 fix: Validate metadata with Zod
  const metadata = validateLinkedInMetadata(connection.metadata)
  if (!metadata) {
    throw new Error(
      'Invalid LinkedIn credentials format. Please reconnect your account.'
    )
  }

  const accessToken = decrypt(metadata.accessToken)
  const organizationId = metadata.organizationId
  const memberId = connection.platform_user_id

  if (!organizationId && !memberId) {
    throw new Error('LinkedIn member ID missing; reconnect account')
  }

  const author = organizationId
    ? `urn:li:organization:${organizationId}`
    : `urn:li:person:${memberId}`

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: post.content },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LinkedIn API error: ${response.status} - ${error}`)
  }

  const result = await response.json()
  const postId = result.id || result['X-RestLi-Id']
  return { postId, url: `https://www.linkedin.com/feed/update/${postId}` }
}

async function publishToFacebook(
  post: SocialPost,
  userId: string,
  supabase: Awaited<ReturnType<typeof createServiceClient>>
) {
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token')
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .single()

  if (!connection) throw new Error('Facebook not connected')

  // H4 fix: Validate metadata with Zod
  const metadata = validateFacebookMetadata(connection.metadata)
  if (!metadata) {
    throw new Error(
      'Invalid Facebook credentials format. Please reconnect your account.'
    )
  }

  const pageAccessToken = decrypt(metadata.pageAccessToken)
  const pageId = metadata.pageId

  const response = await fetch(
    `https://graph.facebook.com/v22.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: post.content,
        access_token: pageAccessToken,
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(
      `Facebook API error: ${error.error?.message || response.status}`
    )
  }

  const result = await response.json()
  const postId = result.id
  return {
    postId,
    url: `https://www.facebook.com/${postId.replace('_', '/posts/')}`,
  }
}

/**
 * QStash Webhook Handler
 *
 * Receives publishing jobs from Upstash QStash.
 * 1. Verifies signature (security)
 * 2. Fetches post from DB
 * 3. Publishes to platform (Twitter, LinkedIn, Facebook)
 * 4. Updates status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('upstash-signature')

    // Verify request comes from QStash
    if (process.env.NODE_ENV === 'production') {
      try {
        await verifyQStashSignature(signature, body, request.url)
      } catch (err) {
        console.error('QStash signature verification failed', err)
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        )
      }
    }

    // Validate webhook payload with Zod (prevents malformed UUID attacks)
    let payload
    try {
      const rawPayload = JSON.parse(body)
      const validation = webhookPayloadSchema.safeParse(rawPayload)

      if (!validation.success) {
        console.error('Invalid webhook payload:', validation.error.flatten())
        return NextResponse.json(
          {
            error: 'Invalid webhook payload',
            details: validation.error.flatten().fieldErrors,
          },
          { status: 400 }
        )
      }

      payload = validation.data
    } catch (parseError) {
      console.error('Failed to parse webhook body:', parseError)
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    const { jobId } = payload

    const supabase = createServiceClient()

    // Fetch the post to publish
    const { data: post, error: fetchError } = await supabase
      .from('social_posts')
      .select('*, newsletters(user_id)')
      .eq('id', jobId)
      .single()

    if (fetchError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    if (post.status === 'published') {
      return NextResponse.json({
        message: 'Already published',
        postId: post.platform_post_id,
      })
    }

    // Check if max retries exceeded - don't process further
    const retryCount = post.retry_count ?? 0
    const maxRetries = post.max_retries ?? MAX_RETRIES
    if (post.status === 'failed' && retryCount >= maxRetries) {
      return NextResponse.json({
        message: 'Max retries exceeded',
        retryCount,
        maxRetries,
      })
    }

    // Mark as publishing
    await supabase
      .from('social_posts')
      .update({ status: 'publishing' })
      .eq('id', post.id)

    const userId = post.newsletters.user_id
    let result: { postId: string; url: string }

    try {
      // Route to appropriate platform
      switch (post.platform) {
        case 'twitter':
        case 'x':
          result = await publishToTwitter(post as SocialPost, userId, supabase)
          break
        case 'linkedin':
          result = await publishToLinkedIn(post as SocialPost, userId, supabase)
          break
        case 'facebook':
          result = await publishToFacebook(post as SocialPost, userId, supabase)
          break
        case 'threads':
          // Threads not yet supported
          await supabase
            .from('social_posts')
            .update({ status: 'scheduled' })
            .eq('id', post.id)
          return NextResponse.json({
            message: 'Threads posting not yet available',
          })
        default:
          throw new Error(`Unsupported platform: ${post.platform}`)
      }

      // Update DB with success
      await supabase
        .from('social_posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: result.postId,
        })
        .eq('id', post.id)

      return NextResponse.json({ success: true, ...result })
    } catch (publishError) {
      const errorMessage =
        publishError instanceof Error ? publishError.message : 'Unknown error'
      const newRetryCount = retryCount + 1
      const canRetry = newRetryCount < maxRetries

      console.error(
        `Failed to publish ${post.platform} post (attempt ${newRetryCount}/${maxRetries}):`,
        publishError
      )

      if (canRetry) {
        // Schedule retry with exponential backoff
        const delaySeconds =
          RETRY_DELAYS[retryCount] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
        const retryTime = new Date(Date.now() + delaySeconds * 1000)

        await supabase
          .from('social_posts')
          .update({
            status: 'scheduled', // Keep as scheduled for retry
            retry_count: newRetryCount,
            last_retry_at: new Date().toISOString(),
            error_message: `Retry ${newRetryCount}/${maxRetries}: ${errorMessage}`,
          })
          .eq('id', post.id)

        // Schedule retry via QStash
        try {
          const retryResult = await schedulePost(post.id, retryTime)
          console.log(
            `Scheduled retry ${newRetryCount} for post ${post.id} in ${delaySeconds}s`,
            retryResult.messageId
          )

          // Store the QStash message ID for potential cancellation
          await supabase
            .from('social_posts')
            .update({ qstash_message_id: retryResult.messageId })
            .eq('id', post.id)
        } catch (qstashError) {
          console.error('Failed to schedule retry via QStash:', qstashError)
        }

        return NextResponse.json({
          error: errorMessage,
          retry: true,
          retryCount: newRetryCount,
          nextRetryAt: retryTime.toISOString(),
        })
      } else {
        // Max retries exceeded - mark as permanently failed
        await supabase
          .from('social_posts')
          .update({
            status: 'failed',
            retry_count: newRetryCount,
            last_retry_at: new Date().toISOString(),
            error_message: `Failed after ${maxRetries} attempts: ${errorMessage}`,
          })
          .eq('id', post.id)

        return NextResponse.json({
          error: errorMessage,
          retry: false,
          retryCount: newRetryCount,
          message: 'Max retries exceeded',
        })
      }
    }
  } catch (error) {
    console.error('Queue processing error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
