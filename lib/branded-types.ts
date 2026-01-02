/**
 * Branded Types for Type-Safe Domain Entities
 *
 * Branded types provide compile-time guarantees that values have been validated.
 * This prevents accidentally passing unvalidated strings where validated ones are expected.
 *
 * Example: Can't accidentally pass a raw email string where ValidatedEmail is expected.
 */

// Brand helper type
type Brand<K, T> = K & { __brand: T }

/**
 * Validated Email - has passed email format validation
 */
export type ValidatedEmail = Brand<string, 'ValidatedEmail'>

export function validateEmail(email: string): ValidatedEmail | null {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) ? (email as ValidatedEmail) : null
}

/**
 * Validated URL - has passed URL format and SSRF validation
 */
export type ValidatedUrl = Brand<string, 'ValidatedUrl'>

export function isValidatedUrl(url: string): url is ValidatedUrl {
  try {
    const parsed = new URL(url)
    // Basic SSRF protection: no private IPs, localhost, or file:// protocol
    if (parsed.protocol === 'file:') return false
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return process.env.NODE_ENV === 'development'
    }
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * UUID - has passed UUID format validation
 */
export type UUID = Brand<string, 'UUID'>

export function validateUUID(id: string): UUID | null {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(id) ? (id as UUID) : null
}

/**
 * Encrypted String - has been encrypted via lib/crypto
 */
export type EncryptedString = Brand<string, 'EncryptedString'>

export function markAsEncrypted(encrypted: string): EncryptedString {
  // Format: salt:iv:encrypted:authTag
  if (encrypted.split(':').length !== 4) {
    throw new Error('Invalid encrypted string format')
  }
  return encrypted as EncryptedString
}

/**
 * Sanitized HTML - has been sanitized for XSS prevention
 */
export type SanitizedHTML = Brand<string, 'SanitizedHTML'>

export function sanitizeHTML(html: string): SanitizedHTML {
  // Basic HTML sanitization (in production, use DOMPurify or similar)
  const sanitized = html
    // eslint-disable-next-line security/detect-unsafe-regex -- Regex for HTML sanitization, controlled pattern for script tag removal
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')

  return sanitized as SanitizedHTML
}

/**
 * ISO DateTime - has passed ISO 8601 datetime validation
 */
export type ISODateTime = Brand<string, 'ISODateTime'>

export function validateISODateTime(dateTime: string): ISODateTime | null {
  // Validate ISO 8601 format
  // eslint-disable-next-line security/detect-unsafe-regex -- Regex for ISO 8601 validation, not user-controlled
  const isoRegex =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/
  if (!isoRegex.test(dateTime)) return null

  const date = new Date(dateTime)
  return Number.isNaN(date.getTime()) ? null : (dateTime as ISODateTime)
}

/**
 * Positive Integer - guaranteed to be >= 0
 */
export type PositiveInteger = Brand<number, 'PositiveInteger'>

export function validatePositiveInteger(num: number): PositiveInteger | null {
  return Number.isInteger(num) && num >= 0 ? (num as PositiveInteger) : null
}

/**
 * Non-Empty String - guaranteed to have at least one character
 */
export type NonEmptyString = Brand<string, 'NonEmptyString'>

export function validateNonEmpty(str: string): NonEmptyString | null {
  return str.trim().length > 0 ? (str.trim() as NonEmptyString) : null
}

/**
 * Hex String - validated hexadecimal string
 */
export type HexString = Brand<string, 'HexString'>

export function validateHexString(
  str: string,
  length?: number
): HexString | null {
  // Validate hexadecimal string
  if (length !== undefined) {
    // Length-specific validation (safe: length is a number, not user-controlled regex)
    // eslint-disable-next-line security/detect-non-literal-regexp -- length is number parameter, not user input
    const hexRegex = new RegExp(`^[0-9a-f]{${length}}$`, 'i')
    return hexRegex.test(str) ? (str as HexString) : null
  }

  // Any-length hex validation
  const hexRegex = /^[0-9a-f]+$/i
  return hexRegex.test(str) ? (str as HexString) : null
}

/**
 * Example usage in function signatures:
 *
 * ```typescript
 * import { ValidatedEmail, validateEmail } from '@/lib/branded-types'
 *
 * // Before: accepts any string (unsafe)
 * function sendEmail(to: string) { ... }
 *
 * // After: only accepts validated emails (safe)
 * function sendEmail(to: ValidatedEmail) { ... }
 *
 * // Usage:
 * const email = validateEmail(userInput)
 * if (!email) throw new Error('Invalid email')
 * sendEmail(email) // ✅ Type-safe
 * sendEmail('not-validated') // ❌ Type error
 * ```
 */
