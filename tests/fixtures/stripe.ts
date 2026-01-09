/**
 * Test Fixtures - Stripe Mocks
 * Reusable mock factories for Stripe SDK across all tests
 */

import { vi } from 'vitest'

/**
 * Create mock Stripe client
 */
export function createMockStripeClient() {
  return {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
    subscriptions: {
      retrieve: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    },
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    billingPortal: {
      sessions: {
        create: vi.fn(),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  }
}

/**
 * Create mock Stripe module
 */
export function createMockStripeModule(mockStripe: ReturnType<typeof createMockStripeClient>) {
  return {
    default: class MockStripe {
      checkout = mockStripe.checkout
      subscriptions = mockStripe.subscriptions
      customers = mockStripe.customers
      billingPortal = mockStripe.billingPortal
      webhooks = mockStripe.webhooks
    },
  }
}

/**
 * Create mock billing service
 */
export function createMockBillingService() {
  return {
    updateSubscriptionFromWebhook: vi.fn().mockResolvedValue(undefined),
    handleSubscriptionCancelled: vi.fn().mockResolvedValue(undefined),
    getSubscriptionStatus: vi.fn().mockResolvedValue({
      tier: 'standard',
      status: 'active',
    }),
    hasFeatureAccess: vi.fn().mockResolvedValue({
      allowed: true,
      tier: 'standard',
    }),
    getUsageLimits: vi.fn().mockResolvedValue({
      dailyLimit: 50,
      platforms: 4,
      tier: 'standard',
    }),
  }
}
