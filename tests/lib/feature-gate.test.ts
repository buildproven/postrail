/**
 * Feature Gate Unit Tests
 *
 * Tests feature gating and upgrade prompt functionality:
 * - Feature access checks
 * - Usage limit checks
 * - Tier upgrade paths
 * - Upgrade prompt generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock billing service - hoisted for vi.mock
const mockBillingService = vi.hoisted(() => ({
  hasFeatureAccess: vi.fn(),
  getSubscriptionStatus: vi.fn(),
  getUsageLimits: vi.fn(),
}))

vi.mock('@/lib/billing', () => ({
  billingService: mockBillingService,
  SUBSCRIPTION_TIERS: {
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
      price: 2900,
      dailyLimit: 50,
      platforms: 4,
      features: [
        'basic_generation',
        'manual_posting',
        'scheduling',
        'analytics_basic',
      ],
    },
    growth: {
      name: 'Growth',
      price: 5900,
      dailyLimit: 200,
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
  },
}))

// Mock Supabase
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 0, error: null }),
    }),
  })),
}))

// Mock trial guard
vi.mock('@/lib/trial-guard', () => ({
  checkTrialAccess: vi.fn().mockResolvedValue({
    allowed: true,
    status: { generationsToday: 1 },
  }),
}))

import {
  checkFeatureAccess,
  getTierUpgradePath,
  getTierFeatures,
  getUpgradePromptForLimit,
} from '@/lib/feature-gate'

describe('Feature Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkFeatureAccess', () => {
    it('should allow access when billing service allows', async () => {
      mockBillingService.hasFeatureAccess.mockResolvedValue({
        allowed: true,
        tier: 'standard',
      })

      const result = await checkFeatureAccess('user-123', 'scheduling')

      expect(result.allowed).toBe(true)
      expect(result.tier).toBe('standard')
    })

    it('should deny access and return required tier', async () => {
      mockBillingService.hasFeatureAccess.mockResolvedValue({
        allowed: false,
        tier: 'trial',
      })

      const result = await checkFeatureAccess('user-123', 'scheduling')

      expect(result.allowed).toBe(false)
      expect(result.requiredTier).toBe('standard')
      expect(result.message).toContain('standard')
    })

    it('should identify growth tier for api_access', async () => {
      mockBillingService.hasFeatureAccess.mockResolvedValue({
        allowed: false,
        tier: 'standard',
      })

      const result = await checkFeatureAccess('user-123', 'api_access')

      expect(result.allowed).toBe(false)
      expect(result.requiredTier).toBe('growth')
    })
  })

  describe('getTierUpgradePath', () => {
    it('should return standard as upgrade for trial', () => {
      expect(getTierUpgradePath('trial')).toBe('standard')
    })

    it('should return growth as upgrade for standard', () => {
      expect(getTierUpgradePath('standard')).toBe('growth')
    })

    it('should return null for growth (no upgrade available)', () => {
      expect(getTierUpgradePath('growth')).toBeNull()
    })
  })

  describe('getTierFeatures', () => {
    it('should return included features for trial tier', () => {
      const { included, notIncluded } = getTierFeatures('trial')

      expect(included).toContain('basic_generation')
      expect(included).toContain('manual_posting')
      expect(notIncluded).toContain('scheduling')
      expect(notIncluded).toContain('api_access')
    })

    it('should return included features for standard tier', () => {
      const { included, notIncluded } = getTierFeatures('standard')

      expect(included).toContain('scheduling')
      expect(included).toContain('analytics_basic')
      expect(notIncluded).toContain('api_access')
      expect(notIncluded).toContain('ab_variants')
    })

    it('should return all features included for growth tier', () => {
      const { included, notIncluded } = getTierFeatures('growth')

      expect(included).toContain('api_access')
      expect(included).toContain('ab_variants')
      expect(notIncluded.length).toBe(0)
    })
  })

  describe('getUpgradePromptForLimit', () => {
    it('should return prompt for trial daily limit', () => {
      const prompt = getUpgradePromptForLimit('trial', 'daily')

      expect(prompt).not.toBeNull()
      expect(prompt!.title).toBe('Daily Limit Reached')
      expect(prompt!.currentTier).toBe('trial')
      expect(prompt!.suggestedTier).toBe('standard')
      expect(prompt!.benefits).toContain('50 generations per day')
      expect(prompt!.ctaText).toContain('$29')
    })

    it('should return prompt for trial limit reached', () => {
      const prompt = getUpgradePromptForLimit('trial', 'trial')

      expect(prompt).not.toBeNull()
      expect(prompt!.title).toBe('Trial Limit Reached')
      expect(prompt!.message).toContain('10 trial generations')
      expect(prompt!.benefits).toContain('Unlimited total generations')
    })

    it('should return prompt for standard daily limit', () => {
      const prompt = getUpgradePromptForLimit('standard', 'daily')

      expect(prompt).not.toBeNull()
      expect(prompt!.title).toBe('Daily Limit Reached')
      expect(prompt!.suggestedTier).toBe('growth')
      expect(prompt!.benefits).toContain('200 generations per day')
      expect(prompt!.ctaText).toContain('$59')
    })

    it('should return prompt for trial feature limit', () => {
      const prompt = getUpgradePromptForLimit('trial', 'feature')

      expect(prompt).not.toBeNull()
      expect(prompt!.title).toBe('Premium Feature')
      expect(prompt!.benefits).toContain('Scheduled posting')
    })

    it('should return prompt for standard feature limit', () => {
      const prompt = getUpgradePromptForLimit('standard', 'feature')

      expect(prompt).not.toBeNull()
      expect(prompt!.title).toBe('Growth Feature')
      expect(prompt!.benefits).toContain('A/B variant testing')
    })

    it('should return null for growth tier (no upgrade)', () => {
      const prompt = getUpgradePromptForLimit('growth', 'daily')

      expect(prompt).toBeNull()
    })

    it('should include CTA URL pointing to settings', () => {
      const prompt = getUpgradePromptForLimit('trial', 'daily')

      expect(prompt!.ctaUrl).toBe('/dashboard/settings')
    })
  })

  describe('Upgrade prompt content', () => {
    it('should have actionable benefits', () => {
      const prompt = getUpgradePromptForLimit('trial', 'daily')

      prompt!.benefits.forEach(benefit => {
        expect(benefit.length).toBeGreaterThan(5)
        expect(benefit).not.toContain('undefined')
      })
    })

    it('should have concise titles', () => {
      const prompts = [
        getUpgradePromptForLimit('trial', 'daily'),
        getUpgradePromptForLimit('trial', 'trial'),
        getUpgradePromptForLimit('standard', 'daily'),
      ]

      prompts.forEach(prompt => {
        expect(prompt!.title.length).toBeLessThan(30)
      })
    })
  })
})
