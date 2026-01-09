/**
 * PostRail Billing Test Utilities
 *
 * Stripe testing utilities and PostRail-specific helpers (Supabase mocks, tier pricing).
 *
 * @example
 * import { createCheckoutEvent, createMockSupabase, TIER_PRICES } from '@/tests/lib/billing-test-utils'
 */

import { vi, expect } from 'vitest'
import type Stripe from 'stripe'

// ============================================================================
// STRIPE MOCK FACTORY
// ============================================================================

export interface StripeMock {
  checkout: {
    sessions: {
      create: ReturnType<typeof vi.fn>
    }
  }
  billingPortal: {
    sessions: {
      create: ReturnType<typeof vi.fn>
    }
  }
  customers: {
    create: ReturnType<typeof vi.fn>
    retrieve: ReturnType<typeof vi.fn>
  }
  subscriptions: {
    retrieve: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  webhooks: {
    constructEvent: ReturnType<typeof vi.fn>
  }
}

export function createStripeMock(): StripeMock {
  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test',
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi
          .fn()
          .mockResolvedValue({ url: 'https://billing.stripe.com/portal/test' }),
      },
    },
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_test_123' }),
      retrieve: vi
        .fn()
        .mockResolvedValue({ id: 'cus_test_123', email: 'test@example.com' }),
    },
    subscriptions: {
      retrieve: vi
        .fn()
        .mockResolvedValue({ id: 'sub_test_123', status: 'active' }),
      update: vi
        .fn()
        .mockResolvedValue({ id: 'sub_test_123', status: 'active' }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  }
}

// ============================================================================
// EVENT FACTORY OPTIONS
// ============================================================================

export interface EventFactoryOptions {
  customerId?: string
  subscriptionId?: string
  priceId?: string
  status?: Stripe.Subscription.Status
  metadata?: Record<string, string>
}

// ============================================================================
// EVENT FACTORIES
// ============================================================================

export function createCheckoutEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const {
    customerId = 'cus_test_123',
    subscriptionId = 'sub_test_123',
    metadata = {},
  } = options

  return {
    id: 'evt_test_checkout',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        object: 'checkout.session',
        customer: customerId,
        subscription: subscriptionId,
        metadata,
        mode: 'subscription',
        payment_status: 'paid',
        status: 'complete',
      } as unknown as Stripe.Checkout.Session,
    },
    object: 'event',
    api_version: '2025-11-17.clover',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as any
}

export function createSubscriptionEvent(
  type: 'created' | 'updated' | 'deleted',
  options: EventFactoryOptions = {}
): Stripe.Event {
  const {
    customerId = 'cus_test_123',
    subscriptionId = 'sub_test_123',
    priceId = 'price_standard_29',
    status = 'active',
    metadata = {},
  } = options

  const eventType = `customer.subscription.${type}` as Stripe.Event.Type

  return {
    id: `evt_test_sub_${type}`,
    type: eventType,
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
        status,
        metadata,
        items: {
          data: [
            {
              price: { id: priceId },
            },
          ],
        },
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription,
    },
    object: 'event',
    api_version: '2025-11-17.clover',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as any
}

export function createSubscriptionCreatedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  return createSubscriptionEvent('created', options)
}

export function createSubscriptionUpdatedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  return createSubscriptionEvent('updated', options)
}

export function createSubscriptionDeletedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  return createSubscriptionEvent('deleted', { ...options, status: 'canceled' })
}

export function createPaymentSucceededEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const { customerId = 'cus_test_123', subscriptionId = 'sub_test_123' } =
    options

  return {
    id: 'evt_test_payment_succeeded',
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: 'in_test_123',
        object: 'invoice',
        customer: customerId,
        subscription: subscriptionId,
        status: 'paid',
        amount_paid: 2900,
      } as unknown as Stripe.Invoice,
    },
    object: 'event',
    api_version: '2025-11-17.clover',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as any
}

export function createPaymentFailedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const { customerId = 'cus_test_123', subscriptionId = 'sub_test_123' } =
    options

  return {
    id: 'evt_test_payment_failed',
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_test_123',
        object: 'invoice',
        customer: customerId,
        subscription: subscriptionId,
        status: 'open',
        amount_due: 2900,
      } as unknown as Stripe.Invoice,
    },
    object: 'event',
    api_version: '2025-11-17.clover',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as any
}

export function createInvoiceEvent(
  type: 'paid' | 'payment_failed',
  options: EventFactoryOptions = {}
): Stripe.Event {
  return type === 'paid'
    ? createPaymentSucceededEvent(options)
    : createPaymentFailedEvent(options)
}

// ============================================================================
// TEST HELPERS
// ============================================================================

export function createWebhookRequest(
  event: Stripe.Event,
  signature?: string
): Request {
  const body = JSON.stringify(event)
  const sig =
    signature || `t=${Math.floor(Date.now() / 1000)},v1=mock_signature`

  return new Request('http://localhost:3000/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': sig,
    },
    body,
  })
}

export function generateTestSignature(
  payload: string,
  secret: string = 'whsec_test'
): string {
  const timestamp = Math.floor(Date.now() / 1000)
  return `t=${timestamp},v1=test_signature_${secret}`
}

export function assertCheckoutCreated(
  stripeMock: StripeMock,
  expectedOptions?: Partial<Stripe.Checkout.SessionCreateParams>
): void {
  expect(stripeMock.checkout.sessions.create).toHaveBeenCalled()
  if (expectedOptions) {
    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining(expectedOptions)
    )
  }
}

// ============================================================================
// STATUS MAPPING
// ============================================================================

export const STRIPE_STATUS_MAP: Record<
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

// ============================================================================
// TEST DATA
// ============================================================================

export const TEST_CARDS = {
  success: '4242424242424242',
  decline: '4000000000000002',
  insufficientFunds: '4000000000009995',
  expiredCard: '4000000000000069',
  processingError: '4000000000000119',
}

export const TEST_CUSTOMERS = {
  new: { id: 'cus_new_123', email: 'new@example.com' },
  existing: { id: 'cus_existing_456', email: 'existing@example.com' },
  trial: { id: 'cus_trial_789', email: 'trial@example.com' },
}

export const SHARED_TEST_PRICES = {
  standard: 'price_standard_test',
  growth: 'price_growth_test',
  enterprise: 'price_enterprise_test',
}

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
