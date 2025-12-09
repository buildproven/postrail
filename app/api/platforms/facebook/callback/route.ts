import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

/**
 * Facebook OAuth 2.0 Callback Endpoint
 *
 * Handles the redirect from Facebook after user authorization.
 * Exchanges the authorization code for access tokens, gets page tokens, and stores them.
 *
 * Required env vars:
 * - FACEBOOK_APP_ID: Your Meta app's App ID
 * - FACEBOOK_APP_SECRET: Your Meta app's App Secret
 * - NEXT_PUBLIC_APP_URL: Your app's base URL
 */

interface FacebookTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

interface FacebookPage {
  id: string
  name: string
  access_token: string
  category?: string
}

interface FacebookPagesResponse {
  data: FacebookPage[]
}

interface FacebookUserInfo {
  id: string
  name: string
  email?: string
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

    // Handle OAuth errors from Facebook
    if (error) {
      console.error('Facebook OAuth error:', error, errorDescription)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent(errorDescription || error)}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Missing authorization code')}`
      )
    }

    // Validate state parameter (CSRF protection)
    const storedState = request.cookies.get('facebook_oauth_state')?.value
    const userId = request.cookies.get('facebook_oauth_user')?.value

    if (!storedState || storedState !== state) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Invalid state parameter. Please try again.')}`
      )
    }

    if (!userId) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Session expired. Please try again.')}`
      )
    }

    const appId = process.env.FACEBOOK_APP_ID
    const appSecret = process.env.FACEBOOK_APP_SECRET

    if (!appId || !appSecret) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Facebook integration not configured')}`
      )
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?` +
        new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: `${appUrl}/api/platforms/facebook/callback`,
          code: code,
        }).toString()
    )

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Facebook token exchange error:', errorText)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to exchange authorization code')}`
      )
    }

    const tokenData: FacebookTokenResponse = await tokenResponse.json()

    // Exchange for long-lived token (lasts ~60 days instead of ~1 hour)
    const longLivedTokenResponse = await fetch(
      `https://graph.facebook.com/v22.0/oauth/access_token?` +
        new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: tokenData.access_token,
        }).toString()
    )

    let longLivedToken = tokenData.access_token
    let expiresIn = tokenData.expires_in || 3600

    if (longLivedTokenResponse.ok) {
      const longLivedData: FacebookTokenResponse =
        await longLivedTokenResponse.json()
      longLivedToken = longLivedData.access_token
      expiresIn = longLivedData.expires_in || 5184000 // ~60 days
    }

    // Get user info
    const userInfoResponse = await fetch(
      `https://graph.facebook.com/v22.0/me?fields=id,name,email&access_token=${longLivedToken}`
    )

    if (!userInfoResponse.ok) {
      console.error('Facebook userinfo error:', await userInfoResponse.text())
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to get Facebook user info')}`
      )
    }

    const _userInfo: FacebookUserInfo = await userInfoResponse.json()

    // Get pages the user manages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,category&access_token=${longLivedToken}`
    )

    let pages: FacebookPage[] = []
    let selectedPage: FacebookPage | null = null

    if (pagesResponse.ok) {
      const pagesData: FacebookPagesResponse = await pagesResponse.json()
      pages = pagesData.data || []

      // Auto-select first page (user can change later)
      if (pages.length > 0) {
        selectedPage = pages[0]
      }
    }

    if (!selectedPage) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('No Facebook Pages found. You need to be an admin of at least one Facebook Page.')}`
      )
    }

    // Calculate token expiry
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // Encrypt tokens for storage
    const encryptedCredentials = {
      userAccessToken: encrypt(longLivedToken),
      pageAccessToken: encrypt(selectedPage.access_token),
      pageId: selectedPage.id,
      pageName: selectedPage.name,
      allPages: pages.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
      })),
    }

    // Store in database
    const supabase = await createClient()

    const { error: dbError } = await supabase
      .from('platform_connections')
      .upsert(
        {
          user_id: userId,
          platform: 'facebook',
          oauth_token: encrypt(selectedPage.access_token), // Page access token (encrypted)
          oauth_refresh_token: encrypt(longLivedToken), // User token for refreshing
          token_expires_at: expiresAt,
          is_active: true,
          platform_user_id: selectedPage.id, // Page ID
          platform_username: selectedPage.name, // Page name
          metadata: encryptedCredentials,
          connected_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,platform',
        }
      )

    if (dbError) {
      console.error('Database error saving Facebook connection:', dbError)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to save Facebook connection')}`
      )
    }

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      `${appUrl}/dashboard/platforms?success=facebook`
    )
    response.cookies.delete('facebook_oauth_state')
    response.cookies.delete('facebook_oauth_user')

    return response
  } catch (error) {
    console.error('Facebook OAuth callback error:', error)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    return NextResponse.redirect(
      `${appUrl}/dashboard/platforms?error=${encodeURIComponent('OAuth callback failed')}`
    )
  }
}
