/**
 * Feature Gate - Subscription-based feature access control
 *
 * Enforces feature access based on subscription tier:
 * - Trial: basic_generation, manual_posting
 * - Standard: + scheduling, analytics_basic
 * - Growth: + analytics_advanced, bulk_generation, priority_support, api_access
 */

import {
  billingService,
  SUBSCRIPTION_TIERS,
  SubscriptionTier,
} from '@/lib/billing'
import { NextResponse } from 'next/server'

export type Feature =
  | 'basic_generation'
  | 'manual_posting'
  | 'scheduling'
  | 'analytics_basic'
  | 'analytics_advanced'
  | 'bulk_generation'
  | 'priority_support'
  | 'api_access'
  | 'ab_variants'

export interface FeatureCheckResult {
  allowed: boolean
  tier: SubscriptionTier
  requiredTier?: SubscriptionTier
  message?: string
}

/**
 * Check if a user has access to a specific feature
 */
export async function checkFeatureAccess(
  userId: string,
  feature: Feature
): Promise<FeatureCheckResult> {
  const { allowed, tier } = await billingService.hasFeatureAccess(
    userId,
    feature
  )

  if (allowed) {
    return { allowed: true, tier }
  }

  // Find the minimum tier that has this feature
  const requiredTier = (
    Object.entries(SUBSCRIPTION_TIERS) as [
      SubscriptionTier,
      (typeof SUBSCRIPTION_TIERS)[SubscriptionTier],
    ][]
  ).find(([, config]) =>
    (config.features as readonly string[]).includes(feature)
  )?.[0]

  return {
    allowed: false,
    tier,
    requiredTier,
    message: `This feature requires a ${requiredTier || 'paid'} subscription`,
  }
}

/**
 * Feature gate middleware wrapper for API routes
 */
export function requireFeature(feature: Feature) {
  return async function gate(
    userId: string | null,
    handler: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const check = await checkFeatureAccess(userId, feature)

    if (!check.allowed) {
      return NextResponse.json(
        {
          error: 'Feature not available',
          message: check.message,
          requiredTier: check.requiredTier,
          currentTier: check.tier,
        },
        { status: 403 }
      )
    }

    return handler()
  }
}

/**
 * Check usage limits (daily generations)
 */
export async function checkUsageLimits(userId: string): Promise<{
  allowed: boolean
  remaining: number
  limit: number
  tier: SubscriptionTier
}> {
  const status = await billingService.getSubscriptionStatus(userId)
  const limits = await billingService.getUsageLimits(userId)

  // For trial users, use the trial guard
  if (status.tier === 'trial') {
    const { checkTrialAccess } = await import('@/lib/trial-guard')
    const trialCheck = await checkTrialAccess(userId)

    return {
      allowed: trialCheck.allowed,
      remaining: trialCheck.status
        ? limits.dailyLimit - trialCheck.status.generationsToday
        : 0,
      limit: limits.dailyLimit,
      tier: 'trial',
    }
  }

  // For paid users, check daily count
  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())

  const used = count || 0
  const remaining = Math.max(0, limits.dailyLimit - used)

  return {
    allowed: remaining > 0,
    remaining,
    limit: limits.dailyLimit,
    tier: status.tier,
  }
}

/**
 * Check platform connection limits
 */
export async function checkPlatformLimits(userId: string): Promise<{
  allowed: boolean
  connected: number
  limit: number
  tier: SubscriptionTier
}> {
  const limits = await billingService.getUsageLimits(userId)

  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()

  const { count } = await supabase
    .from('platform_connections')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true)

  const connected = count || 0

  return {
    allowed: connected < limits.platforms,
    connected,
    limit: limits.platforms,
    tier: limits.tier,
  }
}

/**
 * Helper to get tier comparison for upgrade prompts
 */
export function getTierUpgradePath(
  currentTier: SubscriptionTier
): SubscriptionTier | null {
  const upgrades: Record<SubscriptionTier, SubscriptionTier | null> = {
    trial: 'standard',
    standard: 'growth',
    growth: null,
  }

  return upgrades[currentTier]
}

/**
 * Get all features for a tier (for UI display)
 */
export function getTierFeatures(tier: SubscriptionTier): {
  included: Feature[]
  notIncluded: Feature[]
} {
  const allFeatures: Feature[] = [
    'basic_generation',
    'manual_posting',
    'scheduling',
    'analytics_basic',
    'analytics_advanced',
    'bulk_generation',
    'priority_support',
    'api_access',
    'ab_variants',
  ]

  const tierConfig = SUBSCRIPTION_TIERS[tier]
  const included = [...tierConfig.features] as Feature[]
  const notIncluded = allFeatures.filter(f => !included.includes(f))

  return { included, notIncluded }
}
