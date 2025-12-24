import {
  addHours,
  subHours,
  setHours,
  setMinutes,
  isAfter,
  isBefore,
  getDay,
  addDays,
} from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'

export type Platform = 'linkedin' | 'twitter' | 'x' | 'facebook' | 'threads'
export type PostType = 'pre_cta' | 'post_cta'

interface TimeSlot {
  hour: number
  minute: number
}

interface PlatformSchedule {
  weekday: TimeSlot[]
  weekend: TimeSlot[]
}

// Best times to post by platform (based on social media research)
// Times are in local user timezone
const PLATFORM_OPTIMAL_TIMES: Record<string, PlatformSchedule> = {
  linkedin: {
    weekday: [
      { hour: 9, minute: 0 }, // 9 AM - business hours start
      { hour: 12, minute: 0 }, // 12 PM - lunch break
      { hour: 17, minute: 30 }, // 5:30 PM - end of workday
    ],
    weekend: [
      { hour: 10, minute: 0 }, // 10 AM - relaxed morning
    ],
  },
  twitter: {
    weekday: [
      { hour: 8, minute: 0 }, // 8 AM - morning commute
      { hour: 12, minute: 0 }, // 12 PM - lunch break
      { hour: 17, minute: 0 }, // 5 PM - evening commute
    ],
    weekend: [
      { hour: 9, minute: 0 }, // 9 AM - morning
      { hour: 14, minute: 0 }, // 2 PM - afternoon
    ],
  },
  x: {
    // Same as twitter
    weekday: [
      { hour: 8, minute: 0 },
      { hour: 12, minute: 0 },
      { hour: 17, minute: 0 },
    ],
    weekend: [
      { hour: 9, minute: 0 },
      { hour: 14, minute: 0 },
    ],
  },
  facebook: {
    weekday: [
      { hour: 9, minute: 0 }, // 9 AM - morning
      { hour: 13, minute: 0 }, // 1 PM - after lunch
      { hour: 16, minute: 0 }, // 4 PM - afternoon
    ],
    weekend: [
      { hour: 12, minute: 0 }, // 12 PM - noon
      { hour: 15, minute: 0 }, // 3 PM - afternoon
    ],
  },
  threads: {
    weekday: [
      { hour: 8, minute: 0 }, // 8 AM - morning
      { hour: 12, minute: 0 }, // 12 PM - lunch
      { hour: 17, minute: 0 }, // 5 PM - evening
    ],
    weekend: [
      { hour: 10, minute: 0 }, // 10 AM - morning
      { hour: 15, minute: 0 }, // 3 PM - afternoon
    ],
  },
}

// Schedule windows for pre/post CTA
const SCHEDULE_WINDOWS = {
  pre_cta: {
    minHoursBefore: 8, // At least 8 hours before newsletter
    maxHoursBefore: 24, // At most 24 hours before newsletter
  },
  post_cta: {
    minHoursAfter: 48, // At least 48 hours after newsletter
    maxHoursAfter: 72, // At most 72 hours after newsletter
  },
} as const

export interface ScheduleOptions {
  newsletterPublishDate: Date
  postType: PostType
  platform: Platform
  timezone: string
}

export interface SmartScheduleResult {
  scheduledTime: Date
  localTime: string
  reason: string
  isOptimal: boolean
}

function isWeekend(date: Date): boolean {
  const day = getDay(date)
  return day === 0 || day === 6 // Sunday or Saturday
}

function setTimeOnDate(date: Date, slot: TimeSlot): Date {
  return setMinutes(setHours(date, slot.hour), slot.minute)
}

function getOptimalSlotsForDay(platform: Platform, date: Date): TimeSlot[] {
  const schedule =
    PLATFORM_OPTIMAL_TIMES[platform] || PLATFORM_OPTIMAL_TIMES.twitter
  return isWeekend(date) ? schedule.weekend : schedule.weekday
}

/**
 * Find the best posting time within a window
 * Considers platform best practices and user timezone
 */
export function calculateOptimalTime(
  options: ScheduleOptions
): SmartScheduleResult {
  const { newsletterPublishDate, postType, platform, timezone } = options

  // Convert newsletter publish date to user's timezone
  const publishDateInTz = toZonedTime(newsletterPublishDate, timezone)

  // Calculate the window bounds
  let windowStart: Date
  let windowEnd: Date

  if (postType === 'pre_cta') {
    windowEnd = subHours(
      publishDateInTz,
      SCHEDULE_WINDOWS.pre_cta.minHoursBefore
    )
    windowStart = subHours(
      publishDateInTz,
      SCHEDULE_WINDOWS.pre_cta.maxHoursBefore
    )
  } else {
    windowStart = addHours(
      publishDateInTz,
      SCHEDULE_WINDOWS.post_cta.minHoursAfter
    )
    windowEnd = addHours(
      publishDateInTz,
      SCHEDULE_WINDOWS.post_cta.maxHoursAfter
    )
  }

  // Make sure window doesn't start in the past
  const now = toZonedTime(new Date(), timezone)
  if (isBefore(windowStart, now)) {
    windowStart = addHours(now, 1) // At least 1 hour from now
  }

  // If the entire window is in the past, return null equivalent
  if (isBefore(windowEnd, windowStart)) {
    // Fallback: schedule as soon as possible
    const fallbackTime = addHours(now, 1)
    return {
      scheduledTime: fromZonedTime(fallbackTime, timezone),
      localTime: formatLocalTime(fallbackTime),
      reason: 'Scheduled ASAP - optimal window has passed',
      isOptimal: false,
    }
  }

  // Find optimal time slots within the window
  const candidates: Array<{ date: Date; slot: TimeSlot; score: number }> = []

  // Check each day in the window
  let currentDay = new Date(windowStart)
  while (
    isBefore(currentDay, windowEnd) ||
    currentDay.getTime() === windowEnd.getTime()
  ) {
    const slots = getOptimalSlotsForDay(platform, currentDay)

    for (const slot of slots) {
      const candidateTime = setTimeOnDate(currentDay, slot)

      // Check if candidate is within window
      if (
        isAfter(candidateTime, windowStart) &&
        isBefore(candidateTime, windowEnd)
      ) {
        // Score based on slot position (first slots are generally best)
        const slotIndex = slots.indexOf(slot)
        const score = 100 - slotIndex * 10

        candidates.push({ date: candidateTime, slot, score })
      }
    }

    currentDay = addDays(currentDay, 1)
  }

  // If we found optimal slots, pick the best one
  if (candidates.length > 0) {
    // Sort by score (highest first)
    candidates.sort((a, b) => b.score - a.score)
    const best = candidates[0]

    return {
      scheduledTime: fromZonedTime(best.date, timezone),
      localTime: formatLocalTime(best.date),
      reason: `Optimal time for ${platform}: ${formatSlot(best.slot)}`,
      isOptimal: true,
    }
  }

  // No optimal slots found - use middle of window
  const middleTime = new Date((windowStart.getTime() + windowEnd.getTime()) / 2)
  // Round to nearest 30 minutes
  middleTime.setMinutes(Math.round(middleTime.getMinutes() / 30) * 30)
  middleTime.setSeconds(0)
  middleTime.setMilliseconds(0)

  return {
    scheduledTime: fromZonedTime(middleTime, timezone),
    localTime: formatLocalTime(middleTime),
    reason: 'Scheduled within window - no optimal slot available',
    isOptimal: false,
  }
}

/**
 * Get the next optimal posting time for a platform
 * Useful for immediate scheduling
 */
export function getNextOptimalSlot(
  platform: Platform,
  afterDate: Date,
  timezone: string
): SmartScheduleResult {
  const afterInTz = toZonedTime(afterDate, timezone)

  // Check today and next 3 days
  for (let dayOffset = 0; dayOffset <= 3; dayOffset++) {
    const checkDay = addDays(afterInTz, dayOffset)
    const slots = getOptimalSlotsForDay(platform, checkDay)

    for (const slot of slots) {
      const candidateTime = setTimeOnDate(checkDay, slot)

      if (isAfter(candidateTime, afterInTz)) {
        return {
          scheduledTime: fromZonedTime(candidateTime, timezone),
          localTime: formatLocalTime(candidateTime),
          reason: `Next optimal time for ${platform}`,
          isOptimal: true,
        }
      }
    }
  }

  // Fallback: 1 hour from now
  const fallback = addHours(afterInTz, 1)
  return {
    scheduledTime: fromZonedTime(fallback, timezone),
    localTime: formatLocalTime(fallback),
    reason: 'Next available slot',
    isOptimal: false,
  }
}

/**
 * Calculate bulk schedule times for all posts of a newsletter
 */
export function calculateBulkSchedule(
  newsletterPublishDate: Date,
  platforms: Platform[],
  timezone: string
): Map<string, SmartScheduleResult> {
  const results = new Map<string, SmartScheduleResult>()

  for (const platform of platforms) {
    for (const postType of ['pre_cta', 'post_cta'] as PostType[]) {
      const key = `${platform}:${postType}`
      const result = calculateOptimalTime({
        newsletterPublishDate,
        postType,
        platform,
        timezone,
      })
      results.set(key, result)
    }
  }

  return results
}

/**
 * Get the default schedule window for display in UI
 */
export function getScheduleWindow(postType: PostType): {
  minHours: number
  maxHours: number
  label: string
} {
  if (postType === 'pre_cta') {
    return {
      minHours: SCHEDULE_WINDOWS.pre_cta.minHoursBefore,
      maxHours: SCHEDULE_WINDOWS.pre_cta.maxHoursBefore,
      label: '8-24 hours before newsletter',
    }
  }
  return {
    minHours: SCHEDULE_WINDOWS.post_cta.minHoursAfter,
    maxHours: SCHEDULE_WINDOWS.post_cta.maxHoursAfter,
    label: '48-72 hours after newsletter',
  }
}

/**
 * Get platform display info for optimal times
 */
export function getPlatformOptimalTimes(platform: Platform): {
  weekday: string[]
  weekend: string[]
} {
  const schedule =
    PLATFORM_OPTIMAL_TIMES[platform] || PLATFORM_OPTIMAL_TIMES.twitter
  return {
    weekday: schedule.weekday.map(formatSlot),
    weekend: schedule.weekend.map(formatSlot),
  }
}

// Helper functions
function formatSlot(slot: TimeSlot): string {
  const hour = slot.hour % 12 || 12
  const ampm = slot.hour >= 12 ? 'PM' : 'AM'
  const minutes =
    slot.minute > 0 ? `:${slot.minute.toString().padStart(2, '0')}` : ''
  return `${hour}${minutes} ${ampm}`
}

function formatLocalTime(date: Date): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// Common timezone list for UI dropdown
export const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  { value: 'Pacific/Auckland', label: 'Auckland (NZST)' },
] as const

export type TimezoneValue = (typeof COMMON_TIMEZONES)[number]['value']
