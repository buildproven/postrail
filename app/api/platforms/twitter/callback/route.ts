import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { verifyValue } from '@/lib/cookie-signer'

/**
 * Twitter/X OAuth 2.0 Callback Endpoint
 *
 * Handles the redirect from Twitter after user authorization.
 * Exchanges the authorization code for access tokens using PKCE.
 *
 * Required env vars:
 * - TWITTER_CLIENT_ID: Your Twitter app's Client ID
 * - TWITTER_CLIENT_SECRET: Your Twitter app's Client Secret
 * - NEXT_PUBLIC_APP_URL: Your app's base URL
 */

const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token'

interface TwitterTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

interface TwitterUserResponse {
  data: {
    id: string
    name: string
    username: string
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

    // Handle OAuth errors from Twitter
    if (error) {
      console.error('Twitter OAuth error:', error, errorDescription)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent(errorDescription || error)}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Missing authorization code')}`
      )
    }

    // Validate state parameter with HMAC verification (CSRF protection) - H2 fix
    const signedState = request.cookies.get('twitter_oauth_state')?.value
    const signedVerifier = request.cookies.get('twitter_oauth_verifier')?.value
    const signedUserId = request.cookies.get('twitter_oauth_user')?.value

    if (!signedState || !signedVerifier || !signedUserId) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Session expired. Please try again.')}`
      )
    }

    // Verify signatures
    const storedState = verifyValue(signedState)
    const codeVerifier = verifyValue(signedVerifier)
    const userId = verifyValue(signedUserId)

    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Invalid state parameter. Please try again.')}`
      )
    }

    if (!codeVerifier) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Invalid code verifier. Please try again.')}`
      )
    }

    if (!userId) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Invalid session. Please try again.')}`
      )
    }

    const clientId = process.env.TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Twitter integration not configured')}`
      )
    }

    // Exchange authorization code for access token
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64'
    )

    const tokenResponse = await fetch(TWITTER_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${appUrl}/api/platforms/twitter/callback`,
        code_verifier: codeVerifier,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Twitter token exchange error:', errorText)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to exchange authorization code')}`
      )
    }

    const tokenData: TwitterTokenResponse = await tokenResponse.json()

    // Get user info
    const userResponse = await fetch('https://api.twitter.com/2/users/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error('Twitter user info error:', await userResponse.text())
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to get Twitter user info')}`
      )
    }

    const userData: TwitterUserResponse = await userResponse.json()

    // Calculate token expiry
    const expiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString()

    // Encrypt tokens for storage
    const encryptedCredentials = {
      accessToken: encrypt(tokenData.access_token),
      refreshToken: tokenData.refresh_token
        ? encrypt(tokenData.refresh_token)
        : null,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
    }

    // Store in database
    const supabase = await createClient()

    const { error: dbError } = await supabase
      .from('platform_connections')
      .upsert(
        {
          user_id: userId,
          platform: 'twitter',
          oauth_token: encrypt(tokenData.access_token),
          oauth_refresh_token: tokenData.refresh_token
            ? encrypt(tokenData.refresh_token)
            : null,
          token_expires_at: expiresAt,
          is_active: true,
          platform_user_id: userData.data.id,
          platform_username: userData.data.username,
          metadata: encryptedCredentials,
          connected_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,platform',
        }
      )

    if (dbError) {
      console.error('Database error saving Twitter connection:', dbError)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to save Twitter connection')}`
      )
    }

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      `${appUrl}/dashboard/platforms?success=twitter`
    )
    response.cookies.delete('twitter_oauth_state')
    response.cookies.delete('twitter_oauth_verifier')
    response.cookies.delete('twitter_oauth_user')

    return response
  } catch (error) {
    console.error('Twitter OAuth callback error:', error)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    return NextResponse.redirect(
      `${appUrl}/dashboard/platforms?error=${encodeURIComponent('OAuth callback failed')}`
    )
  }
}
