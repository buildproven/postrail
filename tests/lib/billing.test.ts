/**
 * BillingService Unit Tests
 *
 * Tests the core billing service functionality:
 * - Customer management
 * - Checkout session creation
 * - Portal session creation
 * - Subscription status
 * - Webhook processing
 * - Feature gating
 * - Usage limits
 *
 * Reusable pattern: Copy this file and billing-test-utils.ts to any project
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createMockSupabase,
  createMockUserProfile,
  TIER_PRICES,
  STATUS_MAP,
} from './billing-test-utils'

// Set env vars BEFORE billing module loads (it reads process.env at load time)
vi.hoisted(() => {
  process.env.BILLING_ENABLED = 'true' // Enable billing for tests
  process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
  process.env.STRIPE_PRICE_STANDARD = 'price_standard_29'
  process.env.STRIPE_PRICE_GROWTH = 'price_growth_59'
})

// Mock Stripe - must be hoisted for vi.mock to use it
const mockStripe = vi.hoisted(() => ({
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      }),
      retrieve: vi.fn(),
    },
  },
  subscriptions: {
    retrieve: vi.fn().mockResolvedValue({
      id: 'sub_test_123',
      status: 'active',
      items: { data: [{ price: { id: 'price_standard_29' } }] },
    }),
    update: vi.fn(),
    cancel: vi.fn(),
  },
  customers: {
    create: vi.fn().mockResolvedValue({
      id: 'cus_test_123',
      email: 'test@example.com',
    }),
    retrieve: vi.fn(),
  },
  billingPortal: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: 'bps_test_123',
        url: 'https://billing.stripe.com/test',
      }),
    },
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
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

// Mock Supabase
const mockSupabase = createMockSupabase()
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}))

// Import after mocks
import { BillingService, SUBSCRIPTION_TIERS } from '@/lib/billing'

describe('BillingService', () => {
  let service: BillingService

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BILLING_ENABLED = 'true'
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_PRICE_STANDARD = TIER_PRICES.standard.priceId
    process.env.STRIPE_PRICE_GROWTH = TIER_PRICES.growth.priceId
    service = new BillingService()
  })

  afterEach(() => {
    delete process.env.BILLING_ENABLED
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_PRICE_STANDARD
    delete process.env.STRIPE_PRICE_GROWTH
  })

  describe('SUBSCRIPTION_TIERS', () => {
    it('should have trial tier with correct limits', () => {
      expect(SUBSCRIPTION_TIERS.trial).toEqual({
        name: 'Trial',
        price: 0,
        dailyLimit: 3,
        totalLimit: 10,
        platforms: 2,
        features: ['basic_generation', 'manual_posting'],
      })
    })

    it('should have standard tier at $29', () => {
      expect(SUBSCRIPTION_TIERS.standard.price).toBe(2900)
      expect(SUBSCRIPTION_TIERS.standard.dailyLimit).toBe(50)
      expect(SUBSCRIPTION_TIERS.standard.features).toContain('scheduling')
    })

    it('should have growth tier at $59', () => {
      expect(SUBSCRIPTION_TIERS.growth.price).toBe(5900)
      expect(SUBSCRIPTION_TIERS.growth.dailyLimit).toBe(200)
      expect(SUBSCRIPTION_TIERS.growth.features).toContain('api_access')
      expect(SUBSCRIPTION_TIERS.growth.features).toContain('priority_support')
    })

    it('should have correct feature progression', () => {
      const trialFeatures = SUBSCRIPTION_TIERS.trial.features
      const standardFeatures = SUBSCRIPTION_TIERS.standard.features
      const growthFeatures = SUBSCRIPTION_TIERS.growth.features

      // Standard includes all trial features
      trialFeatures.forEach(feature => {
        expect(standardFeatures).toContain(feature)
      })

      // Growth includes all standard features
      standardFeatures.forEach(feature => {
        expect(growthFeatures).toContain(feature)
      })
    })
  })

  describe('getOrCreateCustomer', () => {
    it('should return existing customer ID if present', async () => {
      const existingProfile = createMockUserProfile({
        stripe_customer_id: 'cus_existing_123',
      })
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({ data: existingProfile, error: null }),
      })

      const customerId = await service.getOrCreateCustomer(
        'user-123',
        'test@example.com'
      )

      expect(customerId).toBe('cus_existing_123')
      expect(mockStripe.customers.create).not.toHaveBeenCalled()
    })

    it('should create new customer if none exists', async () => {
      const newProfile = createMockUserProfile({ stripe_customer_id: null })
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: newProfile, error: null }),
      })

      const customerId = await service.getOrCreateCustomer(
        'user-123',
        'test@example.com'
      )

      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        metadata: { userId: 'user-123' },
      })
      expect(customerId).toBe('cus_test_123')
    })

    it('should return null when Stripe is not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY
      const localService = new BillingService()

      const customerId = await localService.getOrCreateCustomer(
        'user-123',
        'test@example.com'
      )

      expect(customerId).toBeNull()
    })
  })

  describe('createCheckoutSession', () => {
    it('should create checkout session for standard tier', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({ stripe_customer_id: 'cus_test_123' }),
          error: null,
        }),
      })

      const result = await service.createCheckoutSession(
        'user-123',
        'test@example.com',
        {
          tier: 'standard',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }
      )

      expect(result).toHaveProperty('url')
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: [{ price: TIER_PRICES.standard.priceId, quantity: 1 }],
          metadata: expect.objectContaining({ tier: 'standard' }),
        })
      )
    })

    it('should create checkout session for growth tier', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({ stripe_customer_id: 'cus_test_123' }),
          error: null,
        }),
      })

      await service.createCheckoutSession('user-123', 'test@example.com', {
        tier: 'growth',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: TIER_PRICES.growth.priceId, quantity: 1 }],
          metadata: expect.objectContaining({ tier: 'growth' }),
        })
      )
    })

    it('should return mock URL when Stripe not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY
      const localService = new BillingService()

      const result = await localService.createCheckoutSession(
        'user-123',
        'test@example.com',
        {
          tier: 'standard',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        }
      )

      expect(result).toHaveProperty('url')
      expect((result as { url: string }).url).toContain('mock=true')
      expect((result as { url: string }).url).toContain('tier=standard')
    })

    it('should have priceId configured for standard tier', () => {
      // Note: priceId is read from env at module load time, not runtime
      // This test documents that the tier has a priceId configured
      expect(SUBSCRIPTION_TIERS.standard.priceId).toBe(
        TIER_PRICES.standard.priceId
      )
    })

    it('should have priceId configured for growth tier', () => {
      expect(SUBSCRIPTION_TIERS.growth.priceId).toBe(TIER_PRICES.growth.priceId)
    })

    it('should include user metadata in session', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({ stripe_customer_id: 'cus_test_123' }),
          error: null,
        }),
      })

      await service.createCheckoutSession('user-456', 'another@example.com', {
        tier: 'growth',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { userId: 'user-456', tier: 'growth' },
          subscription_data: {
            metadata: { userId: 'user-456', tier: 'growth' },
          },
        })
      )
    })
  })

  describe('createPortalSession', () => {
    it('should create portal session for existing customer', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({ stripe_customer_id: 'cus_test_123' }),
          error: null,
        }),
      })

      const result = await service.createPortalSession('user-123')

      expect(result).toHaveProperty('url')
      expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        return_url: expect.any(String),
      })
    })

    it('should return error when no billing account found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({ stripe_customer_id: null }),
          error: null,
        }),
      })

      const result = await service.createPortalSession('user-123')

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toBe(
        'No billing account found'
      )
    })

    it('should return error when Stripe not configured', async () => {
      delete process.env.STRIPE_SECRET_KEY
      const localService = new BillingService()

      const result = await localService.createPortalSession('user-123')

      expect(result).toHaveProperty('error')
      expect((result as { error: string }).error).toBe('Billing not configured')
    })
  })

  describe('getSubscriptionStatus', () => {
    it('should return trial status for new user', async () => {
      const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'trial',
            subscription_tier: 'trial',
            trial_ends_at: trialEnd.toISOString(),
          }),
          error: null,
        }),
      })

      const status = await service.getSubscriptionStatus('user-123')

      expect(status.tier).toBe('trial')
      expect(status.status).toBe('trial')
    })

    it('should return expired for past trial', async () => {
      const expiredTrial = new Date(Date.now() - 24 * 60 * 60 * 1000)
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'trial',
            trial_ends_at: expiredTrial.toISOString(),
          }),
          error: null,
        }),
      })

      const status = await service.getSubscriptionStatus('user-123')

      expect(status.status).toBe('expired')
    })

    it('should return active status with subscription details', async () => {
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'active',
            subscription_tier: 'standard',
            stripe_customer_id: 'cus_test_123',
            subscription_id: 'sub_test_123',
            subscription_current_period_end: periodEnd.toISOString(),
            subscription_cancel_at_period_end: false,
          }),
          error: null,
        }),
      })

      const status = await service.getSubscriptionStatus('user-123')

      expect(status.tier).toBe('standard')
      expect(status.status).toBe('active')
      expect(status.stripeCustomerId).toBe('cus_test_123')
      expect(status.stripeSubscriptionId).toBe('sub_test_123')
      expect(status.cancelAtPeriodEnd).toBe(false)
    })

    it('should return trial for missing profile', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })

      const status = await service.getSubscriptionStatus('user-123')

      expect(status.tier).toBe('trial')
      expect(status.status).toBe('trial')
    })
  })

  describe('updateSubscriptionFromWebhook', () => {
    it('should update database with subscription data', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      })

      const mockSubscription = {
        id: 'sub_test_123',
        status: 'active' as const,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: TIER_PRICES.standard.priceId },
              current_period_end:
                Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          ],
        },
      }

      await service.updateSubscriptionFromWebhook(
        'cus_test_123',
        mockSubscription as any
      )

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_status: 'active',
          subscription_id: 'sub_test_123',
          subscription_tier: 'standard',
        })
      )
    })

    it('should correctly identify growth tier from price ID', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      })

      const mockSubscription = {
        id: 'sub_test_123',
        status: 'active' as const,
        cancel_at_period_end: false,
        items: {
          data: [
            {
              price: { id: TIER_PRICES.growth.priceId },
              current_period_end:
                Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            },
          ],
        },
      }

      await service.updateSubscriptionFromWebhook(
        'cus_test_123',
        mockSubscription as any
      )

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_tier: 'growth',
        })
      )
    })

    it('should map all Stripe statuses correctly', () => {
      const testCases: [string, string][] = [
        ['active', 'active'],
        ['past_due', 'past_due'],
        ['canceled', 'cancelled'],
        ['incomplete', 'trial'],
        ['incomplete_expired', 'expired'],
        ['trialing', 'trial'],
        ['unpaid', 'past_due'],
        ['paused', 'cancelled'],
      ]

      testCases.forEach(([stripeStatus, expectedStatus]) => {
        expect(STATUS_MAP[stripeStatus as keyof typeof STATUS_MAP]).toBe(
          expectedStatus
        )
      })
    })
  })

  describe('handleSubscriptionCancelled', () => {
    it('should reset subscription to trial tier', async () => {
      const mockUpdate = vi.fn().mockReturnThis()
      const mockEq = vi.fn().mockReturnThis()
      const mockSelect = vi.fn().mockReturnThis()
      const mockSingle = vi.fn().mockResolvedValue({ error: null })
      mockSupabase.from.mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
        single: mockSingle,
      })

      await service.handleSubscriptionCancelled('cus_test_123')

      expect(mockUpdate).toHaveBeenCalledWith({
        subscription_status: 'cancelled',
        subscription_tier: 'trial',
      })
    })
  })

  describe('hasFeatureAccess', () => {
    it('should allow basic_generation for trial users', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'trial',
            subscription_tier: 'trial',
            trial_ends_at: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          error: null,
        }),
      })

      const result = await service.hasFeatureAccess(
        'user-123',
        'basic_generation'
      )

      expect(result.allowed).toBe(true)
      expect(result.tier).toBe('trial')
    })

    it('should deny api_access for trial users', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'trial',
            subscription_tier: 'trial',
            trial_ends_at: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          error: null,
        }),
      })

      const result = await service.hasFeatureAccess('user-123', 'api_access')

      expect(result.allowed).toBe(false)
    })

    it('should allow api_access for growth users', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'active',
            subscription_tier: 'growth',
          }),
          error: null,
        }),
      })

      const result = await service.hasFeatureAccess('user-123', 'api_access')

      expect(result.allowed).toBe(true)
      expect(result.tier).toBe('growth')
    })

    it('should deny all features for expired subscription', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'trial',
            subscription_tier: 'trial',
            trial_ends_at: new Date(
              Date.now() - 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          error: null,
        }),
      })

      const result = await service.hasFeatureAccess(
        'user-123',
        'basic_generation'
      )

      expect(result.allowed).toBe(false)
    })
  })

  describe('getUsageLimits', () => {
    it('should return trial limits for trial user', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'trial',
            subscription_tier: 'trial',
            trial_ends_at: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          }),
          error: null,
        }),
      })

      const limits = await service.getUsageLimits('user-123')

      expect(limits.dailyLimit).toBe(3)
      expect(limits.platforms).toBe(2)
      expect(limits.tier).toBe('trial')
    })

    it('should return standard limits for standard user', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'active',
            subscription_tier: 'standard',
          }),
          error: null,
        }),
      })

      const limits = await service.getUsageLimits('user-123')

      expect(limits.dailyLimit).toBe(50)
      expect(limits.platforms).toBe(4)
      expect(limits.tier).toBe('standard')
    })

    it('should return growth limits for growth user', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockUserProfile({
            subscription_status: 'active',
            subscription_tier: 'growth',
          }),
          error: null,
        }),
      })

      const limits = await service.getUsageLimits('user-123')

      expect(limits.dailyLimit).toBe(200)
      expect(limits.platforms).toBe(Infinity)
      expect(limits.tier).toBe('growth')
    })
  })
})
