import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt, hash } from '@/lib/crypto'
import { logger } from '@/lib/logger'

/**
 * Facebook BYOK Connection Endpoint
 *
 * Users provide their Facebook Page access token and Page ID:
 * - Page Access Token (from Facebook Graph API)
 * - Page ID (Facebook Page ID)
 *
 * This allows posting to Facebook Pages using the Graph API.
 * Requires pages_manage_posts and pages_read_engagement permissions.
 */

interface FacebookCredentials {
  pageAccessToken: string
  pageId: string
}

interface FacebookPageInfo {
  id: string
  name: string
  access_token?: string
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

    if (origin && host && !origin.includes(host)) {
      logger.error(`CSRF blocked: Origin ${origin} does not match Host ${host}`)
      return NextResponse.json(
        { error: 'Forbidden - Invalid Origin' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { pageAccessToken, pageId }: FacebookCredentials = body

    // Validate required fields
    if (!pageAccessToken || !pageId) {
      return NextResponse.json(
        {
          error: 'Facebook page access token and page ID are required',
          required: ['pageAccessToken', 'pageId'],
        },
        { status: 400 }
      )
    }

    // Validate credentials by attempting to fetch page info
    try {
      // Verify the page access token and get page info
      const pageResponse = await fetch(
        `https://graph.facebook.com/v22.0/${pageId}?fields=id,name,access_token&access_token=${pageAccessToken}`
      )

      if (!pageResponse.ok) {
        const errorData = await pageResponse.json()
        logger.error({ error: errorData }, 'Facebook page error:')

        if (errorData.error?.code === 190) {
          return NextResponse.json(
            {
              error: 'Invalid or expired access token',
              details:
                'The page access token is invalid or has expired. Please generate a new one.',
            },
            { status: 400 }
          )
        }

        throw new Error(`Facebook API error: ${pageResponse.status}`)
      }

      const pageInfo: FacebookPageInfo = await pageResponse.json()

      // Verify we can post to this page by checking permissions
      const permissionsResponse = await fetch(
        `https://graph.facebook.com/v22.0/${pageId}/permissions?access_token=${pageAccessToken}`
      )

      if (!permissionsResponse.ok) {
        logger.warn('Could not verify page permissions, proceeding anyway')
      }

      // Encrypt credentials for secure storage
      const encryptedCredentials = {
        pageAccessToken: encrypt(pageAccessToken),
        pageId: pageId,
      }

      // Create hash for quick validation
      const credentialsHash = hash(`${pageAccessToken}:${pageId}`)

      // Upsert platform connection
      const { error: dbError } = await supabase
        .from('platform_connections')
        .upsert(
          {
            user_id: user.id,
            platform: 'facebook',
            oauth_token: credentialsHash,
            oauth_refresh_token: null,
            token_expires_at: null, // Long-lived tokens last ~60 days
            is_active: true,
            platform_user_id: pageInfo.id,
            platform_username: pageInfo.name,
            metadata: encryptedCredentials,
            connected_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,platform',
          }
        )

      if (dbError) {
        logger.error(
          { error: dbError },
          'Database error saving Facebook connection:'
        )
        return NextResponse.json(
          { error: 'Failed to save Facebook connection' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        platform: 'facebook',
        pageName: pageInfo.name,
        pageId: pageInfo.id,
      })
    } catch (facebookError: unknown) {
      logger.error({ error: facebookError }, 'Facebook API validation error:')

      if (facebookError instanceof Error) {
        const errorMessage = facebookError.message.toLowerCase()

        if (errorMessage.includes('190') || errorMessage.includes('invalid')) {
          return NextResponse.json(
            {
              error: 'Invalid Facebook credentials',
              details:
                'The access token is invalid or has expired. Please generate a new one.',
            },
            { status: 400 }
          )
        }

        if (
          errorMessage.includes('200') ||
          errorMessage.includes('permission')
        ) {
          return NextResponse.json(
            {
              error: 'Insufficient permissions',
              details:
                'Your Facebook app needs pages_manage_posts permission enabled.',
            },
            { status: 400 }
          )
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to validate Facebook credentials',
          details:
            'Unable to connect to Facebook. Please check your credentials and try again.',
        },
        { status: 400 }
      )
    }
  } catch (error) {
    logger.error({ error }, 'Facebook connection error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET: Check Facebook connection status for authenticated user
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
      .select(
        'platform_username, platform_user_id, connected_at, is_active, metadata'
      )
      .eq('user_id', user.id)
      .eq('platform', 'facebook')
      .single()

    if (!connection) {
      return NextResponse.json({
        connected: false,
      })
    }

    const metadata = connection.metadata as { pageId?: string }

    return NextResponse.json({
      connected: true,
      pageName: connection.platform_username,
      pageId: metadata?.pageId || connection.platform_user_id,
      connectedAt: connection.connected_at,
      isActive: connection.is_active,
    })
  } catch (error) {
    logger.error({ error }, 'Error fetching Facebook connection status:')
    return NextResponse.json(
      { error: 'Failed to fetch connection status' },
      { status: 500 }
    )
  }
}

/**
 * DELETE: Disconnect Facebook account
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

    const { error: dbError } = await supabase
      .from('platform_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'facebook')

    if (dbError) {
      logger.error({ error: dbError }, 'Error disconnecting Facebook:')
      return NextResponse.json(
        { error: 'Failed to disconnect Facebook' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Facebook page disconnected',
    })
  } catch (error) {
    logger.error({ error }, 'Error disconnecting Facebook:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
