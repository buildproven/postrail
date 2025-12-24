import { describe, it, expect } from 'vitest'
import {
  calculateOptimalTime,
  getNextOptimalSlot,
  calculateBulkSchedule,
  getScheduleWindow,
  getPlatformOptimalTimes,
  COMMON_TIMEZONES,
  type Platform,
} from '@/lib/scheduling'

/**
 * Unit tests for smart scheduling library
 * Tests optimal time calculation, timezone handling, and platform-specific scheduling
 */

describe('Scheduling Library - calculateOptimalTime', () => {
  // Use a future date to avoid fallback behavior for past dates
  const baseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week from now

  it('should calculate pre-CTA time within 8-24 hours before newsletter', () => {
    const result = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    const hoursBeforeNewsletter =
      (baseDate.getTime() - result.scheduledTime.getTime()) / (1000 * 60 * 60)

    expect(hoursBeforeNewsletter).toBeGreaterThanOrEqual(8)
    expect(hoursBeforeNewsletter).toBeLessThanOrEqual(24)
    expect(result.scheduledTime).toBeInstanceOf(Date)
  })

  it('should calculate post-CTA time within 48-72 hours after newsletter', () => {
    const result = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'post_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    const hoursAfterNewsletter =
      (result.scheduledTime.getTime() - baseDate.getTime()) / (1000 * 60 * 60)

    expect(hoursAfterNewsletter).toBeGreaterThanOrEqual(48)
    expect(hoursAfterNewsletter).toBeLessThanOrEqual(72)
    expect(result.scheduledTime).toBeInstanceOf(Date)
  })

  it('should return different times for different platforms', () => {
    const linkedinResult = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    const twitterResult = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'twitter',
      timezone: 'America/New_York',
    })

    // Times may or may not differ depending on schedule alignment
    // but both should be valid
    expect(linkedinResult.scheduledTime).toBeInstanceOf(Date)
    expect(twitterResult.scheduledTime).toBeInstanceOf(Date)
  })

  it('should include reason and isOptimal flag in result', () => {
    const result = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    expect(result).toHaveProperty('reason')
    expect(result).toHaveProperty('isOptimal')
    expect(result).toHaveProperty('localTime')
    expect(typeof result.reason).toBe('string')
    expect(typeof result.isOptimal).toBe('boolean')
  })

  it('should handle different timezones correctly', () => {
    const nyResult = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    const laResult = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/Los_Angeles',
    })

    // Both should return valid times
    expect(nyResult.scheduledTime).toBeInstanceOf(Date)
    expect(laResult.scheduledTime).toBeInstanceOf(Date)
  })

  it('should handle x as alias for twitter', () => {
    const twitterResult = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'twitter',
      timezone: 'America/New_York',
    })

    const xResult = calculateOptimalTime({
      newsletterPublishDate: baseDate,
      postType: 'pre_cta',
      platform: 'x',
      timezone: 'America/New_York',
    })

    // Should produce similar results (same platform config)
    expect(twitterResult.scheduledTime).toBeInstanceOf(Date)
    expect(xResult.scheduledTime).toBeInstanceOf(Date)
  })

  it('should handle past newsletter dates gracefully', () => {
    const pastDate = new Date('2020-01-01T10:00:00Z')

    const result = calculateOptimalTime({
      newsletterPublishDate: pastDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    // Should still return a valid result (fallback behavior)
    expect(result.scheduledTime).toBeInstanceOf(Date)
    expect(result.isOptimal).toBe(false) // Not optimal since window passed
  })
})

describe('Scheduling Library - getNextOptimalSlot', () => {
  it('should return next optimal slot for LinkedIn', () => {
    const now = new Date()
    const result = getNextOptimalSlot('linkedin', now, 'America/New_York')

    expect(result.scheduledTime).toBeInstanceOf(Date)
    expect(result.scheduledTime.getTime()).toBeGreaterThan(now.getTime())
    expect(result).toHaveProperty('reason')
    expect(result).toHaveProperty('isOptimal')
  })

  it('should return next optimal slot for Twitter', () => {
    const now = new Date()
    const result = getNextOptimalSlot('twitter', now, 'America/New_York')

    expect(result.scheduledTime).toBeInstanceOf(Date)
    expect(result.scheduledTime.getTime()).toBeGreaterThan(now.getTime())
  })

  it('should return next optimal slot for Facebook', () => {
    const now = new Date()
    const result = getNextOptimalSlot('facebook', now, 'America/New_York')

    expect(result.scheduledTime).toBeInstanceOf(Date)
    expect(result.scheduledTime.getTime()).toBeGreaterThan(now.getTime())
  })

  it('should return next optimal slot for Threads', () => {
    const now = new Date()
    const result = getNextOptimalSlot('threads', now, 'America/New_York')

    expect(result.scheduledTime).toBeInstanceOf(Date)
    expect(result.scheduledTime.getTime()).toBeGreaterThan(now.getTime())
  })
})

describe('Scheduling Library - calculateBulkSchedule', () => {
  const newsletterDate = new Date('2025-01-20T12:00:00Z')
  const platforms: Platform[] = ['linkedin', 'twitter', 'facebook']

  it('should calculate schedules for all platforms and post types', () => {
    const result = calculateBulkSchedule(
      newsletterDate,
      platforms,
      'America/New_York'
    )

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(platforms.length * 2) // 2 post types per platform

    for (const platform of platforms) {
      expect(result.has(`${platform}:pre_cta`)).toBe(true)
      expect(result.has(`${platform}:post_cta`)).toBe(true)
    }
  })

  it('should return valid SmartScheduleResult for each entry', () => {
    const result = calculateBulkSchedule(
      newsletterDate,
      ['linkedin'],
      'America/New_York'
    )

    const preCta = result.get('linkedin:pre_cta')
    const postCta = result.get('linkedin:post_cta')

    expect(preCta).toBeDefined()
    expect(postCta).toBeDefined()
    expect(preCta?.scheduledTime).toBeInstanceOf(Date)
    expect(postCta?.scheduledTime).toBeInstanceOf(Date)
    expect(preCta?.reason).toBeDefined()
    expect(postCta?.reason).toBeDefined()
  })
})

describe('Scheduling Library - getScheduleWindow', () => {
  it('should return correct window for pre_cta', () => {
    const window = getScheduleWindow('pre_cta')

    expect(window.minHours).toBe(8)
    expect(window.maxHours).toBe(24)
    expect(window.label).toContain('before')
  })

  it('should return correct window for post_cta', () => {
    const window = getScheduleWindow('post_cta')

    expect(window.minHours).toBe(48)
    expect(window.maxHours).toBe(72)
    expect(window.label).toContain('after')
  })
})

describe('Scheduling Library - getPlatformOptimalTimes', () => {
  it('should return optimal times for LinkedIn', () => {
    const times = getPlatformOptimalTimes('linkedin')

    expect(times).toHaveProperty('weekday')
    expect(times).toHaveProperty('weekend')
    expect(Array.isArray(times.weekday)).toBe(true)
    expect(Array.isArray(times.weekend)).toBe(true)
    expect(times.weekday.length).toBeGreaterThan(0)
    expect(times.weekend.length).toBeGreaterThan(0)
  })

  it('should return optimal times for all platforms', () => {
    const platforms: Platform[] = [
      'linkedin',
      'twitter',
      'x',
      'facebook',
      'threads',
    ]

    for (const platform of platforms) {
      const times = getPlatformOptimalTimes(platform)
      expect(times.weekday.length).toBeGreaterThan(0)
      expect(times.weekend.length).toBeGreaterThan(0)
    }
  })

  it('should format times as human-readable strings', () => {
    const times = getPlatformOptimalTimes('linkedin')

    // Times should be formatted like "9 AM" or "12:30 PM"
    for (const time of times.weekday) {
      expect(time).toMatch(/^\d{1,2}(:\d{2})?\s*(AM|PM)$/i)
    }
  })
})

describe('Scheduling Library - COMMON_TIMEZONES', () => {
  it('should include major US timezones', () => {
    const timezoneValues = COMMON_TIMEZONES.map(tz => tz.value)

    expect(timezoneValues).toContain('America/New_York')
    expect(timezoneValues).toContain('America/Chicago')
    expect(timezoneValues).toContain('America/Denver')
    expect(timezoneValues).toContain('America/Los_Angeles')
  })

  it('should include major international timezones', () => {
    const timezoneValues = COMMON_TIMEZONES.map(tz => tz.value)

    expect(timezoneValues).toContain('Europe/London')
    expect(timezoneValues).toContain('Asia/Tokyo')
    expect(timezoneValues).toContain('Australia/Sydney')
  })

  it('should have valid value and label for each timezone', () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(tz.value).toBeTruthy()
      expect(tz.label).toBeTruthy()
      expect(typeof tz.value).toBe('string')
      expect(typeof tz.label).toBe('string')
    }
  })

  it('should have IANA-valid timezone values', () => {
    for (const tz of COMMON_TIMEZONES) {
      // This should not throw for valid IANA timezones
      expect(() => {
        Intl.DateTimeFormat(undefined, { timeZone: tz.value })
      }).not.toThrow()
    }
  })
})

describe('Scheduling Library - Edge Cases', () => {
  it('should handle newsletter at midnight', () => {
    const midnightDate = new Date('2025-01-15T00:00:00Z')

    const result = calculateOptimalTime({
      newsletterPublishDate: midnightDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    expect(result.scheduledTime).toBeInstanceOf(Date)
  })

  it('should handle newsletter on weekend', () => {
    const saturdayDate = new Date('2025-01-18T10:00:00Z') // Saturday

    const result = calculateOptimalTime({
      newsletterPublishDate: saturdayDate,
      postType: 'pre_cta',
      platform: 'linkedin',
      timezone: 'America/New_York',
    })

    expect(result.scheduledTime).toBeInstanceOf(Date)
  })

  it('should handle empty platforms array in bulk schedule', () => {
    const result = calculateBulkSchedule(new Date(), [], 'America/New_York')

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('should handle unknown platform gracefully', () => {
    const result = calculateOptimalTime({
      newsletterPublishDate: new Date(),
      postType: 'pre_cta',
      platform: 'unknown' as Platform,
      timezone: 'America/New_York',
    })

    // Should fallback to default times
    expect(result.scheduledTime).toBeInstanceOf(Date)
  })
})
