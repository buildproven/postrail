/**
 * Encryption utilities for sensitive data (API keys, tokens)
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 64
const KEY_LENGTH = 32

// Get encryption key from environment variable
// MUST be 32 bytes (64 hex characters) for AES-256
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required for encrypting credentials')
  }

  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }

  return Buffer.from(key, 'hex')
}

/**
 * Encrypt sensitive data (API keys, tokens)
 * Returns base64-encoded string with format: salt:iv:encrypted:authTag
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey()

  // Generate random IV and salt
  const iv = crypto.randomBytes(IV_LENGTH)
  const salt = crypto.randomBytes(SALT_LENGTH)

  // Derive key using PBKDF2
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256')

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  // Get auth tag for AEAD
  const authTag = cipher.getAuthTag()

  // Combine: salt:iv:encrypted:authTag (all hex)
  return `${salt.toString('hex')}:${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`
}

/**
 * Decrypt sensitive data
 * Expects format: salt:iv:encrypted:authTag
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey()

  // Split components
  const parts = encryptedData.split(':')
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted data format')
  }

  const [saltHex, ivHex, encrypted, authTagHex] = parts

  const salt = Buffer.from(saltHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')

  // Derive key using same parameters as encryption
  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256')

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv)
  decipher.setAuthTag(authTag)

  // Decrypt
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Generate a random encryption key (for initial setup)
 * Use this once and store in .env.local as ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash data for quick comparison (non-reversible)
 * Used for oauth_token field to allow quick lookups
 */
export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}
