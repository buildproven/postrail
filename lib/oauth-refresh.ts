/**
 * OAuth Token Refresh Utility
 *
 * VBL5: OWASP A07 - Identification and Authentication Failures
 * Handles automatic token refresh for Twitter, LinkedIn, and Facebook OAuth connections
 */

import { createClient } from '@/lib/supabase/server'
import { encrypt, decrypt } from '@/lib/crypto'
import { logger } from '@/lib/logger'
import { z } from 'zod'

/**
 * Check if a token is expired or will expire soon (within 5 minutes)
 */
export function isTokenExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true

  const expiryTime = new Date(expiresAt).getTime()
  const now = Date.now()
  const fiveMinutes = 5 * 60 * 1000

  return expiryTime - now < fiveMinutes
}

const TwitterRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  token_type: z.string(),
  scope: z.string(),
})

/**
 * Refresh Twitter OAuth token
 */
export async function refreshTwitterToken(
  userId: string,
  refreshToken: string
): Promise<{
  accessToken: string
  refreshToken?: string
  expiresAt: string
}> {
  const clientId = process.env.TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Twitter OAuth credentials not configured')
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  )

  try {
    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
      }).toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error({
        type: 'oauth.refresh.failed',
        platform: 'twitter',
        userId,
        status: response.status,
        error: errorText,
        msg: 'Twitter token refresh failed',
      })
      throw new Error(
        `Twitter token refresh failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    const validation = TwitterRefreshResponseSchema.safeParse(data)

    if (!validation.success) {
      logger.error({
        type: 'oauth.refresh.invalid_response',
        platform: 'twitter',
        userId,
        error: validation.error.message,
        msg: 'Invalid Twitter token refresh response',
      })
      throw new Error('Invalid Twitter token refresh response')
    }

    const tokenData = validation.data
    const expiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString()

    logger.info({
      type: 'oauth.refresh.success',
      platform: 'twitter',
      userId,
      msg: 'Twitter token refreshed successfully',
    })

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
    }
  } catch (error) {
    logger.error({
      type: 'oauth.refresh.error',
      platform: 'twitter',
      userId,
      error: String(error),
      msg: 'Twitter token refresh error',
    })
    throw error
  }
}

const LinkedInRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  refresh_token_expires_in: z.number().optional(),
})

/**
 * Refresh LinkedIn OAuth token
 */
export async function refreshLinkedInToken(
  userId: string,
  refreshToken: string
): Promise<{
  accessToken: string
  refreshToken?: string
  expiresAt: string
}> {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('LinkedIn OAuth credentials not configured')
  }

  try {
    const response = await fetch(
      'https://www.linkedin.com/oauth/v2/accessToken',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }).toString(),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.error({
        type: 'oauth.refresh.failed',
        platform: 'linkedin',
        userId,
        status: response.status,
        error: errorText,
        msg: 'LinkedIn token refresh failed',
      })
      throw new Error(
        `LinkedIn token refresh failed: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    const validation = LinkedInRefreshResponseSchema.safeParse(data)

    if (!validation.success) {
      logger.error({
        type: 'oauth.refresh.invalid_response',
        platform: 'linkedin',
        userId,
        error: validation.error.message,
        msg: 'Invalid LinkedIn token refresh response',
      })
      throw new Error('Invalid LinkedIn token refresh response')
    }

    const tokenData = validation.data
    const expiresAt = new Date(
      Date.now() + tokenData.expires_in * 1000
    ).toISOString()

    logger.info({
      type: 'oauth.refresh.success',
      platform: 'linkedin',
      userId,
      msg: 'LinkedIn token refreshed successfully',
    })

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt,
    }
  } catch (error) {
    logger.error({
      type: 'oauth.refresh.error',
      platform: 'linkedin',
      userId,
      error: String(error),
      msg: 'LinkedIn token refresh error',
    })
    throw error
  }
}

const FacebookRefreshResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number().optional(),
})

/**
 * Refresh Facebook long-lived page access token
 */
export async function refreshFacebookToken(
  userId: string,
  userToken: string
): Promise<{
  accessToken: string
  expiresAt: string
}> {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET

  if (!appId || !appSecret) {
    throw new Error('Facebook OAuth credentials not configured')
  }

  try {
    // Step 1: Exchange short-lived user token for long-lived user token
    const userTokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: userToken,
      }).toString()}`
    )

    if (!userTokenResponse.ok) {
      const errorText = await userTokenResponse.text()
      logger.error({
        type: 'oauth.refresh.failed',
        platform: 'facebook',
        userId,
        status: userTokenResponse.status,
        error: errorText,
        msg: 'Facebook user token exchange failed',
      })
      throw new Error(
        `Facebook user token exchange failed: ${userTokenResponse.status}`
      )
    }

    const userData = await userTokenResponse.json()
    const userValidation = FacebookRefreshResponseSchema.safeParse(userData)

    if (!userValidation.success) {
      logger.error({
        type: 'oauth.refresh.invalid_response',
        platform: 'facebook',
        userId,
        error: userValidation.error.message,
        msg: 'Invalid Facebook user token response',
      })
      throw new Error('Invalid Facebook user token response')
    }

    const longLivedUserToken = userValidation.data.access_token

    // Step 2: Get page access token (long-lived)
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}`
    )

    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text()
      logger.error({
        type: 'oauth.refresh.failed',
        platform: 'facebook',
        userId,
        status: pagesResponse.status,
        error: errorText,
        msg: 'Facebook pages request failed',
      })
      throw new Error(`Facebook pages request failed: ${pagesResponse.status}`)
    }

    const pagesData = await pagesResponse.json()

    if (!pagesData.data || pagesData.data.length === 0) {
      logger.error({
        type: 'oauth.refresh.no_pages',
        platform: 'facebook',
        userId,
        msg: 'No Facebook pages found for user',
      })
      throw new Error('No Facebook pages found')
    }

    // Use the first page's token (in production, you'd match the stored page ID)
    const pageToken = pagesData.data[0].access_token

    // Facebook page tokens don't expire, but we set a far future date
    const expiresAt = new Date(
      Date.now() + 60 * 24 * 60 * 60 * 1000
    ).toISOString() // 60 days

    logger.info({
      type: 'oauth.refresh.success',
      platform: 'facebook',
      userId,
      msg: 'Facebook token refreshed successfully',
    })

    return {
      accessToken: pageToken,
      expiresAt,
    }
  } catch (error) {
    logger.error({
      type: 'oauth.refresh.error',
      platform: 'facebook',
      userId,
      error: String(error),
      msg: 'Facebook token refresh error',
    })
    throw error
  }
}

/**
 * Validate and refresh OAuth token if expired
 *
 * This function checks if a token is expired and automatically refreshes it if needed.
 * Returns the (potentially refreshed) access token ready for use.
 *
 * @param userId - User ID
 * @param platform - Platform name (twitter, linkedin, facebook)
 * @returns Decrypted access token ready for API calls
 */
export async function getValidAccessToken(
  userId: string,
  platform: 'twitter' | 'linkedin' | 'facebook'
): Promise<string> {
  const supabase = await createClient()

  // Fetch connection data
  const { data: connection, error } = await supabase
    .from('platform_connections')
    .select('oauth_token, oauth_refresh_token, token_expires_at, is_active')
    .eq('user_id', userId)
    .eq('platform', platform)
    .single()

  if (error || !connection) {
    throw new Error(`${platform} account not connected`)
  }

  if (!connection.is_active) {
    throw new Error(
      `${platform} connection is inactive. Please reconnect your account.`
    )
  }

  // Check if token is expired
  if (!isTokenExpired(connection.token_expires_at)) {
    // Token is still valid, return it
    return decrypt(connection.oauth_token)
  }

  // Token expired, attempt refresh
  if (!connection.oauth_refresh_token) {
    logger.error({
      type: 'oauth.refresh.no_refresh_token',
      platform,
      userId,
      msg: `${platform} refresh token not found`,
    })
    throw new Error(
      `${platform} token expired and no refresh token available. Please reconnect your account.`
    )
  }

  const refreshToken = decrypt(connection.oauth_refresh_token)

  try {
    // Refresh token based on platform
    let refreshData:
      | { accessToken: string; refreshToken?: string; expiresAt: string }
      | { accessToken: string; expiresAt: string }

    switch (platform) {
      case 'twitter':
        refreshData = await refreshTwitterToken(userId, refreshToken)
        break
      case 'linkedin':
        refreshData = await refreshLinkedInToken(userId, refreshToken)
        break
      case 'facebook':
        refreshData = await refreshFacebookToken(userId, refreshToken)
        break
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }

    // Update database with new tokens
    const updateData: {
      oauth_token: string
      token_expires_at: string
      oauth_refresh_token?: string
    } = {
      oauth_token: encrypt(refreshData.accessToken),
      token_expires_at: refreshData.expiresAt,
    }

    // Update refresh token if provided (Twitter and LinkedIn may rotate it)
    if ('refreshToken' in refreshData && refreshData.refreshToken) {
      updateData.oauth_refresh_token = encrypt(refreshData.refreshToken)
    }

    const { error: updateError } = await supabase
      .from('platform_connections')
      .update(updateData)
      .eq('user_id', userId)
      .eq('platform', platform)

    if (updateError) {
      logger.error({
        type: 'oauth.refresh.db_update_failed',
        platform,
        userId,
        error: updateError.message,
        msg: `Failed to save refreshed ${platform} token`,
      })
      // Continue with refreshed token even if DB update fails
    }

    return refreshData.accessToken
  } catch (refreshError) {
    // Mark connection as inactive if refresh fails
    await supabase
      .from('platform_connections')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('platform', platform)

    logger.error({
      type: 'oauth.refresh.fatal',
      platform,
      userId,
      error: String(refreshError),
      msg: `${platform} token refresh failed, connection marked inactive`,
    })

    throw new Error(
      `${platform} token expired and refresh failed. Please reconnect your account.`
    )
  }
}
