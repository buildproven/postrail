/**
 * PostRail Billing Test Utilities
 *
 * Re-exports shared Stripe testing utilities from @vbl/shared
 * and adds PostRail-specific helpers (Supabase mocks, tier pricing).
 *
 * @example
 * import { createCheckoutEvent, createMockSupabase, TIER_PRICES } from '@/tests/lib/billing-test-utils'
 */

import { vi } from 'vitest'
import type Stripe from 'stripe'

// ============================================================================
// RE-EXPORT SHARED STRIPE UTILITIES
// ============================================================================

export {
  // Mock factories
  createStripeMock,
  type StripeMock,

  // Event factories
  createCheckoutEvent,
  createSubscriptionCreatedEvent,
  createSubscriptionUpdatedEvent,
  createSubscriptionDeletedEvent,
  createSubscriptionEvent,
  createPaymentSucceededEvent,
  createPaymentFailedEvent,
  createInvoiceEvent,

  // Test helpers
  createWebhookRequest,
  generateTestSignature,
  assertCheckoutCreated,

  // Status mapping
  STRIPE_STATUS_MAP,

  // Test data
  TEST_CARDS,
  TEST_CUSTOMERS,
  TEST_PRICES as SHARED_TEST_PRICES,

  // Types
  type EventFactoryOptions,
} from '@vbl/shared'

// ============================================================================
// POSTRAIL-SPECIFIC: TIER PRICING
// ============================================================================

/**
 * PostRail tier pricing constants
 */
export const TIER_PRICES = {
  standard: {
    priceId: 'price_standard_29',
    amount: 2900,
    name: 'Standard',
  },
  growth: {
    priceId: 'price_growth_59',
    amount: 5900,
    name: 'Growth',
  },
} as const

// ============================================================================
// POSTRAIL-SPECIFIC: SUPABASE MOCKS
// ============================================================================

export interface MockUserProfile {
  id: string
  email: string
  stripe_customer_id?: string | null
  subscription_id?: string | null
  subscription_status: 'trial' | 'active' | 'cancelled' | 'past_due' | 'expired'
  subscription_tier: 'trial' | 'standard' | 'growth'
  trial_ends_at?: string
  subscription_current_period_end?: string | null
  subscription_cancel_at_period_end?: boolean
}

export function createMockUserProfile(
  overrides: Partial<MockUserProfile> = {}
): MockUserProfile {
  const now = new Date()
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  return {
    id: 'user-123',
    email: 'test@example.com',
    stripe_customer_id: null,
    subscription_id: null,
    subscription_status: 'trial',
    subscription_tier: 'trial',
    trial_ends_at: trialEnd.toISOString(),
    subscription_current_period_end: null,
    subscription_cancel_at_period_end: false,
    ...overrides,
  }
}

export function createMockSupabase(profile: MockUserProfile | null = null) {
  const mockProfile = profile || createMockUserProfile()

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: mockProfile.id, email: mockProfile.email } },
        error: null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    }),
  }
}

// ============================================================================
// POSTRAIL-SPECIFIC: ADDITIONAL HELPERS
// ============================================================================

/**
 * Creates a mock Request object for route testing
 */
export function createMockRequest(options: {
  method?: string
  body?: object
  headers?: Record<string, string>
}): Request {
  const { method = 'POST', body, headers = {} } = options

  return new Request('http://localhost:3000/api/test', {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

/**
 * Creates a valid webhook signature header for testing
 */
export function createWebhookSignature(
  payload: string,
  secret: string = 'whsec_test_secret'
): string {
  const timestamp = Math.floor(Date.now() / 1000)
  return `t=${timestamp},v1=mock_signature_${secret}`
}

/**
 * Status mapping from Stripe to PostRail app status
 * Re-export with PostRail-specific name for clarity
 */
export const STATUS_MAP: Record<
  Stripe.Subscription.Status,
  'trial' | 'active' | 'cancelled' | 'past_due' | 'expired'
> = {
  active: 'active',
  past_due: 'past_due',
  canceled: 'cancelled',
  incomplete: 'trial',
  incomplete_expired: 'expired',
  trialing: 'trial',
  unpaid: 'past_due',
  paused: 'cancelled',
}

/**
 * Validates that a tier is valid for PostRail
 */
export function isValidTier(tier: string): tier is 'standard' | 'growth' {
  return tier === 'standard' || tier === 'growth'
}
