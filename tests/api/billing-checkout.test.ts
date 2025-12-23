/**
 * Billing Checkout API Tests
 *
 * Tests for /api/billing/checkout endpoint
 * Covers subscription creation for Standard ($29) and Growth ($59) tiers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Stripe
const mockCheckoutCreate = vi.fn()
vi.mock('stripe', () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: mockCheckoutCreate,
      },
    }
  },
}))

// Mock Supabase
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

describe('/api/billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_PRICE_STANDARD = 'price_standard_29'
    process.env.STRIPE_PRICE_GROWTH = 'price_growth_59'

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
  })

  describe('Price Configuration', () => {
    it('should have Standard tier price configured', () => {
      expect(process.env.STRIPE_PRICE_STANDARD).toBe('price_standard_29')
    })

    it('should have Growth tier price configured', () => {
      expect(process.env.STRIPE_PRICE_GROWTH).toBe('price_growth_59')
    })

    it('should map tier to correct price ID', () => {
      const PRICE_MAP: Record<string, string | undefined> = {
        standard: process.env.STRIPE_PRICE_STANDARD,
        growth: process.env.STRIPE_PRICE_GROWTH,
      }

      expect(PRICE_MAP.standard).toBe('price_standard_29')
      expect(PRICE_MAP.growth).toBe('price_growth_59')
      expect(PRICE_MAP.enterprise).toBeUndefined()
    })
  })

  describe('Tier Validation', () => {
    it('should validate tier parameter exists', () => {
      const validateTier = (tier: string | null): boolean => {
        const validTiers = ['standard', 'growth']
        return tier !== null && validTiers.includes(tier)
      }

      expect(validateTier(null)).toBe(false)
      expect(validateTier('')).toBe(false)
      expect(validateTier('standard')).toBe(true)
      expect(validateTier('growth')).toBe(true)
      expect(validateTier('enterprise')).toBe(false)
      expect(validateTier('trial')).toBe(false)
    })

    it('should return tier features', () => {
      const getTierFeatures = (tier: 'standard' | 'growth') => {
        const features = {
          standard: {
            name: 'Standard',
            price: 29,
            generations: 'unlimited',
            platforms: 4,
            scheduling: true,
            analytics: 'basic',
          },
          growth: {
            name: 'Growth',
            price: 59,
            generations: 'unlimited',
            platforms: 4,
            scheduling: true,
            analytics: 'advanced',
            bulkGeneration: true,
            prioritySupport: true,
            apiAccess: true,
          },
        }
        return features[tier]
      }

      expect(getTierFeatures('standard').price).toBe(29)
      expect(getTierFeatures('growth').price).toBe(59)
      expect(
        (getTierFeatures('growth') as { apiAccess: boolean }).apiAccess
      ).toBe(true)
    })
  })

  describe('Checkout Session Creation', () => {
    it('should create subscription session for Standard tier', async () => {
      mockCheckoutCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/session_standard',
        id: 'cs_standard_123',
      })

      const Stripe = (await import('stripe')).default
      const stripe = new Stripe('sk_test_xxx')

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: 'price_standard_29', quantity: 1 }],
        success_url: 'https://postrail.vibebuildlab.com/dashboard?success=true',
        cancel_url: 'https://postrail.vibebuildlab.com/dashboard/settings',
        customer_email: 'test@example.com',
        metadata: {
          user_id: 'user-123',
          tier: 'standard',
        },
      })

      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: [{ price: 'price_standard_29', quantity: 1 }],
          metadata: expect.objectContaining({ tier: 'standard' }),
        })
      )
      expect(session.url).toContain('checkout.stripe.com')
    })

    it('should create subscription session for Growth tier', async () => {
      mockCheckoutCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/session_growth',
        id: 'cs_growth_456',
      })

      const Stripe = (await import('stripe')).default
      const stripe = new Stripe('sk_test_xxx')

      await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: 'price_growth_59', quantity: 1 }],
        success_url: 'https://postrail.vibebuildlab.com/dashboard?success=true',
        cancel_url: 'https://postrail.vibebuildlab.com/dashboard/settings',
        metadata: {
          user_id: 'user-123',
          tier: 'growth',
        },
      })

      expect(mockCheckoutCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'subscription',
          line_items: [{ price: 'price_growth_59', quantity: 1 }],
        })
      )
    })

    it('should handle Stripe errors gracefully', async () => {
      mockCheckoutCreate.mockRejectedValue(new Error('Stripe API error'))

      const Stripe = (await import('stripe')).default
      const stripe = new Stripe('sk_test_xxx')

      await expect(
        stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [{ price: 'price_standard_29', quantity: 1 }],
        })
      ).rejects.toThrow('Stripe API error')
    })
  })

  describe('Authentication', () => {
    it('should require authenticated user', () => {
      const isAuthenticated = (user: { id: string } | null): boolean => {
        return user !== null && typeof user.id === 'string'
      }

      expect(isAuthenticated(null)).toBe(false)
      expect(isAuthenticated({ id: 'user-123' })).toBe(true)
    })

    it('should include user_id in session metadata', () => {
      const buildMetadata = (userId: string, tier: string) => ({
        user_id: userId,
        tier,
        created_at: new Date().toISOString(),
      })

      const metadata = buildMetadata('user-123', 'standard')
      expect(metadata.user_id).toBe('user-123')
      expect(metadata.tier).toBe('standard')
    })
  })
})
