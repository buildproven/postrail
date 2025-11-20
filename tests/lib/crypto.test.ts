import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt, hash } from '@/lib/crypto'

/**
 * Unit tests for encryption utilities
 * Tests AES-256-GCM encryption/decryption and hashing
 */

// Set up test encryption key
beforeAll(() => {
  // Generate a test encryption key (64 hex characters = 32 bytes)
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('Crypto Utilities - Encryption', () => {
  it('should encrypt and decrypt text correctly', () => {
    const originalText = 'my-secret-api-key-12345'

    const encrypted = encrypt(originalText)
    const decrypted = decrypt(encrypted)

    expect(decrypted).toBe(originalText)
  })

  it('should produce different ciphertext for same input', () => {
    // Due to random IV, encrypting same text twice produces different output
    const text = 'test-secret'

    const encrypted1 = encrypt(text)
    const encrypted2 = encrypt(text)

    expect(encrypted1).not.toBe(encrypted2)
    expect(decrypt(encrypted1)).toBe(text)
    expect(decrypt(encrypted2)).toBe(text)
  })

  it('should encrypt long text correctly', () => {
    const longText = 'a'.repeat(1000) // 1000 character text

    const encrypted = encrypt(longText)
    const decrypted = decrypt(encrypted)

    expect(decrypted).toBe(longText)
    expect(decrypted.length).toBe(1000)
  })

  it('should handle special characters', () => {
    const specialText = 'test@#$%^&*(){}[]|\\:;"<>?,./'

    const encrypted = encrypt(specialText)
    const decrypted = decrypt(encrypted)

    expect(decrypted).toBe(specialText)
  })

  it('should handle unicode characters', () => {
    const unicodeText = 'Hello 世界 🌍 Привет'

    const encrypted = encrypt(unicodeText)
    const decrypted = decrypt(encrypted)

    expect(decrypted).toBe(unicodeText)
  })

  it('encrypted data should have correct format', () => {
    const text = 'test'
    const encrypted = encrypt(text)

    // Format: salt:iv:encrypted:authTag (all hex)
    const parts = encrypted.split(':')

    expect(parts.length).toBe(4)
    expect(parts[0]).toMatch(/^[0-9a-f]+$/) // salt (hex)
    expect(parts[1]).toMatch(/^[0-9a-f]+$/) // iv (hex)
    expect(parts[2]).toMatch(/^[0-9a-f]+$/) // encrypted (hex)
    expect(parts[3]).toMatch(/^[0-9a-f]+$/) // authTag (hex)
  })

  it('should fail to decrypt tampered data', () => {
    const text = 'test'
    const encrypted = encrypt(text)

    // Tamper with the encrypted data
    const parts = encrypted.split(':')
    parts[2] = parts[2].substring(0, parts[2].length - 2) + 'ff' // Change last byte
    const tampered = parts.join(':')

    expect(() => decrypt(tampered)).toThrow()
  })

  it('should fail to decrypt with invalid format', () => {
    expect(() => decrypt('invalid-data')).toThrow()
    expect(() => decrypt('too:few:parts')).toThrow()
    expect(() => decrypt('too:many:parts:here:extra')).toThrow()
  })
})

describe('Crypto Utilities - Hashing', () => {
  it('should produce consistent hash for same input', () => {
    const text = 'test-string'

    const hash1 = hash(text)
    const hash2 = hash(text)

    expect(hash1).toBe(hash2)
  })

  it('should produce different hash for different input', () => {
    const hash1 = hash('test1')
    const hash2 = hash('test2')

    expect(hash1).not.toBe(hash2)
  })

  it('should produce 64-character hex hash (SHA-256)', () => {
    const hashed = hash('test')

    expect(hashed.length).toBe(64)
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should hash Twitter credentials consistently', () => {
    const apiKey = 'test-api-key'
    const apiSecret = 'test-api-secret'
    const accessToken = 'test-access-token'
    const accessTokenSecret = 'test-access-token-secret'

    const credentialsString = `${apiKey}:${apiSecret}:${accessToken}:${accessTokenSecret}`

    const hash1 = hash(credentialsString)
    const hash2 = hash(credentialsString)

    expect(hash1).toBe(hash2)
    expect(hash1.length).toBe(64)
  })

  it('should be irreversible', () => {
    const original = 'my-secret-key'
    const hashed = hash(original)

    // Hash should not contain the original
    expect(hashed).not.toContain(original)
    expect(hashed).not.toContain('secret')
    expect(hashed).not.toContain('key')
  })
})

describe('Crypto Utilities - Error Handling', () => {
  it('should throw error if ENCRYPTION_KEY is missing', () => {
    const originalKey = process.env.ENCRYPTION_KEY
    delete process.env.ENCRYPTION_KEY

    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY')

    // Restore key
    process.env.ENCRYPTION_KEY = originalKey
  })

  it('should throw error if ENCRYPTION_KEY is wrong length', () => {
    const originalKey = process.env.ENCRYPTION_KEY
    process.env.ENCRYPTION_KEY = 'too-short' // Not 64 characters

    expect(() => encrypt('test')).toThrow('64 hex characters')

    // Restore key
    process.env.ENCRYPTION_KEY = originalKey
  })

  it('should handle empty string encryption', () => {
    const encrypted = encrypt('')
    const decrypted = decrypt(encrypted)

    expect(decrypted).toBe('')
  })

  it('should handle whitespace-only encryption', () => {
    const text = '   '
    const encrypted = encrypt(text)
    const decrypted = decrypt(encrypted)

    expect(decrypted).toBe(text)
  })
})

describe('Crypto Utilities - Twitter Credential Workflow', () => {
  it('should encrypt all 4 Twitter credentials', () => {
    const credentials = {
      apiKey: 'xvz1evFS4wEEPTGEFPHBog',
      apiSecret: 'L8qq9PZyRg6ieKGEKhZolGC0vJWLw8iEJ88DRdyOg',
      accessToken: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      accessTokenSecret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    }

    const encrypted = {
      apiKey: encrypt(credentials.apiKey),
      apiSecret: encrypt(credentials.apiSecret),
      accessToken: encrypt(credentials.accessToken),
      accessTokenSecret: encrypt(credentials.accessTokenSecret),
    }

    // Verify all encrypted
    expect(encrypted.apiKey).not.toBe(credentials.apiKey)
    expect(encrypted.apiSecret).not.toBe(credentials.apiSecret)
    expect(encrypted.accessToken).not.toBe(credentials.accessToken)
    expect(encrypted.accessTokenSecret).not.toBe(credentials.accessTokenSecret)

    // Verify all can be decrypted
    expect(decrypt(encrypted.apiKey)).toBe(credentials.apiKey)
    expect(decrypt(encrypted.apiSecret)).toBe(credentials.apiSecret)
    expect(decrypt(encrypted.accessToken)).toBe(credentials.accessToken)
    expect(decrypt(encrypted.accessTokenSecret)).toBe(credentials.accessTokenSecret)
  })

  it('should create hash for credential lookup', () => {
    const credentials = {
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessTokenSecret: 'token-secret',
    }

    const credentialsHash = hash(
      `${credentials.apiKey}:${credentials.apiSecret}:${credentials.accessToken}:${credentials.accessTokenSecret}`
    )

    expect(credentialsHash.length).toBe(64)
    expect(credentialsHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('should simulate database storage workflow', () => {
    // 1. User provides credentials
    const userCredentials = {
      apiKey: 'user-api-key',
      apiSecret: 'user-api-secret',
      accessToken: 'user-access-token',
      accessTokenSecret: 'user-access-token-secret',
    }

    // 2. Encrypt for storage
    const encrypted = {
      apiKey: encrypt(userCredentials.apiKey),
      apiSecret: encrypt(userCredentials.apiSecret),
      accessToken: encrypt(userCredentials.accessToken),
      accessTokenSecret: encrypt(userCredentials.accessTokenSecret),
    }

    // 3. Create hash for quick lookup
    const credentialsHash = hash(
      `${userCredentials.apiKey}:${userCredentials.apiSecret}:${userCredentials.accessToken}:${userCredentials.accessTokenSecret}`
    )

    // 4. Simulate database storage (metadata column)
    const databaseRecord = {
      oauth_token: credentialsHash,
      metadata: encrypted,
    }

    // 5. Retrieve and decrypt
    const decrypted = {
      apiKey: decrypt(databaseRecord.metadata.apiKey),
      apiSecret: decrypt(databaseRecord.metadata.apiSecret),
      accessToken: decrypt(databaseRecord.metadata.accessToken),
      accessTokenSecret: decrypt(databaseRecord.metadata.accessTokenSecret),
    }

    // Verify round-trip
    expect(decrypted).toEqual(userCredentials)
  })
})
