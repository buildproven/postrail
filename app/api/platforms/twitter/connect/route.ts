import { NextRequest, NextResponse } from 'next/server'
import { TwitterApi } from 'twitter-api-v2'
import { createClient } from '@/lib/supabase/server'
import { encrypt, hash } from '@/lib/crypto'
import { logger, security } from '@/lib/logger'

/**
 * Twitter BYOK (Bring Your Own Keys) Connection Endpoint
 *
 * Users provide their own Twitter API credentials:
 * - API Key (Consumer Key)
 * - API Secret (Consumer Secret)
 * - Access Token
 * - Access Token Secret
 *
 * This allows each user to use their own Twitter Free Tier (500 posts/month)
 * instead of sharing a centralized app's quota.
 */

interface TwitterCredentials {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
}

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

    // CSRF Protection: Validate Origin header
    const origin = request.headers.get('origin')
    const host = request.headers.get('host')

    // Allow requests with no origin (server-to-server) or matching origin
    // In production, strictly check that origin matches the host
    if (origin && host && !origin.includes(host)) {
      logger.error(`CSRF blocked: Origin ${origin} does not match Host ${host}`)
      return NextResponse.json(
        { error: 'Forbidden - Invalid Origin' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      apiKey,
      apiSecret,
      accessToken,
      accessTokenSecret,
    }: TwitterCredentials = body

    // Validate required fields
    if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
      return NextResponse.json(
        {
          error: 'All Twitter API credentials are required',
          required: ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'],
        },
        { status: 400 }
      )
    }

    // Validate credentials by attempting to fetch user info
    try {
      const client = new TwitterApi({
        appKey: apiKey,
        appSecret: apiSecret,
        accessToken: accessToken,
        accessSecret: accessTokenSecret,
      })

      // Test the credentials by fetching authenticated user
      const { data: twitterUser } = await client.v2.me({
        'user.fields': ['username', 'name', 'id'],
      })

      // Check write permissions by verifying scopes
      // Note: Free tier has write access by default with user context auth

      // Encrypt credentials for secure storage
      const encryptedCredentials = {
        apiKey: encrypt(apiKey),
        apiSecret: encrypt(apiSecret),
        accessToken: encrypt(accessToken),
        accessTokenSecret: encrypt(accessTokenSecret),
      }

      // Create hash for quick validation (stored in oauth_token for consistency)
      const credentialsHash = hash(
        `${apiKey}:${apiSecret}:${accessToken}:${accessTokenSecret}`
      )

      // Upsert platform connection
      const { error: dbError } = await supabase
        .from('platform_connections')
        .upsert(
          {
            user_id: user.id,
            platform: 'twitter',
            oauth_token: credentialsHash, // Hash for quick lookup
            oauth_refresh_token: null, // Not used for Twitter v2 (long-lived tokens)
            token_expires_at: null, // Twitter v2 tokens don't expire (revoke to invalidate)
            is_active: true,
            platform_user_id: twitterUser.id,
            platform_username: twitterUser.username,
            metadata: encryptedCredentials, // Encrypted credentials
            connected_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,platform',
          }
        )

      if (dbError) {
        logger.error(
          { error: dbError },
          'Database error saving Twitter connection:'
        )
        return NextResponse.json(
          { error: 'Failed to save Twitter connection' },
          { status: 500 }
        )
      }

      // Log successful platform connection
      security.platformConnected(
        user.id,
        'twitter',
        twitterUser.id,
        twitterUser.username
      )

      return NextResponse.json({
        success: true,
        platform: 'twitter',
        username: twitterUser.username,
        name: twitterUser.name,
        userId: twitterUser.id,
      })
    } catch (twitterError: unknown) {
      logger.error({ error: twitterError }, 'Twitter API validation error:')

      // Check for specific error types
      if (twitterError instanceof Error) {
        const errorMessage = twitterError.message.toLowerCase()

        if (
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('401')
        ) {
          return NextResponse.json(
            {
              error: 'Invalid Twitter credentials',
              details:
                'The API keys or access tokens you provided are incorrect or do not have the required permissions.',
            },
            { status: 400 }
          )
        }

        if (
          errorMessage.includes('forbidden') ||
          errorMessage.includes('403')
        ) {
          return NextResponse.json(
            {
              error: 'Insufficient permissions',
              details:
                'Your Twitter app does not have write permissions. Make sure you created the app with "Read and Write" permissions.',
            },
            { status: 400 }
          )
        }

        if (errorMessage.includes('rate limit')) {
          return NextResponse.json(
            {
              error: 'Rate limit exceeded',
              details: 'Please wait a few minutes and try again.',
            },
            { status: 429 }
          )
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to validate Twitter credentials',
          details:
            'Unable to connect to Twitter. Please check your credentials and try again.',
        },
        { status: 400 }
      )
    }
  } catch (error) {
    logger.error({ error }, 'Twitter connection error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET: Check Twitter connection status for authenticated user
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: connection } = await supabase
      .from('platform_connections')
      .select('platform_username, platform_user_id, connected_at, is_active')
      .eq('user_id', user.id)
      .eq('platform', 'twitter')
      .single()

    if (!connection) {
      return NextResponse.json({
        connected: false,
      })
    }

    return NextResponse.json({
      connected: true,
      username: connection.platform_username,
      userId: connection.platform_user_id,
      connectedAt: connection.connected_at,
      isActive: connection.is_active,
    })
  } catch (error) {
    logger.error({ error }, 'Error fetching Twitter connection status:')
    return NextResponse.json(
      { error: 'Failed to fetch connection status' },
      { status: 500 }
    )
  }
}

/**
 * DELETE: Disconnect Twitter account
 */
export async function DELETE() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get platform user ID before deletion for logging
    const { data: connection } = await supabase
      .from('platform_connections')
      .select('platform_user_id')
      .eq('user_id', user.id)
      .eq('platform', 'twitter')
      .single()

    const { error: dbError } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'twitter')

    if (dbError) {
      logger.error({ error: dbError }, 'Error disconnecting Twitter:')
      return NextResponse.json(
        { error: 'Failed to disconnect Twitter' },
        { status: 500 }
      )
    }

    // Log platform disconnection
    if (connection?.platform_user_id) {
      security.platformDisconnected(
        user.id,
        'twitter',
        connection.platform_user_id
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Twitter account disconnected',
    })
  } catch (error) {
    logger.error({ error }, 'Error disconnecting Twitter:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
