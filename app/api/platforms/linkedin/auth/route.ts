import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createOAuthState } from '@/lib/cookie-signer'
import { logger } from '@/lib/logger'

/**
 * LinkedIn OAuth 2.0 Authorization Endpoint
 *
 * Initiates the OAuth flow by redirecting users to LinkedIn's authorization page.
 * Users will grant permissions, then LinkedIn redirects back to our callback URL.
 *
 * Required env vars:
 * - LINKEDIN_CLIENT_ID: Your LinkedIn app's Client ID
 * - NEXT_PUBLIC_APP_URL: Your app's base URL (e.g., https://postrail.com)
 */

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'

// Scopes needed for posting to company pages
const SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social', // Post as member
  'w_organization_social', // Post as organization (company page)
  'r_organization_social', // Read organization posts
].join(' ')

export async function GET() {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clientId = process.env.LINKEDIN_CLIENT_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!clientId) {
      return NextResponse.json(
        {
          error:
            'LinkedIn integration not configured. Missing LINKEDIN_CLIENT_ID.',
        },
        { status: 500 }
      )
    }

    if (!appUrl) {
      return NextResponse.json(
        { error: 'App URL not configured. Missing NEXT_PUBLIC_APP_URL.' },
        { status: 500 }
      )
    }

    // Generate signed state parameter for CSRF protection (H2 fix)
    const { state, signedState, signedUserId } = createOAuthState(user.id)

    // Store state in a cookie for validation in callback
    const response = NextResponse.redirect(
      `${LINKEDIN_AUTH_URL}?` +
        new URLSearchParams({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: `${appUrl}/api/platforms/linkedin/callback`,
          state: state,
          scope: SCOPES,
        }).toString()
    )

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 600, // 10 minutes
      path: '/',
    }

    // Set signed state cookie (HMAC-protected)
    response.cookies.set('linkedin_oauth_state', signedState, cookieOptions)

    // Store signed user ID to associate with the connection after callback
    response.cookies.set('linkedin_oauth_user', signedUserId, cookieOptions)

    return response
  } catch (error) {
    logger.error({ error }, 'LinkedIn OAuth initiation error:')
    return NextResponse.json(
      { error: 'Failed to initiate LinkedIn OAuth' },
      { status: 500 }
    )
  }
}
