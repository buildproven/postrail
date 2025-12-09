import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyQStashSignature } from '@/lib/platforms/qstash'
import { TwitterApi } from 'twitter-api-v2'
import { decrypt } from '@/lib/crypto'

type SocialPost = {
  id: string
  content: string
  platform: string
  status: string
  newsletters: { user_id: string }
}

async function publishToTwitter(
  post: SocialPost,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('metadata')
    .eq('user_id', userId)
    .eq('platform', 'twitter')
    .single()

  if (!connection) throw new Error('Twitter not connected')

  const metadata = connection.metadata as Record<string, string>
  const client = new TwitterApi({
    appKey: decrypt(metadata.apiKey),
    appSecret: decrypt(metadata.apiSecret),
    accessToken: decrypt(metadata.accessToken),
    accessSecret: decrypt(metadata.accessTokenSecret),
  })

  const { data: tweet } = await client.v2.tweet(post.content)
  return { postId: tweet.id, url: `https://twitter.com/i/status/${tweet.id}` }
}

async function publishToLinkedIn(
  post: SocialPost,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token')
    .eq('user_id', userId)
    .eq('platform', 'linkedin')
    .single()

  if (!connection) throw new Error('LinkedIn not connected')

  const metadata = connection.metadata as Record<string, string>
  const accessToken = decrypt(metadata.accessToken || connection.oauth_token)
  const organizationId = metadata.organizationId

  const author = organizationId
    ? `urn:li:organization:${organizationId}`
    : `urn:li:person:${userId}`

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
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data: connection } = await supabase
    .from('platform_connections')
    .select('metadata, oauth_token')
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .single()

  if (!connection) throw new Error('Facebook not connected')

  const metadata = connection.metadata as Record<string, string>
  const pageAccessToken = decrypt(
    metadata.pageAccessToken || connection.oauth_token
  )
  const pageId = metadata.pageId

  if (!pageId) throw new Error('Facebook Page ID not configured')

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

    const { jobId } = JSON.parse(body)
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
    }

    const supabase = await createClient()

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
      // Update DB with failure
      const errorMessage =
        publishError instanceof Error ? publishError.message : 'Unknown error'
      await supabase
        .from('social_posts')
        .update({
          status: 'failed',
          error_message: errorMessage,
        })
        .eq('id', post.id)

      console.error(`Failed to publish ${post.platform} post:`, publishError)
      return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
  } catch (error) {
    console.error('Queue processing error:', error)
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
