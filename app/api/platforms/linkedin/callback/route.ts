import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'

/**
 * LinkedIn OAuth 2.0 Callback Endpoint
 *
 * Handles the redirect from LinkedIn after user authorization.
 * Exchanges the authorization code for access tokens and stores them.
 *
 * Required env vars:
 * - LINKEDIN_CLIENT_ID: Your LinkedIn app's Client ID
 * - LINKEDIN_CLIENT_SECRET: Your LinkedIn app's Client Secret
 * - NEXT_PUBLIC_APP_URL: Your app's base URL
 */

const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'

interface LinkedInTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope: string
}

interface LinkedInUserInfo {
  sub: string
  name: string
  email?: string
  picture?: string
}

interface LinkedInOrganization {
  id: number
  localizedName: string
  vanityName?: string
}

interface OrganizationElement {
  organization: string
  role: string
  state: string
}

interface OrganizationsResponse {
  elements: OrganizationElement[]
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''

    // Handle OAuth errors from LinkedIn
    if (error) {
      console.error('LinkedIn OAuth error:', error, errorDescription)
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
    const storedState = request.cookies.get('linkedin_oauth_state')?.value
    const userId = request.cookies.get('linkedin_oauth_user')?.value

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

    const clientId = process.env.LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('LinkedIn integration not configured')}`
      )
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch(LINKEDIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/platforms/linkedin/callback`,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('LinkedIn token exchange error:', errorText)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to exchange authorization code')}`
      )
    }

    const tokenData: LinkedInTokenResponse = await tokenResponse.json()

    // Get user info
    const userInfoResponse = await fetch(
      'https://api.linkedin.com/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    )

    if (!userInfoResponse.ok) {
      console.error('LinkedIn userinfo error:', await userInfoResponse.text())
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to get LinkedIn user info')}`
      )
    }

    const userInfo: LinkedInUserInfo = await userInfoResponse.json()

    // Get organizations (company pages) the user can manage
    const orgsResponse = await fetch(
      'https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,vanityName)))',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      }
    )

    let organizations: LinkedInOrganization[] = []
    if (orgsResponse.ok) {
      const orgsData: OrganizationsResponse = await orgsResponse.json()
      // Extract organization details from the response
      organizations =
        orgsData.elements?.map((elem: OrganizationElement) => {
          const orgUrn = elem.organization
          const orgId = orgUrn.replace('urn:li:organization:', '')
          return {
            id: parseInt(orgId),
            localizedName: orgId, // Will be updated if we can fetch org details
          }
        }) || []
    }

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
      organizations: organizations,
    }

    // Store in database
    const supabase = await createClient()

    const { error: dbError } = await supabase
      .from('platform_connections')
      .upsert(
        {
          user_id: userId,
          platform: 'linkedin',
          oauth_token: encrypt(tokenData.access_token), // Encrypted access token
          oauth_refresh_token: tokenData.refresh_token
            ? encrypt(tokenData.refresh_token)
            : null,
          token_expires_at: expiresAt,
          is_active: true,
          platform_user_id: userInfo.sub,
          platform_username: userInfo.name,
          metadata: encryptedCredentials,
          connected_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,platform',
        }
      )

    if (dbError) {
      console.error('Database error saving LinkedIn connection:', dbError)
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to save LinkedIn connection')}`
      )
    }

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      `${appUrl}/dashboard/platforms?success=linkedin`
    )
    response.cookies.delete('linkedin_oauth_state')
    response.cookies.delete('linkedin_oauth_user')

    return response
  } catch (error) {
    console.error('LinkedIn OAuth callback error:', error)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    return NextResponse.redirect(
      `${appUrl}/dashboard/platforms?error=${encodeURIComponent('OAuth callback failed')}`
    )
  }
}
