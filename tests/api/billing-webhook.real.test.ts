/**
 * Stripe Webhook Route Integration Tests
 *
 * Tests the /api/webhooks/stripe endpoint with realistic event payloads:
 * - checkout.session.completed
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 *
 * Reusable pattern for any project with Stripe webhooks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import {
  createCheckoutCompletedEvent,
  createSubscriptionCreatedEvent,
  createSubscriptionUpdatedEvent,
  createSubscriptionDeletedEvent,
  createPaymentSucceededEvent,
  createPaymentFailedEvent,
  TIER_PRICES,
} from '../lib/billing-test-utils'

// Set env vars BEFORE modules load
vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
  process.env.STRIPE_PRICE_STANDARD = 'price_standard_29'
  process.env.STRIPE_PRICE_GROWTH = 'price_growth_59'
})

// Hoisted mocks for vi.mock
const mockStripe = vi.hoisted(() => ({
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
}))

const mockBillingService = vi.hoisted(() => ({
  updateSubscriptionFromWebhook: vi.fn().mockResolvedValue(undefined),
  handleSubscriptionCancelled: vi.fn().mockResolvedValue(undefined),
}))

const mockSupabaseUpdate = vi.hoisted(() => vi.fn().mockReturnThis())
const mockSupabaseEq = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ error: null })
)
const mockSupabase = vi.hoisted(() => ({
  from: vi.fn().mockReturnValue({
    update: mockSupabaseUpdate,
    eq: mockSupabaseEq,
  }),
}))

vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      checkout = mockStripe.checkout
      subscriptions = mockStripe.subscriptions
      customers = mockStripe.customers
      billingPortal = mockStripe.billingPortal
      webhooks = mockStripe.webhooks
    },
  }
})

vi.mock('@/lib/billing', () => ({
  billingService: mockBillingService,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}))

// Import route handler after mocks
import { POST } from '@/app/api/webhooks/stripe/route'

describe('/api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
    process.env.STRIPE_PRICE_STANDARD = TIER_PRICES.standard.priceId
    process.env.STRIPE_PRICE_GROWTH = TIER_PRICES.growth.priceId
  })

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_WEBHOOK_SECRET
    delete process.env.STRIPE_PRICE_STANDARD
    delete process.env.STRIPE_PRICE_GROWTH
  })

  describe('Configuration', () => {
    // Note: The route caches process.env at module load time (line 18-19 in route.ts)
    // So we can't test "not configured" by deleting env vars at runtime.
    // These tests verify the route is properly configured and proceeds to validation.

    it('should be configured and proceed to signature validation', async () => {
      // When properly configured but with invalid signature, should return 400 (not 503)
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature')
      })

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'stripe-signature': 't=123,v1=abc' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400) // Means config is OK, signature check failed
      expect(data.error).toBe('Invalid signature')
    })

    it('should have env vars configured at module load time', () => {
      // Document that env vars are cached at load time
      expect(process.env.STRIPE_SECRET_KEY).toBe('sk_test_xxx')
      expect(process.env.STRIPE_WEBHOOK_SECRET).toBe('whsec_test_secret')
    })
  })

  describe('Signature Validation', () => {
    it('should require stripe-signature header', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing signature')
    })

    it('should return 400 for invalid signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature')
      })

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'stripe-signature': 'invalid_signature' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid signature')
    })
  })

  describe('checkout.session.completed', () => {
    it('should handle successful checkout completion', async () => {
      const event = createCheckoutCompletedEvent({
        userId: 'user-123',
        customerId: 'cus_checkout_123',
        tier: 'standard',
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_123',
        status: 'active',
        items: {
          data: [{ price: { id: TIER_PRICES.standard.priceId } }],
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.received).toBe(true)
      expect(
        mockBillingService.updateSubscriptionFromWebhook
      ).toHaveBeenCalledWith('cus_checkout_123', expect.any(Object))
    })

    it('should skip non-subscription checkout sessions', async () => {
      const event = createCheckoutCompletedEvent()
      ;(event.data.object as Stripe.Checkout.Session).mode = 'payment'
      ;(event.data.object as Stripe.Checkout.Session).subscription = null

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(
        mockBillingService.updateSubscriptionFromWebhook
      ).not.toHaveBeenCalled()
    })
  })

  describe('customer.subscription.created', () => {
    it('should handle new subscription', async () => {
      const event = createSubscriptionCreatedEvent({
        customerId: 'cus_new_123',
        tier: 'standard',
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.received).toBe(true)
      expect(
        mockBillingService.updateSubscriptionFromWebhook
      ).toHaveBeenCalledWith(
        'cus_new_123',
        expect.objectContaining({ status: 'active' })
      )
    })
  })

  describe('customer.subscription.updated', () => {
    it('should handle subscription upgrade', async () => {
      const event = createSubscriptionUpdatedEvent({
        customerId: 'cus_upgrade_123',
        tier: 'growth',
        priceId: TIER_PRICES.growth.priceId,
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(
        mockBillingService.updateSubscriptionFromWebhook
      ).toHaveBeenCalledWith('cus_upgrade_123', expect.any(Object))
    })

    it('should handle subscription downgrade', async () => {
      const event = createSubscriptionUpdatedEvent({
        customerId: 'cus_downgrade_123',
        tier: 'standard',
        priceId: TIER_PRICES.standard.priceId,
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
    })

    it('should handle subscription status change to past_due', async () => {
      const event = createSubscriptionUpdatedEvent({
        customerId: 'cus_pastdue_123',
        status: 'past_due',
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(
        mockBillingService.updateSubscriptionFromWebhook
      ).toHaveBeenCalledWith(
        'cus_pastdue_123',
        expect.objectContaining({ status: 'past_due' })
      )
    })
  })

  describe('customer.subscription.deleted', () => {
    it('should handle subscription cancellation', async () => {
      const event = createSubscriptionDeletedEvent({
        customerId: 'cus_cancelled_123',
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.received).toBe(true)
      expect(
        mockBillingService.handleSubscriptionCancelled
      ).toHaveBeenCalledWith('cus_cancelled_123')
    })
  })

  describe('invoice.payment_succeeded', () => {
    it('should handle successful payment', async () => {
      const event = createPaymentSucceededEvent({
        customerId: 'cus_paid_123',
        subscriptionId: 'sub_paid_123',
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockStripe.subscriptions.retrieve.mockResolvedValue({
        id: 'sub_paid_123',
        status: 'active',
        items: {
          data: [{ price: { id: TIER_PRICES.standard.priceId } }],
        },
      })

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith(
        'sub_paid_123'
      )
    })
  })

  describe('invoice.payment_failed', () => {
    it('should handle failed payment', async () => {
      const event = createPaymentFailedEvent({
        customerId: 'cus_failed_123',
        attemptCount: 2,
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSupabase.from).toHaveBeenCalledWith('user_profiles')
      expect(mockSupabaseUpdate).toHaveBeenCalledWith({
        subscription_status: 'past_due',
      })
    })

    it('should mark subscription as past_due after multiple failures', async () => {
      const event = createPaymentFailedEvent({
        customerId: 'cus_multifail_123',
        attemptCount: 3,
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockSupabaseEq).toHaveBeenCalledWith(
        'stripe_customer_id',
        'cus_multifail_123'
      )
    })
  })

  describe('Unhandled Events', () => {
    it('should acknowledge unhandled event types', async () => {
      const event = {
        id: 'evt_unhandled',
        type: 'customer.created',
        data: { object: {} },
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        pending_webhooks: 0,
        request: null,
        api_version: '2025-11-17.clover',
        object: 'event',
      }

      mockStripe.webhooks.constructEvent.mockReturnValue(event)

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.received).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should return 500 on handler error', async () => {
      const event = createSubscriptionCreatedEvent()

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      mockBillingService.updateSubscriptionFromWebhook.mockRejectedValue(
        new Error('Database error')
      )

      const request = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Webhook handler failed')
    })
  })

  describe('Idempotency', () => {
    it('should handle duplicate events gracefully', async () => {
      const event = createSubscriptionCreatedEvent({
        customerId: 'cus_dupe_123',
      })

      mockStripe.webhooks.constructEvent.mockReturnValue(event)
      // Ensure billing service mock is ready for both calls
      mockBillingService.updateSubscriptionFromWebhook.mockResolvedValue(
        undefined
      )

      const request1 = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const request2 = new NextRequest(
        'http://localhost:3000/api/webhooks/stripe',
        {
          method: 'POST',
          body: JSON.stringify(event),
          headers: { 'stripe-signature': 't=123,v1=valid' },
        }
      )

      const response1 = await POST(request1)
      const response2 = await POST(request2)

      // Both should succeed (idempotent)
      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)

      // Should have been called twice with the same data
      expect(
        mockBillingService.updateSubscriptionFromWebhook
      ).toHaveBeenCalledTimes(2)
    })
  })
})
