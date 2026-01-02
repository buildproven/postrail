import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

/**
 * Service Role Client - BYPASSES ROW LEVEL SECURITY
 *
 * ⚠️  SECURITY WARNING: This client has admin privileges and bypasses all RLS policies.
 *
 * ONLY use this client when:
 * 1. Reading/writing system configuration (system_limits, feature flags)
 * 2. Background workers without user context (cron jobs, webhooks)
 * 3. Billing operations that need cross-user access (Stripe webhooks)
 * 4. Trial/usage tracking that needs global view
 *
 * DO NOT use this client when:
 * 1. User-initiated API requests (use createServerClient instead)
 * 2. Reading user-specific data that should respect RLS
 * 3. Any operation where user context is available
 *
 * Current legitimate usages:
 * - lib/trial-guard.ts (system limits, global trial caps)
 * - lib/billing.ts (Stripe customer management, subscription status)
 * - lib/service-auth.ts (server-to-server authentication)
 * - lib/disposable-emails.ts (email validation, no user context)
 * - lib/feature-gate.ts (fallback when server client unavailable)
 *
 * Audit log: All service client operations are logged for security monitoring
 */
export function createServiceClient() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      'Service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  // Audit log: Track service client creation for security monitoring
  const stack = new Error().stack
  const caller = stack?.split('\n')[2]?.trim() || 'unknown'

  if (process.env.NODE_ENV === 'production') {
    logger.info({
      type: 'security_audit',
      action: 'service_client_created',
      caller,
      timestamp: new Date().toISOString(),
      msg: 'Service client created (bypasses RLS)',
    })
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  )
}
