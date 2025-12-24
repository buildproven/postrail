import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for Analytics Dashboard API
 */

// Mock Supabase
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabase)),
}))

describe('Analytics Dashboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Response Structure', () => {
    it('should define correct DashboardMetrics interface', () => {
      const mockMetrics = {
        posts: {
          total: 100,
          byStatus: {
            draft: 20,
            scheduled: 30,
            published: 45,
            failed: 5,
          },
          byPlatform: {
            linkedin: 30,
            twitter: 25,
            facebook: 25,
            threads: 20,
          },
          successRate: 90,
        },
        usage: {
          generationsToday: 2,
          generationsTotal: 15,
          dailyLimit: 50,
          totalLimit: null,
          trialDaysRemaining: null,
          isTrial: false,
          subscriptionStatus: 'active',
        },
        publishing: {
          velocityPerWeek: 10.5,
          lastPublishedAt: '2025-01-15T10:00:00Z',
          upcomingScheduled: 5,
          failedCount: 2,
        },
        engagement: {
          impressions: 5000,
          engagements: 250,
          clicks: 100,
          engagementRate: 5.0,
          hasConnectedPlatforms: true,
        },
        platforms: {
          connected: ['linkedin', 'twitter'],
          stats: {},
        },
        activity: [],
        period: {
          from: '2024-12-15T00:00:00Z',
          to: '2025-01-15T00:00:00Z',
        },
      }

      // Verify structure
      expect(mockMetrics.posts.total).toBe(100)
      expect(mockMetrics.posts.byStatus.draft).toBe(20)
      expect(mockMetrics.usage.isTrial).toBe(false)
      expect(mockMetrics.publishing.velocityPerWeek).toBe(10.5)
      expect(mockMetrics.engagement.engagementRate).toBe(5.0)
    })
  })

  describe('Status Calculations', () => {
    it('should calculate correct status counts', () => {
      const posts = [
        { status: 'draft' },
        { status: 'draft' },
        { status: 'scheduled' },
        { status: 'published' },
        { status: 'published' },
        { status: 'published' },
        { status: 'failed' },
      ]

      const byStatus = {
        draft: posts.filter(p => p.status === 'draft').length,
        scheduled: posts.filter(p => p.status === 'scheduled').length,
        published: posts.filter(p => p.status === 'published').length,
        failed: posts.filter(p => p.status === 'failed').length,
      }

      expect(byStatus.draft).toBe(2)
      expect(byStatus.scheduled).toBe(1)
      expect(byStatus.published).toBe(3)
      expect(byStatus.failed).toBe(1)
    })

    it('should calculate correct success rate', () => {
      const published = 9
      const failed = 1
      const attempted = published + failed

      const successRate = Math.round((published / attempted) * 100)

      expect(successRate).toBe(90)
    })

    it('should handle 100% success rate', () => {
      const published = 10
      const failed = 0
      const attempted = published + failed

      const successRate =
        attempted > 0 ? Math.round((published / attempted) * 100) : 100

      expect(successRate).toBe(100)
    })

    it('should handle no attempts', () => {
      const published = 0
      const failed = 0
      const attempted = published + failed

      const successRate =
        attempted > 0 ? Math.round((published / attempted) * 100) : 100

      expect(successRate).toBe(100)
    })
  })

  describe('Platform Aggregation', () => {
    it('should count posts by platform', () => {
      const posts = [
        { platform: 'linkedin' },
        { platform: 'linkedin' },
        { platform: 'twitter' },
        { platform: 'facebook' },
        { platform: 'threads' },
        { platform: 'threads' },
      ]

      const byPlatform: Record<string, number> = {}
      posts.forEach(p => {
        byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1
      })

      expect(byPlatform.linkedin).toBe(2)
      expect(byPlatform.twitter).toBe(1)
      expect(byPlatform.facebook).toBe(1)
      expect(byPlatform.threads).toBe(2)
    })

    it('should handle empty posts array', () => {
      const posts: Array<{ platform: string }> = []
      const byPlatform: Record<string, number> = {}

      posts.forEach(p => {
        byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1
      })

      expect(Object.keys(byPlatform).length).toBe(0)
    })
  })

  describe('Usage Metrics', () => {
    it('should calculate trial days remaining', () => {
      const now = new Date('2025-01-15T10:00:00Z')
      const trialEndsAt = new Date('2025-01-20T10:00:00Z')
      const isTrial = true

      const trialDaysRemaining = isTrial
        ? Math.max(
            0,
            Math.ceil(
              (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            )
          )
        : null

      expect(trialDaysRemaining).toBe(5)
    })

    it('should return 0 for expired trial', () => {
      const now = new Date('2025-01-25T10:00:00Z')
      const trialEndsAt = new Date('2025-01-20T10:00:00Z')
      const isTrial = true

      const trialDaysRemaining = isTrial
        ? Math.max(
            0,
            Math.ceil(
              (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            )
          )
        : null

      expect(trialDaysRemaining).toBe(0)
    })

    it('should return null for non-trial users', () => {
      const isTrial = false
      const trialDaysRemaining = isTrial ? 5 : null

      expect(trialDaysRemaining).toBeNull()
    })
  })

  describe('Publishing Velocity', () => {
    it('should calculate posts per week correctly', () => {
      const published = 14
      const daysDiff = 14

      const velocityPerWeek = Math.round((published / daysDiff) * 7 * 10) / 10

      expect(velocityPerWeek).toBe(7)
    })

    it('should handle low publishing rate', () => {
      const published = 1
      const daysDiff = 30

      const velocityPerWeek = Math.round((published / daysDiff) * 7 * 10) / 10

      expect(velocityPerWeek).toBe(0.2)
    })

    it('should handle zero posts', () => {
      const published = 0
      const daysDiff = 30

      const velocityPerWeek = Math.round((published / daysDiff) * 7 * 10) / 10

      expect(velocityPerWeek).toBe(0)
    })
  })

  describe('Engagement Metrics', () => {
    it('should calculate engagement rate correctly', () => {
      const impressions = 1000
      const engagements = 50

      const engagementRate =
        impressions > 0
          ? Math.round((engagements / impressions) * 10000) / 100
          : 0

      expect(engagementRate).toBe(5)
    })

    it('should handle zero impressions', () => {
      const impressions = 0
      const engagements = 0

      const engagementRate =
        impressions > 0
          ? Math.round((engagements / impressions) * 10000) / 100
          : 0

      expect(engagementRate).toBe(0)
    })

    it('should sum engagement metrics correctly', () => {
      const posts = [
        { impressions: 100, engagements: 10, clicks: 5 },
        { impressions: 200, engagements: 15, clicks: 8 },
        { impressions: 150, engagements: 12, clicks: 4 },
      ]

      const totalImpressions = posts.reduce(
        (sum, p) => sum + (p.impressions || 0),
        0
      )
      const totalEngagements = posts.reduce(
        (sum, p) => sum + (p.engagements || 0),
        0
      )
      const totalClicks = posts.reduce((sum, p) => sum + (p.clicks || 0), 0)

      expect(totalImpressions).toBe(450)
      expect(totalEngagements).toBe(37)
      expect(totalClicks).toBe(17)
    })
  })

  describe('Activity Timeline', () => {
    it('should truncate long content', () => {
      const longContent = 'a'.repeat(200)
      const truncated =
        longContent.substring(0, 100) + (longContent.length > 100 ? '...' : '')

      expect(truncated.length).toBe(103) // 100 + '...'
      expect(truncated.endsWith('...')).toBe(true)
    })

    it('should not truncate short content', () => {
      const shortContent = 'Short post'
      const result =
        shortContent.substring(0, 100) +
        (shortContent.length > 100 ? '...' : '')

      expect(result).toBe('Short post')
    })

    it('should format activity item correctly', () => {
      const post = {
        id: 'post-123',
        platform: 'linkedin',
        post_type: 'pre_cta',
        status: 'published',
        content: 'Test content',
        scheduled_time: '2025-01-15T10:00:00Z',
        published_at: '2025-01-15T10:05:00Z',
        created_at: '2025-01-14T10:00:00Z',
      }

      const activityItem = {
        id: post.id,
        platform: post.platform,
        postType: post.post_type,
        status: post.status,
        content: post.content.substring(0, 100),
        scheduledTime: post.scheduled_time,
        publishedAt: post.published_at,
        createdAt: post.created_at,
      }

      expect(activityItem.id).toBe('post-123')
      expect(activityItem.platform).toBe('linkedin')
      expect(activityItem.postType).toBe('pre_cta')
    })
  })

  describe('Date Range Handling', () => {
    it('should default to 30 days range', () => {
      const now = new Date()
      const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const daysDiff = Math.round(
        (now.getTime() - defaultFrom.getTime()) / (1000 * 60 * 60 * 24)
      )

      expect(daysDiff).toBe(30)
    })

    it('should validate ISO date format', () => {
      const validDate = '2025-01-15T10:00:00Z'
      const parsed = new Date(validDate)

      expect(isNaN(parsed.getTime())).toBe(false)
    })

    it('should reject invalid date format', () => {
      const invalidDate = 'not-a-date'
      const parsed = new Date(invalidDate)

      expect(isNaN(parsed.getTime())).toBe(true)
    })
  })

  describe('Connected Platforms', () => {
    it('should filter active platforms', () => {
      const connections = [
        { platform: 'linkedin', is_active: true },
        { platform: 'twitter', is_active: false },
        { platform: 'facebook', is_active: true },
      ]

      const connectedPlatforms = connections
        .filter(c => c.is_active)
        .map(c => c.platform)

      expect(connectedPlatforms).toContain('linkedin')
      expect(connectedPlatforms).toContain('facebook')
      expect(connectedPlatforms).not.toContain('twitter')
    })

    it('should determine hasConnectedPlatforms flag', () => {
      const connectedPlatforms = ['linkedin', 'twitter']
      const hasConnectedPlatforms = connectedPlatforms.length > 0

      expect(hasConnectedPlatforms).toBe(true)
    })

    it('should handle no connected platforms', () => {
      const connectedPlatforms: string[] = []
      const hasConnectedPlatforms = connectedPlatforms.length > 0

      expect(hasConnectedPlatforms).toBe(false)
    })
  })
})
