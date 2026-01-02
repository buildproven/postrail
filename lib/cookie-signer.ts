/**
 * Cookie Signer - HMAC-based cookie signing for OAuth state
 *
 * Provides integrity verification for OAuth state cookies to prevent
 * tampering attacks. Uses HMAC-SHA256 with a secret key.
 */

import crypto from 'crypto'
import { logger } from '@/lib/logger'

const COOKIE_SECRET = process.env.COOKIE_SECRET || process.env.ENCRYPTION_KEY

if (!COOKIE_SECRET && process.env.NODE_ENV === 'production') {
  logger.error(
    'CRITICAL: COOKIE_SECRET or ENCRYPTION_KEY must be set for cookie signing'
  )
}

/**
 * Sign a value with HMAC-SHA256
 * Returns format: value.signature
 */
export function signValue(value: string): string {
  if (!COOKIE_SECRET) {
    // In development without secret, return value as-is with warning
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Cookie signing disabled: COOKIE_SECRET not set')
      return value
    }
    throw new Error('COOKIE_SECRET is required for cookie signing')
  }

  const signature = crypto
    .createHmac('sha256', COOKIE_SECRET)
    .update(value)
    .digest('base64url')

  return `${value}.${signature}`
}

/**
 * Verify and extract signed value
 * Returns the original value if signature is valid, null otherwise
 */
export function verifyValue(signedValue: string): string | null {
  if (!COOKIE_SECRET) {
    // In development without secret, return value as-is
    if (process.env.NODE_ENV === 'development') {
      return signedValue
    }
    throw new Error('COOKIE_SECRET is required for cookie verification')
  }

  const lastDotIndex = signedValue.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return null // No signature found
  }

  const value = signedValue.slice(0, lastDotIndex)
  const signature = signedValue.slice(lastDotIndex + 1)

  const expectedSignature = crypto
    .createHmac('sha256', COOKIE_SECRET)
    .update(value)
    .digest('base64url')

  // Constant-time comparison to prevent timing attacks
  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  ) {
    return null
  }

  return value
}

/**
 * Create a signed OAuth state cookie value
 * Includes userId and timestamp for additional security
 */
export function createOAuthState(userId: string): {
  state: string
  signedState: string
  signedUserId: string
} {
  const state = crypto.randomBytes(32).toString('hex')
  const timestamp = Date.now()

  // Include timestamp in state to prevent replay attacks
  const stateWithTimestamp = `${state}.${timestamp}`

  return {
    state,
    signedState: signValue(stateWithTimestamp),
    signedUserId: signValue(userId),
  }
}

/**
 * Verify OAuth state from callback
 * Returns userId if valid, null otherwise
 */
export function verifyOAuthState(
  signedState: string,
  signedUserId: string,
  expectedState: string,
  maxAgeMs: number = 10 * 60 * 1000 // 10 minutes
): { valid: boolean; userId: string | null; error?: string } {
  const stateWithTimestamp = verifyValue(signedState)
  if (!stateWithTimestamp) {
    return { valid: false, userId: null, error: 'Invalid state signature' }
  }

  const [state, timestampStr] = stateWithTimestamp.split('.')
  const timestamp = parseInt(timestampStr, 10)

  if (state !== expectedState) {
    return { valid: false, userId: null, error: 'State mismatch' }
  }

  // Check for replay attacks (state too old)
  if (Date.now() - timestamp > maxAgeMs) {
    return { valid: false, userId: null, error: 'State expired' }
  }

  const userId = verifyValue(signedUserId)
  if (!userId) {
    return { valid: false, userId: null, error: 'Invalid user signature' }
  }

  return { valid: true, userId }
}
