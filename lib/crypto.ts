/**
 * Encryption utilities for sensitive data (API keys, tokens)
 * Uses AES-256-GCM for authenticated encryption
 *
 * Performance optimization: Caches base encryption key and derived keys (LRU cache)
 * to avoid repeated PBKDF2 iterations (100,000 iterations = 50-100ms per call).
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const SALT_LENGTH = 64
const KEY_LENGTH = 32

// Cache for base encryption key (parsed from env var)
let cachedEncryptionKey: Buffer | null = null

// LRU cache for derived keys (salt -> derived key)
// Max 100 entries to prevent memory bloat
const derivedKeyCache = new Map<string, Buffer>()
const MAX_DERIVED_KEY_CACHE_SIZE = 100

/**
 * Get encryption key from environment variable with validation
 *
 * CRITICAL: Key must be 32 bytes (64 hex characters) for AES-256-GCM.
 * Generate with: `node -e "logger.info(crypto.randomBytes(32).toString('hex'))"`
 *
 * Performance: Caches the parsed key to avoid repeated hex parsing
 *
 * @returns {Buffer} 32-byte encryption key for AES-256-GCM
 * @throws {Error} If ENCRYPTION_KEY is missing or invalid length
 *
 * @example
 * // In .env.local:
 * // ENCRYPTION_KEY=abc123...def (64 hex chars)
 * const key = getEncryptionKey()
 */
function getEncryptionKey(): Buffer {
  // Return cached key if available
  if (cachedEncryptionKey) {
    return cachedEncryptionKey
  }

  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required for encrypting credentials'
    )
  }

  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }

  // Parse and cache
  cachedEncryptionKey = Buffer.from(key, 'hex')
  return cachedEncryptionKey
}

/**
 * Encrypt sensitive data (API keys, tokens) using AES-256-GCM
 *
 * Security features:
 * - Authenticated encryption (GCM mode prevents tampering)
 * - Random IV per encryption (prevents pattern analysis)
 * - Key derivation with PBKDF2 (100,000 iterations)
 * - Random salt per encryption (prevents rainbow tables)
 *
 * Output format: `salt:iv:ciphertext:authTag` (all hex-encoded)
 *
 * @param {string} text - Plaintext to encrypt (e.g., API key, access token)
 * @returns {string} Encrypted string in format `salt:iv:encrypted:authTag`
 * @throws {Error} If ENCRYPTION_KEY is missing or invalid
 *
 * @example
 * const encrypted = encrypt('sk-ant-api03-abc123...')
 * // Returns: "7f3a8c...9e1b:2d4f6a...8c9e:1b2d4f...6a8c:9e1b2d..."
 * // Store this in database, not the plaintext API key
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey()

  // Generate random IV and salt
  const iv = crypto.randomBytes(IV_LENGTH)
  const salt = crypto.randomBytes(SALT_LENGTH)

  // Derive key using PBKDF2 (expensive operation, but can't be cached for encryption
  // since each encryption uses a new random salt)
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
 * Decrypt sensitive data using AES-256-GCM
 *
 * Validates authentication tag to prevent tampering.
 * Throws if ciphertext has been modified.
 *
 * @param {string} encryptedData - Encrypted string in format `salt:iv:encrypted:authTag`
 * @returns {string} Decrypted plaintext (original API key, token, etc.)
 * @throws {Error} If format invalid, ENCRYPTION_KEY wrong, or data tampered with
 *
 * @example
 * const encrypted = '7f3a8c...9e1b:2d4f6a...8c9e:1b2d4f...6a8c:9e1b2d...'
 * const apiKey = decrypt(encrypted)
 * // Returns: "sk-ant-api03-abc123..."
 *
 * @example
 * // Tampering detection
 * try {
 *   decrypt('tampered:data:here')
 * } catch (err) {
 *   logger.error('Data was tampered with or wrong key')
 * }
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

  // Check cache first (saves 50-100ms per decrypt)
  const saltKey = saltHex // Use hex string as cache key
  let derivedKey = derivedKeyCache.get(saltKey)

  if (!derivedKey) {
    // Derive key using same parameters as encryption (expensive: 100,000 PBKDF2 iterations)
    derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256')

    // Cache derived key (LRU: evict oldest if cache full)
    if (derivedKeyCache.size >= MAX_DERIVED_KEY_CACHE_SIZE) {
      const firstKey = derivedKeyCache.keys().next().value
      if (firstKey) derivedKeyCache.delete(firstKey)
    }
    derivedKeyCache.set(saltKey, derivedKey)
  }

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv)
  decipher.setAuthTag(authTag)

  // Decrypt
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Generate a random 32-byte encryption key for AES-256-GCM
 *
 * **SECURITY**: Use this ONCE during initial setup, then:
 * 1. Store in .env.local as `ENCRYPTION_KEY=<generated_key>`
 * 2. Add to production environment variables
 * 3. NEVER commit to version control
 * 4. Keep backup in secure password manager
 *
 * @returns {string} 64-character hex string (32 bytes for AES-256)
 *
 * @example
 * // Run once during setup:
 * const key = generateEncryptionKey()
 * logger.info(`ENCRYPTION_KEY=${key}`)
 * // Copy to .env.local
 *
 * @example
 * // Or use Node.js directly:
 * // node -e "logger.info(require('crypto').randomBytes(32).toString('hex'))"
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash data for quick comparison (non-reversible)
 *
 * Use cases:
 * - OAuth token fingerprints for quick database lookups
 * - Duplicate detection without storing plaintext
 * - Non-sensitive identifiers
 *
 * **NOT for passwords** - use bcrypt/argon2 for password hashing.
 *
 * @param {string} text - Data to hash (e.g., OAuth token)
 * @returns {string} 64-character SHA-256 hex hash
 *
 * @example
 * // Store encrypted token + hash for fast lookup:
 * const encrypted = encrypt(oauthToken)
 * const hashed = hash(oauthToken)
 * await db.insert({
 *   oauth_token: encrypted,  // Full token (encrypted)
 *   oauth_token_hash: hashed // For lookups (hashed)
 * })
 *
 * @example
 * // Fast lookup without decrypting:
 * const tokenHash = hash(incomingToken)
 * const record = await db.findOne({ oauth_token_hash: tokenHash })
 */
export function hash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

/**
 * Reset crypto caches - FOR TESTING ONLY
 *
 * Clears cached encryption key and derived keys to ensure test isolation.
 * Call in test teardown when manipulating process.env.ENCRYPTION_KEY.
 *
 * @internal
 * @example
 * // In test file:
 * afterEach(() => {
 *   __resetCryptoCache()
 * })
 */
export function __resetCryptoCache(): void {
  cachedEncryptionKey = null
  derivedKeyCache.clear()
}
