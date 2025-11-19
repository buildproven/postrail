/**
 * Generate ENCRYPTION_KEY for .env.local
 *
 * Run this script once during setup:
 * npx tsx scripts/generate-encryption-key.ts
 */

import { generateEncryptionKey } from '../lib/crypto'

console.log('\n🔐 Generating ENCRYPTION_KEY for .env.local...\n')

const key = generateEncryptionKey()

console.log('Add this to your .env.local file:\n')
console.log(`ENCRYPTION_KEY=${key}`)
console.log('\n⚠️  IMPORTANT: Keep this key secret! Never commit it to Git.\n')
console.log('This key is used to encrypt Twitter API credentials in the database.\n')
