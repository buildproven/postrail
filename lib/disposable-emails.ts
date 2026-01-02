/**
 * Disposable Email Detection
 *
 * Checks if an email is from a known disposable/temporary email provider.
 * Uses a combination of local blocklist and database lookups.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { logger } from '@/lib/logger'

// Local blocklist of common disposable email domains (backup if DB unavailable)
const LOCAL_BLOCKLIST = new Set([
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'throwaway.email',
  'temp-mail.org',
  'fakeinbox.com',
  'trashmail.com',
  'yopmail.com',
  'mailnesia.com',
  'maildrop.cc',
  'dispostable.com',
  'getairmail.com',
  'mohmal.com',
  'tempail.com',
  'sharklasers.com',
  'spam4.me',
  'grr.la',
  'guerrillamail.info',
  'pokemail.net',
])

// Cache blocked domains from DB (refreshed every 5 minutes)
let cachedBlockedDomains: Set<string> | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  const parts = email.toLowerCase().split('@')
  return parts.length === 2 ? parts[1] : ''
}

/**
 * Load blocked domains from database
 */
async function loadBlockedDomains(): Promise<Set<string>> {
  const now = Date.now()

  if (cachedBlockedDomains && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedBlockedDomains
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('blocked_email_domains')
      .select('domain')

    if (error) {
      logger.error('Error loading blocked domains:', error)
      return LOCAL_BLOCKLIST
    }

    const domains = new Set(data.map(d => d.domain.toLowerCase()))

    // Merge with local blocklist
    LOCAL_BLOCKLIST.forEach(d => domains.add(d))

    cachedBlockedDomains = domains
    cacheTimestamp = now

    return domains
  } catch (error) {
    logger.error('Failed to load blocked domains:', error)
    return LOCAL_BLOCKLIST
  }
}

/**
 * Check if an email is from a disposable provider
 */
export async function isDisposableEmail(email: string): Promise<boolean> {
  const domain = extractDomain(email)

  if (!domain) {
    return false // Invalid email format
  }

  const blockedDomains = await loadBlockedDomains()
  return blockedDomains.has(domain)
}

/**
 * Check email and return detailed result
 */
export async function checkEmailDomain(email: string): Promise<{
  blocked: boolean
  domain: string
  reason?: string
}> {
  const domain = extractDomain(email)

  if (!domain) {
    return { blocked: false, domain: '' }
  }

  const blockedDomains = await loadBlockedDomains()

  if (blockedDomains.has(domain)) {
    return {
      blocked: true,
      domain,
      reason: 'disposable_email',
    }
  }

  return { blocked: false, domain }
}

/**
 * Add a domain to the blocklist (database)
 */
export async function blockEmailDomain(
  domain: string,
  reason = 'disposable'
): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('blocked_email_domains').insert({
      domain: domain.toLowerCase(),
      reason,
    })

    if (error) {
      logger.error('Error blocking domain:', error)
      return false
    }

    // Invalidate cache
    cachedBlockedDomains = null
    return true
  } catch (error) {
    logger.error('Failed to block domain:', error)
    return false
  }
}

// Export for testing
export { LOCAL_BLOCKLIST, loadBlockedDomains }
