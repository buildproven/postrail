/**
 * BillingService - Stripe billing wrapper for PostRail
 *
 * Handles:
 * - Multi-tier subscriptions (Standard $29, Growth $59)
 * - Customer management
 * - Subscription lifecycle
 * - Usage-based feature gating
 */

import Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/service'

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  trial: {
    name: 'Trial',
    price: 0,
    dailyLimit: 3,
    totalLimit: 10,
    platforms: 2,
    features: ['basic_generation', 'manual_posting'],
  },
  standard: {
    name: 'Standard',
    price: 2900, // cents
    priceId: process.env.STRIPE_PRICE_STANDARD,
    dailyLimit: 50,
    totalLimit: Infinity,
    platforms: 4,
    features: [
      'basic_generation',
      'manual_posting',
      'scheduling',
      'analytics_basic',
      'ab_variants',
    ],
  },
  growth: {
    name: 'Growth',
    price: 5900, // cents
    priceId: process.env.STRIPE_PRICE_GROWTH,
    dailyLimit: 200,
    totalLimit: Infinity,
    platforms: Infinity,
    features: [
      'basic_generation',
      'manual_posting',
      'scheduling',
      'analytics_basic',
      'analytics_advanced',
      'bulk_generation',
      'priority_support',
      'api_access',
      'ab_variants',
    ],
  },
} as const

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS

export interface SubscriptionStatus {
  tier: SubscriptionTier
  status: 'trial' | 'active' | 'cancelled' | 'past_due' | 'expired'
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  currentPeriodEnd?: Date
  cancelAtPeriodEnd?: boolean
}

export interface CheckoutOptions {
  tier: 'standard' | 'growth'
  successUrl: string
  cancelUrl: string
}

class BillingService {
  private stripe: Stripe | null = null

  private getStripe(): Stripe {
    if (this.stripe) return this.stripe

    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }

    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-12-15.clover',
    })

    return this.stripe
  }

  private isConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY
  }

  /**
   * Get or create a Stripe customer for a user
   */
  async getOrCreateCustomer(
    userId: string,
    email: string
  ): Promise<string | null> {
    if (!this.isConfigured()) return null

    const supabase = createServiceClient()
    const stripe = this.getStripe()

    // Check if user already has a Stripe customer ID
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (profile?.stripe_customer_id) {
      return profile.stripe_customer_id
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      metadata: { userId },
    })

    // Store customer ID
    await supabase
      .from('user_profiles')
      .update({ stripe_customer_id: customer.id })
      .eq('id', userId)

    return customer.id
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(
    userId: string,
    email: string,
    options: CheckoutOptions
  ): Promise<{ url: string } | { error: string }> {
    if (!this.isConfigured()) {
      // Return mock URL for development
      return {
        url: `${options.successUrl}?mock=true&tier=${options.tier}`,
      }
    }

    const stripe = this.getStripe()
    const tier = SUBSCRIPTION_TIERS[options.tier]

    if (!tier.priceId) {
      return { error: `Price ID not configured for ${options.tier} tier` }
    }

    try {
      const customerId = await this.getOrCreateCustomer(userId, email)

      const session = await stripe.checkout.sessions.create({
        customer: customerId || undefined,
        customer_email: customerId ? undefined : email,
        payment_method_types: ['card'],
        billing_address_collection: 'auto',
        line_items: [
          {
            price: tier.priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${options.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: options.cancelUrl,
        metadata: {
          userId,
          tier: options.tier,
        },
        subscription_data: {
          metadata: {
            userId,
            tier: options.tier,
          },
        },
        allow_promotion_codes: true,
      })

      return { url: session.url || options.cancelUrl }
    } catch (error) {
      console.error('Stripe checkout error:', error)
      return { error: 'Failed to create checkout session' }
    }
  }

  /**
   * Create a customer portal session for managing subscription
   */
  async createPortalSession(
    userId: string
  ): Promise<{ url: string } | { error: string }> {
    if (!this.isConfigured()) {
      return { error: 'Billing not configured' }
    }

    const supabase = createServiceClient()
    const stripe = this.getStripe()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (!profile?.stripe_customer_id) {
      return { error: 'No billing account found' }
    }

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
      })

      return { url: session.url }
    } catch (error) {
      console.error('Portal session error:', error)
      return { error: 'Failed to create portal session' }
    }
  }

  /**
   * Get subscription status for a user
   */
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
    const supabase = createServiceClient()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select(
        'subscription_status, subscription_id, stripe_customer_id, trial_ends_at, subscription_tier, subscription_current_period_end, subscription_cancel_at_period_end'
      )
      .eq('id', userId)
      .single()

    if (!profile) {
      return { tier: 'trial', status: 'trial' }
    }

    // Check if trial has expired
    if (profile.subscription_status === 'trial') {
      const trialEnds = new Date(profile.trial_ends_at)
      if (new Date() > trialEnds) {
        return { tier: 'trial', status: 'expired' }
      }
    }

    return {
      tier: (profile.subscription_tier as SubscriptionTier) || 'trial',
      status: profile.subscription_status || 'trial',
      stripeCustomerId: profile.stripe_customer_id,
      stripeSubscriptionId: profile.subscription_id,
      currentPeriodEnd: profile.subscription_current_period_end
        ? new Date(profile.subscription_current_period_end)
        : undefined,
      cancelAtPeriodEnd: profile.subscription_cancel_at_period_end || false,
    }
  }

  /**
   * Update subscription status in database (called from webhook)
   */
  async updateSubscriptionFromWebhook(
    customerId: string,
    subscription: Stripe.Subscription
  ): Promise<void> {
    const supabase = createServiceClient()

    // Determine tier from price ID
    let tier: SubscriptionTier = 'trial'
    const priceId = subscription.items.data[0]?.price.id

    if (priceId === process.env.STRIPE_PRICE_STANDARD) {
      tier = 'standard'
    } else if (priceId === process.env.STRIPE_PRICE_GROWTH) {
      tier = 'growth'
    }

    // Map Stripe status to our status
    const statusMap: Partial<
      Record<Stripe.Subscription.Status, SubscriptionStatus['status']>
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

    // Get current period end from first subscription item (Stripe API 2025-11-17+)
    const firstItem = subscription.items?.data?.[0]
    const currentPeriodEnd = firstItem?.current_period_end

    await supabase
      .from('user_profiles')
      .update({
        subscription_status: statusMap[subscription.status] || 'trial',
        subscription_id: subscription.id,
        subscription_tier: tier,
        subscription_current_period_end: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        subscription_cancel_at_period_end: subscription.cancel_at_period_end,
      })
      .eq('stripe_customer_id', customerId)
  }

  /**
   * Handle subscription cancellation
   */
  async handleSubscriptionCancelled(customerId: string): Promise<void> {
    const supabase = createServiceClient()

    await supabase
      .from('user_profiles')
      .update({
        subscription_status: 'cancelled',
        subscription_tier: 'trial',
      })
      .eq('stripe_customer_id', customerId)
  }

  /**
   * Check if user has access to a feature
   */
  async hasFeatureAccess(
    userId: string,
    feature: string
  ): Promise<{ allowed: boolean; tier: SubscriptionTier }> {
    const status = await this.getSubscriptionStatus(userId)

    if (status.status === 'expired' || status.status === 'cancelled') {
      return { allowed: false, tier: status.tier }
    }

    const tierConfig = SUBSCRIPTION_TIERS[status.tier]
    const allowed = (tierConfig.features as readonly string[]).includes(feature)

    return { allowed, tier: status.tier }
  }

  /**
   * Get usage limits for a user
   */
  async getUsageLimits(userId: string): Promise<{
    dailyLimit: number
    platforms: number
    tier: SubscriptionTier
  }> {
    const status = await this.getSubscriptionStatus(userId)
    const tierConfig = SUBSCRIPTION_TIERS[status.tier]

    return {
      dailyLimit: tierConfig.dailyLimit,
      platforms: tierConfig.platforms,
      tier: status.tier,
    }
  }
}

// Export singleton instance
export const billingService = new BillingService()

// Export class for testing
export { BillingService }
