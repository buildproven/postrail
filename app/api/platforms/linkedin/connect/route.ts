import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt, hash } from '@/lib/crypto'
import { logger } from '@/lib/logger'

/**
 * LinkedIn BYOK Connection Endpoint
 *
 * Users provide their LinkedIn Page access token and organization ID:
 * - Access Token (from LinkedIn Developer Portal)
 * - Organization ID (Company Page ID)
 *
 * This allows posting to LinkedIn Company Pages using the Marketing API.
 * Requires "Share on LinkedIn" and "w_member_social" or "w_organization_social" permissions.
 */

interface LinkedInCredentials {
  accessToken: string
  organizationId?: string // LinkedIn Company Page ID (urn:li:organization:XXXX) - optional
}

interface LinkedInUserInfo {
  sub: string
  name: string
  email?: string
}

interface LinkedInOrganization {
  id: number
  localizedName: string
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
    const { accessToken, organizationId }: LinkedInCredentials = body

    // Validate required fields
    if (!accessToken) {
      return NextResponse.json(
        {
          error: 'LinkedIn access token is required',
          required: ['accessToken'],
        },
        { status: 400 }
      )
    }

    // Validate credentials by attempting to fetch user info
    try {
      // First, verify the access token by getting user info
      const userInfoResponse = await fetch(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text()
        logger.error({ error: errorText }, 'LinkedIn userinfo error:')
        throw new Error(`LinkedIn API error: ${userInfoResponse.status}`)
      }

      const userInfo: LinkedInUserInfo = await userInfoResponse.json()

      let orgId: string | undefined
      let orgName: string | undefined

      // If organizationId provided, verify access
      if (organizationId) {
        orgId = organizationId.replace('urn:li:organization:', '')
        const orgResponse = await fetch(
          `https://api.linkedin.com/v2/organizations/${orgId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          }
        )

        if (!orgResponse.ok) {
          const errorText = await orgResponse.text()
          logger.error({ error: errorText }, 'LinkedIn organization error:')
          return NextResponse.json(
            {
              error: 'Invalid organization ID or insufficient permissions',
              details:
                'Make sure you have admin access to the LinkedIn Company Page and the correct organization ID.',
            },
            { status: 400 }
          )
        }

        const orgInfo: LinkedInOrganization = await orgResponse.json()
        orgName = orgInfo.localizedName
      }

      // Encrypt credentials for secure storage
      const encryptedCredentials = {
        accessToken: encrypt(accessToken),
        organizationId: orgId,
      }

      // Create hash for quick validation
      const credentialsHash = hash(`${accessToken}:${orgId || 'personal'}`)

      // Upsert platform connection
      const { error: dbError } = await supabase
        .from('platform_connections')
        .upsert(
          {
            user_id: user.id,
            platform: 'linkedin',
            oauth_token: credentialsHash,
            oauth_refresh_token: null,
            token_expires_at: null, // LinkedIn tokens expire in 60 days, user should refresh manually
            is_active: true,
            platform_user_id: userInfo.sub,
            platform_username: orgName || userInfo.name,
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
          'Database error saving LinkedIn connection:'
        )
        return NextResponse.json(
          { error: 'Failed to save LinkedIn connection' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        platform: 'linkedin',
        organizationName: orgName,
        organizationId: orgId,
        userName: userInfo.name,
        username: orgName || userInfo.name,
      })
    } catch (linkedinError: unknown) {
      logger.error({ error: linkedinError }, 'LinkedIn API validation error:')

      if (linkedinError instanceof Error) {
        const errorMessage = linkedinError.message.toLowerCase()

        if (
          errorMessage.includes('401') ||
          errorMessage.includes('unauthorized')
        ) {
          return NextResponse.json(
            {
              error: 'Invalid LinkedIn credentials',
              details:
                'The access token is invalid or has expired. Please generate a new one.',
            },
            { status: 400 }
          )
        }

        if (
          errorMessage.includes('403') ||
          errorMessage.includes('forbidden')
        ) {
          return NextResponse.json(
            {
              error: 'Insufficient permissions',
              details:
                'Your LinkedIn app needs "Share on LinkedIn" and organization permissions enabled.',
            },
            { status: 400 }
          )
        }
      }

      return NextResponse.json(
        {
          error: 'Failed to validate LinkedIn credentials',
          details:
            'Unable to connect to LinkedIn. Please check your credentials and try again.',
        },
        { status: 400 }
      )
    }
  } catch (error) {
    logger.error({ error }, 'LinkedIn connection error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET: Check LinkedIn connection status for authenticated user
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
      .eq('platform', 'linkedin')
      .single()

    if (!connection) {
      return NextResponse.json({
        connected: false,
      })
    }

    const metadata = connection.metadata as { organizationId?: string }

    return NextResponse.json({
      connected: true,
      organizationName: connection.platform_username,
      organizationId: metadata?.organizationId,
      connectedAt: connection.connected_at,
      isActive: connection.is_active,
    })
  } catch (error) {
    logger.error({ error }, 'Error fetching LinkedIn connection status:')
    return NextResponse.json(
      { error: 'Failed to fetch connection status' },
      { status: 500 }
    )
  }
}

/**
 * DELETE: Disconnect LinkedIn account
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
      .eq('platform', 'linkedin')

    if (dbError) {
      logger.error({ error: dbError }, 'Error disconnecting LinkedIn:')
      return NextResponse.json(
        { error: 'Failed to disconnect LinkedIn' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'LinkedIn account disconnected',
    })
  } catch (error) {
    logger.error({ error }, 'Error disconnecting LinkedIn:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
