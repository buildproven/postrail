/**
 * Reusable Stripe Billing Test Utilities
 *
 * Copy this file to any project that uses Stripe billing.
 * Provides mocks, factories, and helpers for testing:
 * - Checkout sessions
 * - Webhooks
 * - Subscriptions
 * - Customer portal
 *
 * @example
 * import { createMockStripe, createStripeEvent } from '@/tests/lib/billing-test-utils'
 */

import { vi } from 'vitest'
import type Stripe from 'stripe'

// ============================================================================
// STRIPE MOCK FACTORY
// ============================================================================

export interface MockStripeOptions {
  checkoutSession?: Partial<Stripe.Checkout.Session>
  subscription?: Partial<Stripe.Subscription>
  customer?: Partial<Stripe.Customer>
  portalSession?: Partial<Stripe.BillingPortal.Session>
}

/**
 * Creates a fully mocked Stripe client for testing
 */
export function createMockStripe(options: MockStripeOptions = {}) {
  const mockCheckoutSession = {
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/test',
    mode: 'subscription',
    customer: 'cus_test_123',
    subscription: 'sub_test_123',
    metadata: { userId: 'user-123', tier: 'standard' },
    ...options.checkoutSession,
  }

  const mockSubscription = {
    id: 'sub_test_123',
    customer: 'cus_test_123',
    status: 'active' as Stripe.Subscription.Status,
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: 'si_test_123',
          price: { id: 'price_standard_29' },
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      ],
    },
    metadata: { userId: 'user-123', tier: 'standard' },
    ...options.subscription,
  }

  const mockCustomer = {
    id: 'cus_test_123',
    email: 'test@example.com',
    metadata: { userId: 'user-123' },
    ...options.customer,
  }

  const mockPortalSession = {
    id: 'bps_test_123',
    url: 'https://billing.stripe.com/test',
    ...options.portalSession,
  }

  return {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue(mockCheckoutSession),
        retrieve: vi.fn().mockResolvedValue(mockCheckoutSession),
      },
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue(mockSubscription),
      update: vi.fn().mockResolvedValue(mockSubscription),
      cancel: vi
        .fn()
        .mockResolvedValue({ ...mockSubscription, status: 'canceled' }),
    },
    customers: {
      create: vi.fn().mockResolvedValue(mockCustomer),
      retrieve: vi.fn().mockResolvedValue(mockCustomer),
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue(mockPortalSession),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  }
}

// ============================================================================
// STRIPE EVENT FACTORIES
// ============================================================================

export interface EventFactoryOptions {
  userId?: string
  customerId?: string
  subscriptionId?: string
  tier?: 'standard' | 'growth'
  priceId?: string
  status?: Stripe.Subscription.Status
}

const defaultOptions: EventFactoryOptions = {
  userId: 'user-123',
  customerId: 'cus_test_123',
  subscriptionId: 'sub_test_123',
  tier: 'standard',
  priceId: 'price_standard_29',
  status: 'active',
}

/**
 * Creates a checkout.session.completed event
 */
export function createCheckoutCompletedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const opts = { ...defaultOptions, ...options }
  return {
    id: 'evt_checkout_completed',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        mode: 'subscription',
        customer: opts.customerId,
        subscription: opts.subscriptionId,
        metadata: {
          userId: opts.userId,
          tier: opts.tier,
        },
      } as Stripe.Checkout.Session,
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    api_version: '2025-11-17.clover',
    object: 'event',
  }
}

/**
 * Creates a customer.subscription.created event
 */
export function createSubscriptionCreatedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const opts = { ...defaultOptions, ...options }
  return {
    id: 'evt_subscription_created',
    type: 'customer.subscription.created',
    data: {
      object: createMockSubscriptionObject(opts),
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    api_version: '2025-11-17.clover',
    object: 'event',
  }
}

/**
 * Creates a customer.subscription.updated event
 */
export function createSubscriptionUpdatedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const opts = { ...defaultOptions, ...options }
  return {
    id: 'evt_subscription_updated',
    type: 'customer.subscription.updated',
    data: {
      object: createMockSubscriptionObject(opts),
      previous_attributes: {},
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    api_version: '2025-11-17.clover',
    object: 'event',
  }
}

/**
 * Creates a customer.subscription.deleted event
 */
export function createSubscriptionDeletedEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const opts = { ...defaultOptions, ...options }
  return {
    id: 'evt_subscription_deleted',
    type: 'customer.subscription.deleted',
    data: {
      object: createMockSubscriptionObject({ ...opts, status: 'canceled' }),
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    api_version: '2025-11-17.clover',
    object: 'event',
  }
}

/**
 * Creates an invoice.payment_succeeded event
 */
export function createPaymentSucceededEvent(
  options: EventFactoryOptions = {}
): Stripe.Event {
  const opts = { ...defaultOptions, ...options }
  return {
    id: 'evt_payment_succeeded',
    type: 'invoice.payment_succeeded',
    data: {
      object: {
        id: 'in_test_123',
        customer: opts.customerId,
        subscription: opts.subscriptionId,
        status: 'paid',
        amount_paid: opts.tier === 'growth' ? 5900 : 2900,
      } as unknown as Stripe.Invoice,
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    api_version: '2025-11-17.clover',
    object: 'event',
  }
}

/**
 * Creates an invoice.payment_failed event
 */
export function createPaymentFailedEvent(
  options: EventFactoryOptions & { attemptCount?: number } = {}
): Stripe.Event {
  const opts = { ...defaultOptions, ...options }
  return {
    id: 'evt_payment_failed',
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_test_123',
        customer: opts.customerId,
        subscription: opts.subscriptionId,
        status: 'open',
        attempt_count: options.attemptCount || 1,
      } as unknown as Stripe.Invoice,
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: null,
    api_version: '2025-11-17.clover',
    object: 'event',
  }
}

/**
 * Helper to create a mock subscription object
 */
function createMockSubscriptionObject(
  options: EventFactoryOptions
): Stripe.Subscription {
  return {
    id: options.subscriptionId || 'sub_test_123',
    customer: options.customerId || 'cus_test_123',
    status: options.status || 'active',
    cancel_at_period_end: false,
    items: {
      data: [
        {
          id: 'si_test_123',
          price: { id: options.priceId || 'price_standard_29' },
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        },
      ],
      object: 'list',
      has_more: false,
      url: '/v1/subscription_items',
    },
    metadata: {
      userId: options.userId || 'user-123',
      tier: options.tier || 'standard',
    },
  } as unknown as Stripe.Subscription
}

// ============================================================================
// SUPABASE MOCK FACTORY
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
// TEST HELPERS
// ============================================================================

/**
 * Creates a valid webhook signature header for testing
 */
export function createWebhookSignature(
  payload: string,
  secret: string = 'whsec_test_secret'
): string {
  const timestamp = Math.floor(Date.now() / 1000)
  // In real tests, you'd compute the actual HMAC
  // For mocking, we just return a formatted string
  return `t=${timestamp},v1=mock_signature_${secret}`
}

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
 * Tier pricing constants - update these per project
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

/**
 * Status mapping from Stripe to app
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
 * Validates that a tier is valid
 */
export function isValidTier(tier: string): tier is 'standard' | 'growth' {
  return tier === 'standard' || tier === 'growth'
}
