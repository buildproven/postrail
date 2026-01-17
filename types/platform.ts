/**
 * L7: Shared Platform Types
 *
 * Common type definitions for social media platforms used across the application
 */

/**
 * Supported social media platforms
 */
export type Platform = 'twitter' | 'linkedin' | 'facebook' | 'threads'

/**
 * Platform-specific character limits
 */
export const PLATFORM_CHAR_LIMITS: Record<Platform, number> = {
  twitter: 280,
  threads: 500,
  linkedin: 3000,
  facebook: 63206,
} as const

/**
 * Platform display names
 */
export const PLATFORM_NAMES: Record<Platform, string> = {
  twitter: 'Twitter / X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  threads: 'Threads',
} as const

/**
 * Platform connection metadata
 * Unified interface for OAuth and BYOK credentials
 */
export interface PlatformConnectionMetadata {
  // OAuth 2.0 fields (Twitter, LinkedIn, Facebook)
  accessToken?: string
  refreshToken?: string | null
  tokenType?: string
  scope?: string
  expiresAt?: string

  // BYOK fields (legacy Twitter)
  apiKey?: string
  apiSecret?: string
  accessTokenSecret?: string

  // Platform-specific fields
  [key: string]: unknown
}
