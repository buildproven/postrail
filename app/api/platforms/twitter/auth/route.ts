import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { signValue } from '@/lib/cookie-signer'

/**
 * Twitter/X OAuth 2.0 Authorization Endpoint (PKCE Flow)
 *
 * Initiates the OAuth flow by redirecting users to Twitter's authorization page.
 * Uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) for security.
 *
 * Required env vars:
 * - TWITTER_CLIENT_ID: Your Twitter app's Client ID (OAuth 2.0)
 * - NEXT_PUBLIC_APP_URL: Your app's base URL
 */

const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize'

// Scopes needed for posting tweets
const SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'offline.access', // For refresh tokens
].join(' ')

// Generate PKCE code verifier and challenge
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url')
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')
  return { codeVerifier, codeChallenge }
}

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

    const clientId = process.env.TWITTER_CLIENT_ID
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!clientId) {
      return NextResponse.json(
        {
          error:
            'Twitter integration not configured. Missing TWITTER_CLIENT_ID.',
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

    // Generate PKCE parameters
    const { codeVerifier, codeChallenge } = generatePKCE()

    // Build authorization URL
    const authUrl = new URL(TWITTER_AUTH_URL)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set(
      'redirect_uri',
      `${appUrl}/api/platforms/twitter/callback`
    )
    authUrl.searchParams.set('scope', SCOPES)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')

    const response = NextResponse.redirect(authUrl.toString())

    // Set cookies for validation in callback (httpOnly, secure, 10 min expiry)
    // H2 fix: Sign sensitive cookies with HMAC
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge: 600, // 10 minutes
      path: '/',
    }

    response.cookies.set('twitter_oauth_state', signValue(state), cookieOptions)
    response.cookies.set(
      'twitter_oauth_verifier',
      signValue(codeVerifier),
      cookieOptions
    )
    response.cookies.set(
      'twitter_oauth_user',
      signValue(user.id),
      cookieOptions
    )

    return response
  } catch (error) {
    console.error('Twitter OAuth initiation error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Twitter OAuth' },
      { status: 500 }
    )
  }
}
