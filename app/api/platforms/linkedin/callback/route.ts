import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encrypt } from '@/lib/crypto'
import { verifyOAuthState } from '@/lib/cookie-signer'
import { logger } from '@/lib/logger'
import { z } from 'zod'

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

const LinkedInTokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string(),
})

const LinkedInUserInfoSchema = z.object({
  sub: z.string(),
  name: z.string(),
  email: z.string().optional(),
  picture: z.string().optional(),
})

const OrganizationElementSchema = z.object({
  organization: z.string(),
  role: z.string(),
  state: z.string(),
})

const OrganizationsResponseSchema = z.object({
  elements: z.array(OrganizationElementSchema),
})

interface LinkedInOrganization {
  id: number
  localizedName: string
  vanityName?: string
}
type OrganizationElement = z.infer<typeof OrganizationElementSchema>

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
      // Sanitize: only log error type, not potentially sensitive descriptions
      logger.error({ errorType: error }, 'LinkedIn OAuth error')
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
    const signedState = request.cookies.get('linkedin_oauth_state')?.value
    const signedUserId = request.cookies.get('linkedin_oauth_user')?.value

    if (!signedState || !signedUserId) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Session expired. Please try again.')}`
      )
    }

    const verification = verifyOAuthState(signedState, signedUserId, state)
    if (!verification.valid || !verification.userId) {
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent(verification.error || 'Invalid state parameter. Please try again.')}`
      )
    }

    const userId = verification.userId

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
      const _errorText = await tokenResponse.text()
      // Sanitize: only log status code, not response body which may contain tokens
      logger.error(
        {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
        },
        'LinkedIn token exchange failed'
      )
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to exchange authorization code')}`
      )
    }

    const tokenJson = await tokenResponse.json()
    const tokenValidation = LinkedInTokenResponseSchema.safeParse(tokenJson)

    if (!tokenValidation.success) {
      logger.error(
        { validationError: tokenValidation.error.message },
        'Invalid LinkedIn token response'
      )
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Invalid response from LinkedIn')}`
      )
    }

    const tokenData = tokenValidation.data

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
      // Sanitize: only log status code, not response body
      logger.error(
        {
          status: userInfoResponse.status,
          statusText: userInfoResponse.statusText,
        },
        'LinkedIn user info request failed'
      )
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Failed to get LinkedIn user info')}`
      )
    }

    const userInfoJson = await userInfoResponse.json()
    const userInfoValidation = LinkedInUserInfoSchema.safeParse(userInfoJson)

    if (!userInfoValidation.success) {
      logger.error(
        { validationError: userInfoValidation.error.message },
        'Invalid LinkedIn user info response'
      )
      return NextResponse.redirect(
        `${appUrl}/dashboard/platforms?error=${encodeURIComponent('Invalid user data from LinkedIn')}`
      )
    }

    const userInfo = userInfoValidation.data

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
      const orgsJson = await orgsResponse.json()
      const orgsValidation = OrganizationsResponseSchema.safeParse(orgsJson)

      if (!orgsValidation.success) {
        logger.warn(
          { validationError: orgsValidation.error.message },
          'Invalid LinkedIn organizations response - skipping orgs'
        )
      } else {
        const orgsData = orgsValidation.data
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
      // Sanitize: only log error message, not full object which may contain metadata
      logger.error(
        {
          error: dbError.message || 'Unknown error',
          code: dbError.code,
        },
        'Database error saving LinkedIn connection'
      )
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
    // Sanitize: only log error message, not full stack which may contain tokens
    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'LinkedIn OAuth callback error'
    )
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    return NextResponse.redirect(
      `${appUrl}/dashboard/platforms?error=${encodeURIComponent('OAuth callback failed')}`
    )
  }
}
