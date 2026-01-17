/**
 * L7: Shared Subscription Types
 *
 * Common type definitions for billing and subscriptions
 */

/**
 * Available subscription tiers
 */
export type SubscriptionTier = 'trial' | 'standard' | 'growth'

/**
 * Subscription status from Stripe
 */
export type SubscriptionStatus =
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'trialing'
  | 'unpaid'
  | 'paused'

/**
 * Subscription tier configuration
 */
export interface TierConfig {
  name: string
  displayName: string
  description: string
  price: {
    monthly: number
    yearly?: number
  }
  features: {
    generationsPerDay: number
    advancedAnalytics: boolean
    apiAccess: boolean
    scheduling: boolean
    multiPlatform: boolean
    priority_support?: boolean
  }
  limits: {
    dailyGenerations: number
    totalGenerations?: number // Only for trial
    trialDays?: number // Only for trial
  }
}

/**
 * User subscription status
 */
export interface UserSubscription {
  tier: SubscriptionTier
  status: SubscriptionStatus
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  stripeCustomerId?: string | null
  stripeSubscriptionId?: string | null
}

/**
 * Checkout session options
 */
export interface CheckoutOptions {
  tier: SubscriptionTier
  interval: 'month' | 'year'
  successUrl?: string
  cancelUrl?: string
}
