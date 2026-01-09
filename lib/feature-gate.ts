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
import { checkTrialAccess } from '@/lib/trial-guard'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

type AnySupabaseClient = SupabaseClient

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
 * Get or create Supabase client for server operations
 * Throws if server client cannot be created (authentication context missing)
 */
async function getServerClient(
  providedClient?: AnySupabaseClient
): Promise<AnySupabaseClient> {
  if (providedClient) {
    return providedClient
  }

  try {
    return await createClient()
  } catch (serverClientError) {
    const error =
      serverClientError instanceof Error
        ? serverClientError
        : new Error(String(serverClientError))
    throw new Error(
      `Unable to access database - authentication context missing: ${error.message}`
    )
  }
}

/**
 * Check usage limits (daily generations)
 * M3 fix: Accept optional supabase client to prefer server client (RLS) over service client
 */
export async function checkUsageLimits(
  userId: string,
  supabaseClient?: AnySupabaseClient
): Promise<{
  allowed: boolean
  remaining: number
  limit: number
  tier: SubscriptionTier
}> {
  const status = await billingService.getSubscriptionStatus(userId)
  const limits = await billingService.getUsageLimits(userId)

  if (status.tier === 'trial') {
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

  const supabase = await getServerClient(supabaseClient)

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
 * M3 fix: Accept optional supabase client to prefer server client (RLS) over service client
 */
export async function checkPlatformLimits(
  userId: string,
  supabaseClient?: AnySupabaseClient
): Promise<{
  allowed: boolean
  connected: number
  limit: number
  tier: SubscriptionTier
}> {
  const limits = await billingService.getUsageLimits(userId)
  const supabase = await getServerClient(supabaseClient)

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

/**
 * Upgrade prompt data for when users hit limits
 */
export interface UpgradePrompt {
  title: string
  message: string
  currentTier: SubscriptionTier
  suggestedTier: SubscriptionTier
  benefits: string[]
  ctaText: string
  ctaUrl: string
}

/**
 * Get upgrade prompt for usage limits
 */
export function getUpgradePromptForLimit(
  currentTier: SubscriptionTier,
  limitType: 'daily' | 'trial' | 'feature'
): UpgradePrompt | null {
  const nextTier = getTierUpgradePath(currentTier)
  if (!nextTier) return null

  const prompts: Record<string, UpgradePrompt> = {
    'trial:daily': {
      title: 'Daily Limit Reached',
      message:
        "You've used your 3 daily generations. Upgrade to continue creating posts.",
      currentTier: 'trial',
      suggestedTier: 'standard',
      benefits: [
        '50 generations per day',
        'Scheduled posting',
        'Basic analytics',
        'All 4 platforms',
      ],
      ctaText: 'Upgrade to Standard - $29/mo',
      ctaUrl: '/dashboard/settings',
    },
    'trial:trial': {
      title: 'Trial Limit Reached',
      message:
        "You've used all 10 trial generations. Upgrade to unlock unlimited access.",
      currentTier: 'trial',
      suggestedTier: 'standard',
      benefits: [
        'Unlimited total generations',
        '50 per day',
        'Post scheduling',
        'Analytics dashboard',
      ],
      ctaText: 'Start Standard Plan - $29/mo',
      ctaUrl: '/dashboard/settings',
    },
    'standard:daily': {
      title: 'Daily Limit Reached',
      message: "You've hit your 50 daily generations. Upgrade for 200/day.",
      currentTier: 'standard',
      suggestedTier: 'growth',
      benefits: [
        '200 generations per day',
        'Advanced analytics',
        'A/B variant testing',
        'API access',
        'Priority support',
      ],
      ctaText: 'Upgrade to Growth - $59/mo',
      ctaUrl: '/dashboard/settings',
    },
    'trial:feature': {
      title: 'Premium Feature',
      message: 'This feature requires a paid subscription.',
      currentTier: 'trial',
      suggestedTier: 'standard',
      benefits: [
        'Scheduled posting',
        'Analytics dashboard',
        'Unlimited generations',
      ],
      ctaText: 'Upgrade Now - $29/mo',
      ctaUrl: '/dashboard/settings',
    },
    'standard:feature': {
      title: 'Growth Feature',
      message: 'This feature is available on the Growth plan.',
      currentTier: 'standard',
      suggestedTier: 'growth',
      benefits: [
        'A/B variant testing',
        'Advanced analytics',
        'API access',
        'Priority support',
      ],
      ctaText: 'Upgrade to Growth - $59/mo',
      ctaUrl: '/dashboard/settings',
    },
  }

  const key = `${currentTier}:${limitType}`
  return prompts[key] || null
}
