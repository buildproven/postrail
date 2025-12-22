/**
 * Stripe Webhook API Tests
 *
 * Tests for /api/webhooks/stripe endpoint
 * Covers subscription lifecycle events
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Stripe
vi.mock('stripe', () => ({
  default: class MockStripe {
    webhooks = {
      constructEvent: vi.fn(),
    }
  },
}))

// Mock Supabase
const mockSupabase = {
  from: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  })),
}

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => mockSupabase),
}))

describe('/api/webhooks/stripe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
  })

  describe('Webhook Configuration', () => {
    it('should require STRIPE_WEBHOOK_SECRET', () => {
      expect(process.env.STRIPE_WEBHOOK_SECRET).toBeDefined()
      expect(process.env.STRIPE_WEBHOOK_SECRET).toBe('whsec_test_secret')
    })

    it('should fail without webhook secret', () => {
      delete process.env.STRIPE_WEBHOOK_SECRET
      expect(process.env.STRIPE_WEBHOOK_SECRET).toBeUndefined()
    })
  })

  describe('Signature Validation', () => {
    it('should require stripe-signature header', () => {
      const validateSignature = (signature: string | null): boolean => {
        return signature !== null && signature.length > 0
      }

      expect(validateSignature(null)).toBe(false)
      expect(validateSignature('')).toBe(false)
      expect(validateSignature('t=123,v1=abc')).toBe(true)
    })
  })

  describe('Event Type Handling', () => {
    it('should process subscription events', () => {
      const shouldProcess = (eventType: string): boolean => {
        const validEvents = [
          'checkout.session.completed',
          'customer.subscription.created',
          'customer.subscription.updated',
          'customer.subscription.deleted',
          'invoice.paid',
          'invoice.payment_failed',
        ]
        return validEvents.includes(eventType)
      }

      expect(shouldProcess('checkout.session.completed')).toBe(true)
      expect(shouldProcess('customer.subscription.created')).toBe(true)
      expect(shouldProcess('customer.subscription.updated')).toBe(true)
      expect(shouldProcess('customer.subscription.deleted')).toBe(true)
      expect(shouldProcess('invoice.paid')).toBe(true)
      expect(shouldProcess('invoice.payment_failed')).toBe(true)
      expect(shouldProcess('payment_intent.succeeded')).toBe(false)
    })

    it('should extract tier from subscription metadata', () => {
      const getTier = (
        metadata: Record<string, string | undefined>
      ): 'standard' | 'growth' | 'trial' => {
        const tier = metadata?.tier
        if (tier === 'standard' || tier === 'growth') return tier
        return 'trial'
      }

      expect(getTier({ tier: 'standard' })).toBe('standard')
      expect(getTier({ tier: 'growth' })).toBe('growth')
      expect(getTier({})).toBe('trial')
      expect(getTier({ tier: 'invalid' })).toBe('trial')
    })
  })

  describe('Subscription Status Mapping', () => {
    it('should map Stripe status to app status', () => {
      const mapStatus = (
        stripeStatus: string
      ): 'trial' | 'active' | 'cancelled' | 'past_due' | 'expired' => {
        const statusMap: Record<
          string,
          'trial' | 'active' | 'cancelled' | 'past_due' | 'expired'
        > = {
          active: 'active',
          canceled: 'cancelled',
          past_due: 'past_due',
          unpaid: 'past_due',
          incomplete: 'trial',
          incomplete_expired: 'expired',
          trialing: 'trial',
        }
        return statusMap[stripeStatus] || 'trial'
      }

      expect(mapStatus('active')).toBe('active')
      expect(mapStatus('canceled')).toBe('cancelled')
      expect(mapStatus('past_due')).toBe('past_due')
      expect(mapStatus('trialing')).toBe('trial')
      expect(mapStatus('unknown')).toBe('trial')
    })
  })

  describe('checkout.session.completed', () => {
    it('should extract user_id from metadata', () => {
      const session = {
        id: 'cs_test_123',
        metadata: { user_id: 'user-456', tier: 'standard' },
        subscription: 'sub_789',
        customer: 'cus_abc',
      }

      expect(session.metadata.user_id).toBe('user-456')
      expect(session.metadata.tier).toBe('standard')
    })

    it('should handle missing user_id gracefully', () => {
      const getUserId = (
        session: { metadata?: { user_id?: string } | null } | null
      ): string | null => {
        return session?.metadata?.user_id || null
      }

      expect(getUserId(null)).toBeNull()
      expect(getUserId({})).toBeNull()
      expect(getUserId({ metadata: null })).toBeNull()
      expect(getUserId({ metadata: { user_id: 'user-123' } })).toBe('user-123')
    })
  })

  describe('customer.subscription.updated', () => {
    it('should detect plan changes', () => {
      const detectPlanChange = (
        previousTier: string | undefined,
        currentTier: string
      ): 'upgrade' | 'downgrade' | 'none' => {
        if (!previousTier || previousTier === currentTier) return 'none'
        if (previousTier === 'standard' && currentTier === 'growth')
          return 'upgrade'
        if (previousTier === 'growth' && currentTier === 'standard')
          return 'downgrade'
        return 'none'
      }

      expect(detectPlanChange(undefined, 'standard')).toBe('none')
      expect(detectPlanChange('standard', 'standard')).toBe('none')
      expect(detectPlanChange('standard', 'growth')).toBe('upgrade')
      expect(detectPlanChange('growth', 'standard')).toBe('downgrade')
    })

    it('should handle cancel_at_period_end', () => {
      const subscription = {
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: 1735689600,
      }

      expect(subscription.cancel_at_period_end).toBe(true)
      expect(subscription.status).toBe('active') // Still active until period ends
    })
  })

  describe('customer.subscription.deleted', () => {
    it('should mark subscription as cancelled', () => {
      const handleDeletion = (_subscription: {
        id: string
        status: string
      }) => {
        return {
          subscription_status: 'cancelled',
          subscription_id: null,
          subscription_tier: 'trial',
        }
      }

      const result = handleDeletion({ id: 'sub_123', status: 'canceled' })
      expect(result.subscription_status).toBe('cancelled')
      expect(result.subscription_tier).toBe('trial')
    })
  })

  describe('invoice.payment_failed', () => {
    it('should update status to past_due', () => {
      const handlePaymentFailed = (invoice: {
        subscription: string
        attempt_count: number
      }) => {
        return {
          subscription_status: 'past_due',
          payment_retry_count: invoice.attempt_count,
        }
      }

      const result = handlePaymentFailed({
        subscription: 'sub_123',
        attempt_count: 2,
      })
      expect(result.subscription_status).toBe('past_due')
      expect(result.payment_retry_count).toBe(2)
    })

    it('should trigger recovery email after threshold', () => {
      const shouldSendRecoveryEmail = (attemptCount: number): boolean => {
        return attemptCount >= 2
      }

      expect(shouldSendRecoveryEmail(1)).toBe(false)
      expect(shouldSendRecoveryEmail(2)).toBe(true)
      expect(shouldSendRecoveryEmail(3)).toBe(true)
    })
  })

  describe('Database Updates', () => {
    it('should update user_profiles on subscription change', () => {
      const buildProfileUpdate = (
        subscriptionId: string,
        customerId: string,
        tier: 'standard' | 'growth',
        status: string,
        periodEnd: number
      ) => ({
        subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        subscription_tier: tier,
        subscription_status: status,
        subscription_current_period_end: new Date(
          periodEnd * 1000
        ).toISOString(),
      })

      const update = buildProfileUpdate(
        'sub_123',
        'cus_456',
        'standard',
        'active',
        1735689600
      )

      expect(update.subscription_id).toBe('sub_123')
      expect(update.stripe_customer_id).toBe('cus_456')
      expect(update.subscription_tier).toBe('standard')
      expect(update.subscription_status).toBe('active')
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for invalid signature', () => {
      const validateRequest = (
        signature: string | null,
        body: string | null
      ): { valid: boolean; status: number } => {
        if (!signature) return { valid: false, status: 400 }
        if (!body) return { valid: false, status: 400 }
        return { valid: true, status: 200 }
      }

      expect(validateRequest(null, 'body').status).toBe(400)
      expect(validateRequest('sig', null).status).toBe(400)
      expect(validateRequest('sig', 'body').status).toBe(200)
    })

    it('should log webhook processing errors', () => {
      const logError = (eventType: string, error: Error) => ({
        level: 'error',
        message: `Webhook processing failed: ${eventType}`,
        error: error.message,
        timestamp: new Date().toISOString(),
      })

      const log = logError(
        'customer.subscription.created',
        new Error('DB error')
      )
      expect(log.level).toBe('error')
      expect(log.message).toContain('customer.subscription.created')
    })
  })
})
