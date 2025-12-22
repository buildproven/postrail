/**
 * Billing Portal Route Tests
 *
 * Tests the /api/billing/portal endpoint:
 * - POST: Create portal session for subscription management
 *
 * Reusable pattern for Stripe Customer Portal
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoisted mocks for vi.mock
const mockBillingService = vi.hoisted(() => ({
  createPortalSession: vi.fn(),
}))

const mockSupabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
}))

vi.mock('@/lib/billing', () => ({
  billingService: mockBillingService,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => mockSupabase),
}))

// Import route handler after mocks
import { POST } from '@/app/api/billing/portal/route'

describe('/api/billing/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'

    // Default: authenticated user with subscription
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    })
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL
  })

  describe('POST - Create Portal Session', () => {
    describe('Authentication', () => {
      it('should require authentication', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        })

        const response = await POST()
        const data = await response.json()

        expect(response.status).toBe(401)
        expect(data.error).toBe('Unauthorized')
      })
    })

    describe('Portal Session Creation', () => {
      it('should return portal URL on success', async () => {
        mockBillingService.createPortalSession.mockResolvedValue({
          url: 'https://billing.stripe.com/session_123',
        })

        const response = await POST()
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.url).toBe('https://billing.stripe.com/session_123')
      })

      it('should call service with user ID', async () => {
        mockBillingService.createPortalSession.mockResolvedValue({
          url: 'https://billing.stripe.com/test',
        })

        await POST()

        expect(mockBillingService.createPortalSession).toHaveBeenCalledWith(
          'user-123'
        )
      })

      it('should return 400 when no billing account', async () => {
        mockBillingService.createPortalSession.mockResolvedValue({
          error: 'No billing account found',
        })

        const response = await POST()
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toBe('No billing account found')
      })

      it('should return 400 when billing not configured', async () => {
        mockBillingService.createPortalSession.mockResolvedValue({
          error: 'Billing not configured',
        })

        const response = await POST()
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toBe('Billing not configured')
      })

      it('should handle unexpected errors', async () => {
        mockBillingService.createPortalSession.mockRejectedValue(
          new Error('Stripe error')
        )

        const response = await POST()
        const data = await response.json()

        expect(response.status).toBe(500)
        expect(data.error).toBe('Failed to create portal session')
      })
    })

    describe('User Scenarios', () => {
      it('should allow active subscriber to access portal', async () => {
        mockSupabase.auth.getUser.mockResolvedValue({
          data: {
            user: { id: 'subscriber-123', email: 'subscriber@example.com' },
          },
          error: null,
        })
        mockBillingService.createPortalSession.mockResolvedValue({
          url: 'https://billing.stripe.com/portal',
        })

        const response = await POST()
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.url).toBeDefined()
      })

      it('should handle cancelled subscriber accessing portal', async () => {
        mockBillingService.createPortalSession.mockResolvedValue({
          url: 'https://billing.stripe.com/portal_cancelled',
        })

        const response = await POST()
        const data = await response.json()

        // Cancelled users can still access portal to resubscribe
        expect(response.status).toBe(200)
        expect(data.url).toBeDefined()
      })
    })
  })
})
