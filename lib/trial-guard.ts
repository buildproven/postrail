/**
 * Trial Guard - Rate limiting and abuse protection for trial users
 *
 * Enforces:
 * - 3 generations per day per trial user
 * - 10 generations total during 14-day trial
 * - Global daily cap of 200 trial generations
 * - Disposable email blocking
 * - One trial per email + IP (soft-enforced)
 *
 * For independent deployments:
 * - Set BILLING_ENABLED=false to disable all trial limits
 * - All users get unlimited access
 */

import { createServiceClient } from '@/lib/supabase/service'
import { logger, security } from '@/lib/logger'
import { isBillingEnabled } from '@/lib/billing'
import { classifyError } from '@/lib/error-classification'
import { sendCriticalAlert } from '@/lib/alerts'

export interface TrialStatus {
  allowed: boolean
  reason?: string
  isTrial: boolean
  trialEnded: boolean
  trialDaysRemaining: number
  generationsToday: number
  generationsTotal: number
  dailyLimit: number
  totalLimit: number
}

export interface TrialCheckResult {
  allowed: boolean
  error?: string
  retryable?: boolean
  suggestedAction?: string
  status?: TrialStatus
  headers?: Record<string, string>
}

// System limits (cached, refreshed every 5 minutes)
let cachedLimits: {
  trialDailyLimitPerUser: number
  trialTotalLimitPerUser: number
  trialDailyCapGlobal: number
  publicDemoMonthlyLimitPerIp: number
  publicDemoCapGlobal: number
  smsVerificationEnabled: boolean
  disposableEmailBlockingEnabled: boolean
  cachedAt: number
} | null = null

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * L12 FIX: Clear system limits cache
 * Call this when system_limits are updated to ensure fresh data
 */
export function clearSystemLimitsCache(): void {
  cachedLimits = null
}

async function getSystemLimits() {
  const now = Date.now()

  if (cachedLimits && now - cachedLimits.cachedAt < CACHE_TTL_MS) {
    return cachedLimits
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('system_limits')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) {
    // CRITICAL FIX: Log error prominently and alert in production
    logger.error(
      { error },
      'Failed to fetch system_limits from database, falling back to hardcoded defaults - THIS IS A CONFIGURATION ISSUE'
    )

    // Send critical alert in production
    if (process.env.NODE_ENV === 'production') {
      sendCriticalAlert(
        'System Limits Database Access Failed',
        'Unable to fetch system_limits from database. Using hardcoded fallback values. Admin configuration changes will not take effect until database access is restored.',
        {
          error: error?.message || 'unknown',
          table: 'system_limits',
          impact: 'Configuration changes ignored',
        }
      ).catch(alertError => {
        logger.fatal(
          {
            originalError: error?.message,
            alertError:
              alertError instanceof Error
                ? alertError.message
                : String(alertError),
          },
          'CRITICAL: Alert system failure for system_limits fetch error'
        )
      })
    }

    // Return defaults if fetch fails
    return {
      trialDailyLimitPerUser: 3,
      trialTotalLimitPerUser: 10,
      trialDailyCapGlobal: 200,
      publicDemoMonthlyLimitPerIp: 3,
      publicDemoCapGlobal: 100,
      smsVerificationEnabled: false,
      disposableEmailBlockingEnabled: true,
      cachedAt: now,
    }
  }

  cachedLimits = {
    trialDailyLimitPerUser: data.trial_daily_limit_per_user,
    trialTotalLimitPerUser: data.trial_total_limit_per_user,
    trialDailyCapGlobal: data.trial_daily_cap_global,
    publicDemoMonthlyLimitPerIp: data.public_demo_monthly_limit_per_ip,
    publicDemoCapGlobal: data.public_demo_daily_cap_global,
    smsVerificationEnabled: data.sms_verification_enabled,
    disposableEmailBlockingEnabled: data.disposable_email_blocking_enabled,
    cachedAt: now,
  }

  return cachedLimits
}

/**
 * Check if a trial user can perform a generation
 * When BILLING_ENABLED=false, always returns allowed: true
 */
export async function checkTrialAccess(
  userId: string
): Promise<TrialCheckResult> {
  // Open source mode: no trial limits
  if (!isBillingEnabled()) {
    return {
      allowed: true,
      status: {
        allowed: true,
        isTrial: false,
        trialEnded: false,
        trialDaysRemaining: 0,
        generationsToday: 0,
        generationsTotal: 0,
        dailyLimit: Infinity,
        totalLimit: Infinity,
      },
    }
  }

  const supabase = createServiceClient()
  const limits = await getSystemLimits()

  // 1. Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (profileError || !profile) {
    // Create profile if doesn't exist (shouldn't happen with trigger)
    const { error: createError } = await supabase
      .from('user_profiles')
      .insert({ user_id: userId })

    if (createError) {
      return {
        allowed: false,
        error: 'Failed to create user profile',
      }
    }

    // Retry fetch
    const { data: newProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!newProfile) {
      return { allowed: false, error: 'Profile not found' }
    }

    return checkTrialAccessWithProfile(newProfile, limits)
  }

  return checkTrialAccessWithProfile(profile, limits)
}

function calculateDaysRemaining(trialEndsAt: Date, now: Date): number {
  return Math.ceil(
    (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  )
}

function buildTrialStatus(
  allowed: boolean,
  profile: { trial_total_generations: number; trial_ends_at: string },
  limits: Awaited<ReturnType<typeof getSystemLimits>>,
  generationsToday: number,
  reason?: string
): TrialStatus {
  const now = new Date()
  const trialEndsAt = new Date(profile.trial_ends_at)
  const trialEnded = now > trialEndsAt

  return {
    allowed,
    reason,
    isTrial: true,
    trialEnded,
    trialDaysRemaining: trialEnded
      ? 0
      : calculateDaysRemaining(trialEndsAt, now),
    generationsToday,
    generationsTotal: profile.trial_total_generations,
    dailyLimit: limits.trialDailyLimitPerUser,
    totalLimit: limits.trialTotalLimitPerUser,
  }
}

async function checkTrialAccessWithProfile(
  profile: {
    user_id: string
    plan: string
    is_trial: boolean
    trial_started_at: string
    trial_ends_at: string
    trial_total_generations: number
  },
  limits: Awaited<ReturnType<typeof getSystemLimits>>
): Promise<TrialCheckResult> {
  const supabase = createServiceClient()
  const now = new Date()
  const trialEndsAt = new Date(profile.trial_ends_at)
  const trialEnded = now > trialEndsAt

  if (!profile.is_trial && profile.plan !== 'trial') {
    return {
      allowed: true,
      status: {
        allowed: true,
        isTrial: false,
        trialEnded: false,
        trialDaysRemaining: 0,
        generationsToday: 0,
        generationsTotal: 0,
        dailyLimit: Infinity,
        totalLimit: Infinity,
      },
    }
  }

  if (trialEnded) {
    // Log trial access denial
    security.trialAccessDenied(profile.user_id, 'trial_expired', {
      total: profile.trial_total_generations,
    })

    return {
      allowed: false,
      error: 'Trial expired. Please upgrade to continue.',
      status: buildTrialStatus(false, profile, limits, 0, 'trial_expired'),
    }
  }

  if (profile.trial_total_generations >= limits.trialTotalLimitPerUser) {
    // Log trial access denial
    security.trialAccessDenied(profile.user_id, 'total_limit', {
      total: profile.trial_total_generations,
    })

    return {
      allowed: false,
      error: `Trial limit reached (${limits.trialTotalLimitPerUser} generations). Please upgrade to continue.`,
      status: buildTrialStatus(
        false,
        profile,
        limits,
        0,
        'total_limit_reached'
      ),
    }
  }

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { count: todayCount, error: countError } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile.user_id)
    .eq('event_type', 'trial')
    .gte('created_at', startOfDay.toISOString())

  if (countError) {
    // CRITICAL FIX: Classify error to distinguish retryable vs permanent failures
    const classified = classifyError(
      countError.message || 'Database error counting generations'
    )
    logger.error(
      { error: countError, classified, userId: profile.user_id },
      'Error counting daily generations'
    )

    return {
      allowed: false,
      error: classified.userMessage,
      retryable: classified.retryable,
      suggestedAction: classified.suggestedAction,
      status: buildTrialStatus(
        false,
        profile,
        limits,
        0,
        'verification_failed'
      ),
    }
  }

  const generationsToday = todayCount || 0

  if (generationsToday >= limits.trialDailyLimitPerUser) {
    // Log trial access denial
    security.trialAccessDenied(profile.user_id, 'daily_limit', {
      daily: generationsToday,
      total: profile.trial_total_generations,
    })

    return {
      allowed: false,
      error: `Daily trial limit reached (${limits.trialDailyLimitPerUser} generations). Try again tomorrow.`,
      status: buildTrialStatus(
        false,
        profile,
        limits,
        generationsToday,
        'daily_limit_reached'
      ),
    }
  }

  const { count: globalCount } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'trial')
    .gte('created_at', startOfDay.toISOString())

  if ((globalCount || 0) >= limits.trialDailyCapGlobal) {
    return {
      allowed: false,
      error: 'Trial capacity reached for today. Please try again tomorrow.',
      status: buildTrialStatus(
        false,
        profile,
        limits,
        generationsToday,
        'global_cap_reached'
      ),
    }
  }

  const daysRemaining = calculateDaysRemaining(trialEndsAt, now)

  return {
    allowed: true,
    status: buildTrialStatus(true, profile, limits, generationsToday),
    headers: {
      'X-Trial-Remaining-Today': String(
        limits.trialDailyLimitPerUser - generationsToday
      ),
      'X-Trial-Remaining-Total': String(
        limits.trialTotalLimitPerUser - profile.trial_total_generations
      ),
      'X-Trial-Days-Remaining': String(daysRemaining),
    },
  }
}

/**
 * Check trial limits and record generation atomically
 * This replaces the old check-then-record pattern to prevent race conditions
 * When BILLING_ENABLED=false, always returns allowed: true
 */
export async function checkAndRecordTrialGeneration(
  userId: string,
  options?: {
    tokensUsed?: number
    newsletterId?: string
    postsCount?: number
    ipAddress?: string
    userAgent?: string
  }
): Promise<TrialCheckResult> {
  // Open source mode: no trial limits
  if (!isBillingEnabled()) {
    return {
      allowed: true,
      status: {
        allowed: true,
        isTrial: false,
        trialEnded: false,
        trialDaysRemaining: 0,
        generationsToday: 0,
        generationsTotal: 0,
        dailyLimit: Infinity,
        totalLimit: Infinity,
      },
    }
  }

  const supabase = createServiceClient()

  // Call atomic RPC that checks limits and records in single transaction
  const { data, error } = await supabase.rpc(
    'check_and_record_trial_generation',
    {
      p_user_id: userId,
      p_newsletter_id: options?.newsletterId || null,
      p_posts_count: options?.postsCount || 0,
      p_tokens_used: options?.tokensUsed || 0,
      p_ip_address: options?.ipAddress || null,
      p_user_agent: options?.userAgent || null,
    }
  )

  if (error) {
    // CRITICAL FIX: Classify RPC error to provide actionable feedback
    const classified = classifyError(
      error.message || 'RPC call failed for trial generation check'
    )
    logger.error(
      { error, classified, userId },
      'Trial generation check failed (RPC error)'
    )

    return {
      allowed: false,
      error: classified.userMessage,
      retryable: classified.retryable,
      suggestedAction: classified.suggestedAction,
    }
  }

  const result = data as {
    allowed: boolean
    reason?: string
    generationsToday?: number
    generationsTotal?: number
    dailyLimit?: number
    totalLimit?: number
    remainingToday?: number
    remainingTotal?: number
    daysRemaining?: number
    trialEnded?: boolean
  }

  if (!result.allowed) {
    const errorMessages: Record<string, string> = {
      trial_expired: 'Trial expired. Please upgrade to continue.',
      total_limit_reached: `Trial limit reached (${result.totalLimit} generations). Please upgrade to continue.`,
      daily_limit_reached: `Daily trial limit reached (${result.dailyLimit} generations). Try again tomorrow.`,
      global_cap_reached:
        'Trial capacity reached for today. Please try again tomorrow.',
    }

    return {
      allowed: false,
      error: errorMessages[result.reason || ''] || 'Trial limit reached',
      status: {
        allowed: false,
        reason: result.reason,
        isTrial: true,
        trialEnded: result.trialEnded || false,
        trialDaysRemaining: Math.ceil(result.daysRemaining || 0),
        generationsToday: result.generationsToday || 0,
        generationsTotal: result.generationsTotal || 0,
        dailyLimit: result.dailyLimit || 3,
        totalLimit: result.totalLimit || 10,
      },
    }
  }

  // Success - return with headers
  return {
    allowed: true,
    status: {
      allowed: true,
      isTrial: true,
      trialEnded: false,
      trialDaysRemaining: Math.ceil(result.daysRemaining || 0),
      generationsToday: result.generationsToday || 0,
      generationsTotal: result.generationsTotal || 0,
      dailyLimit: result.dailyLimit || 3,
      totalLimit: result.totalLimit || 10,
    },
    headers: {
      'X-Trial-Remaining-Today': String(result.remainingToday || 0),
      'X-Trial-Remaining-Total': String(result.remainingTotal || 0),
      'X-Trial-Days-Remaining': String(Math.ceil(result.daysRemaining || 0)),
    },
  }
}

/**
 * Record a trial generation event and increment counter
 * DEPRECATED: Use checkAndRecordTrialGeneration() instead for atomic operation
 * This is kept for backward compatibility only
 */
export async function recordTrialGeneration(
  userId: string,
  options?: {
    tokensUsed?: number
    newsletterId?: string
    postsCount?: number
    ipAddress?: string
    userAgent?: string
  }
): Promise<void> {
  const supabase = createServiceClient()

  // Insert generation event
  await supabase.from('generation_events').insert({
    user_id: userId,
    event_type: 'trial',
    newsletter_id: options?.newsletterId,
    posts_count: options?.postsCount || 0,
    tokens_used: options?.tokensUsed || 0,
    ip_address: options?.ipAddress,
    user_agent: options?.userAgent,
  })

  // Increment user's total count
  await supabase.rpc('increment_trial_generation', { p_user_id: userId })
}

/**
 * Check public demo access (no auth required)
 */
export async function checkPublicDemoAccess(
  ipAddress: string
): Promise<TrialCheckResult> {
  const supabase = createServiceClient()
  const limits = await getSystemLimits()

  // Check monthly limit per IP
  const startOfMonth = new Date()
  startOfMonth.setUTCDate(1)
  startOfMonth.setUTCHours(0, 0, 0, 0)

  const { count: monthlyCount } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'public_demo')
    .eq('ip_address', ipAddress)
    .gte('created_at', startOfMonth.toISOString())

  if ((monthlyCount || 0) >= limits.publicDemoMonthlyLimitPerIp) {
    return {
      allowed: false,
      error: 'Monthly demo limit reached. Sign up for a free trial!',
    }
  }

  // Check global daily cap
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { count: globalCount } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'public_demo')
    .gte('created_at', startOfDay.toISOString())

  if ((globalCount || 0) >= limits.publicDemoCapGlobal) {
    return {
      allowed: false,
      error: 'Demo capacity reached for today. Please try again tomorrow.',
    }
  }

  return {
    allowed: true,
    headers: {
      'X-Demo-Remaining': String(
        limits.publicDemoMonthlyLimitPerIp - (monthlyCount || 0)
      ),
    },
  }
}

/**
 * Record a public demo generation event
 */
export async function recordPublicDemoGeneration(
  ipAddress: string,
  options?: {
    tokensUsed?: number
    userAgent?: string
  }
): Promise<void> {
  const supabase = createServiceClient()

  await supabase.from('generation_events').insert({
    user_id: null,
    event_type: 'public_demo',
    tokens_used: options?.tokensUsed || 0,
    ip_address: ipAddress,
    user_agent: options?.userAgent,
  })
}

/**
 * Get trial status for display in UI
 */
export async function getTrialStatusForUser(
  userId: string
): Promise<TrialStatus | null> {
  const result = await checkTrialAccess(userId)
  return result.status || null
}

// Export for testing
export { getSystemLimits }
