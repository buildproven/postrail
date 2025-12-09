import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * Facebook OAuth 2.0 Authorization Endpoint
 *
 * Initiates the OAuth flow by redirecting users to Facebook's authorization page.
 * Users will grant permissions, then Facebook redirects back to our callback URL.
 *
 * Required env vars:
 * - FACEBOOK_APP_ID: Your Meta app's App ID
 * - NEXT_PUBLIC_APP_URL: Your app's base URL (e.g., https://postrail.com)
 */

const FACEBOOK_AUTH_URL = 'https://www.facebook.com/v22.0/dialog/oauth'

// Scopes needed for posting to pages
const SCOPES = [
  'pages_show_list', // List pages user manages
  'pages_read_engagement', // Read page engagement
  'pages_manage_posts', // Create and manage posts
  'pages_manage_metadata', // Manage page metadata
  'public_profile', // Basic profile info
].join(',')

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

    const appId = process.env.FACEBOOK_APP_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!appId) {
      return NextResponse.json(
        {
          error:
            'Facebook integration not configured. Missing FACEBOOK_APP_ID.',
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

    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex')

    // Redirect to Facebook authorization
    const response = NextResponse.redirect(
      `${FACEBOOK_AUTH_URL}?` +
        new URLSearchParams({
          client_id: appId,
          redirect_uri: `${appUrl}/api/platforms/facebook/callback`,
          state: state,
          scope: SCOPES,
          response_type: 'code',
        }).toString()
    )

    // Set state cookie (httpOnly, secure, 10 min expiry)
    response.cookies.set('facebook_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    // Store user ID to associate with the connection after callback
    response.cookies.set('facebook_oauth_user', user.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Facebook OAuth initiation error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Facebook OAuth' },
      { status: 500 }
    )
  }
}
