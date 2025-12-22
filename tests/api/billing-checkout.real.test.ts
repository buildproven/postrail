/**
 * Billing Checkout Route Integration Tests
 *
 * Tests the actual /api/billing/checkout endpoint:
 * - POST: Create checkout session
 * - GET: Get pricing info
 *
 * Reusable pattern for any project with Stripe checkout
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { TIER_PRICES } from '../lib/billing-test-utils'

// Hoisted mocks for vi.mock
const mockBillingService = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
}))

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
}))

vi.mock('@/lib/billing', () => ({
  billingService: mockBillingService,
  SUBSCRIPTION_TIERS: {
    trial: {
      name: 'Trial',
      price: 0,
      dailyLimit: 3,
      platforms: 2,
      features: ['basic_generation'],
    },
    standard: {
      name: 'Standard',
      price: 2900,
      dailyLimit: 50,
      platforms: 4,
      features: ['basic_generation', 'scheduling'],
    },
    growth: {
      name: 'Growth',
      price: 5900,
      dailyLimit: 200,
      platforms: Infinity,
      features: ['basic_generation', 'scheduling', 'api_access'],
    },
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabase),
}))

// Import route handlers after mocks
import { POST, GET } from '@/app/api/billing/checkout/route'

describe('/api/billing/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_SECRET_KEY = 'sk_test_xxx'
    process.env.STRIPE_PRICE_STANDARD = TIER_PRICES.standard.priceId
    process.env.STRIPE_PRICE_GROWTH = TIER_PRICES.growth.priceId
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'

    // Default: authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
  })

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.STRIPE_PRICE_STANDARD
    delete process.env.STRIPE_PRICE_GROWTH
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  describe('POST - Create Checkout Session', () => {
    describe('Authentication', () => {
      it('should require authentication', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        })

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'standard' }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(401)
        expect(data.error).toBe('Unauthorized')
      })

      it('should require user email', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: { id: 'user-123', email: null } },
          error: null,
        })

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'standard' }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(401)
        expect(data.error).toBe('Unauthorized')
      })
    })

    describe('Tier Validation', () => {
      it('should reject invalid tier', async () => {
        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'enterprise' }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('Invalid tier')
      })

      it('should reject missing tier', async () => {
        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({}),
          }
        )

        const response = await POST(request)

        expect(response.status).toBe(400)
      })

      it('should accept "standard" tier', async () => {
        mockBillingService.createCheckoutSession.mockResolvedValue({
          url: 'https://checkout.stripe.com/test',
        })

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'standard' }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.url).toBeDefined()
        expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
          'user-123',
          'test@example.com',
          expect.objectContaining({ tier: 'standard' })
        )
      })

      it('should accept "growth" tier', async () => {
        mockBillingService.createCheckoutSession.mockResolvedValue({
          url: 'https://checkout.stripe.com/test',
        })

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'growth' }),
          }
        )

        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
          'user-123',
          'test@example.com',
          expect.objectContaining({ tier: 'growth' })
        )
      })
    })

    describe('Checkout Session Creation', () => {
      it('should return checkout URL on success', async () => {
        mockBillingService.createCheckoutSession.mockResolvedValue({
          url: 'https://checkout.stripe.com/session_123',
        })

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'standard' }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.url).toBe('https://checkout.stripe.com/session_123')
      })

      it('should include success and cancel URLs', async () => {
        mockBillingService.createCheckoutSession.mockResolvedValue({
          url: 'https://checkout.stripe.com/test',
        })

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'standard' }),
          }
        )

        await POST(request)

        expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
          expect.any(String),
          expect.any(String),
          expect.objectContaining({
            successUrl: expect.stringContaining('success=true'),
            cancelUrl: expect.stringContaining('canceled=true'),
          })
        )
      })

      it('should handle service errors', async () => {
        mockBillingService.createCheckoutSession.mockResolvedValue({
          error: 'Price ID not configured',
        })

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'standard' }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(500)
        expect(data.error).toBe('Price ID not configured')
      })

      it('should handle unexpected errors', async () => {
        mockBillingService.createCheckoutSession.mockRejectedValue(
          new Error('Network error')
        )

        const request = new NextRequest(
          'http://localhost:3000/api/billing/checkout',
          {
            method: 'POST',
            body: JSON.stringify({ tier: 'standard' }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(500)
        expect(data.error).toBe('Failed to start checkout session')
      })
    })
  })

  describe('GET - Pricing Info', () => {
    it('should return tier information', async () => {
      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tiers).toBeDefined()
      expect(data.tiers.standard).toBeDefined()
      expect(data.tiers.growth).toBeDefined()
    })

    it('should return correct standard tier pricing', async () => {
      const response = await GET()
      const data = await response.json()

      expect(data.tiers.standard.name).toBe('Standard')
      expect(data.tiers.standard.price).toBe(29) // $29 (cents / 100)
      expect(data.tiers.standard.dailyLimit).toBe(50)
    })

    it('should return correct growth tier pricing', async () => {
      const response = await GET()
      const data = await response.json()

      expect(data.tiers.growth.name).toBe('Growth')
      expect(data.tiers.growth.price).toBe(59) // $59 (cents / 100)
      expect(data.tiers.growth.dailyLimit).toBe(200)
    })

    it('should include feature lists', async () => {
      const response = await GET()
      const data = await response.json()

      expect(data.tiers.standard.features).toContain('scheduling')
      expect(data.tiers.growth.features).toContain('api_access')
    })
  })
})
