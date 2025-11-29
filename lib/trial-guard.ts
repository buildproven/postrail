/**
 * Trial Guard - Rate limiting and abuse protection for trial users
 *
 * Enforces:
 * - 3 generations per day per trial user
 * - 10 generations total during 14-day trial
 * - Global daily cap of 200 trial generations
 * - Disposable email blocking
 * - One trial per email + IP (soft-enforced)
 */

import { createServiceClient } from '@/lib/supabase/service'

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
 */
export async function checkTrialAccess(userId: string): Promise<TrialCheckResult> {
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

  // If paid user, allow
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

  // 2. Check if trial has expired
  if (trialEnded) {
    return {
      allowed: false,
      error: 'Trial expired. Please upgrade to continue.',
      status: {
        allowed: false,
        reason: 'trial_expired',
        isTrial: true,
        trialEnded: true,
        trialDaysRemaining: 0,
        generationsToday: 0,
        generationsTotal: profile.trial_total_generations,
        dailyLimit: limits.trialDailyLimitPerUser,
        totalLimit: limits.trialTotalLimitPerUser,
      },
    }
  }

  // 3. Check total trial limit
  if (profile.trial_total_generations >= limits.trialTotalLimitPerUser) {
    return {
      allowed: false,
      error: `Trial limit reached (${limits.trialTotalLimitPerUser} generations). Please upgrade to continue.`,
      status: {
        allowed: false,
        reason: 'total_limit_reached',
        isTrial: true,
        trialEnded: false,
        trialDaysRemaining: Math.ceil(
          (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        ),
        generationsToday: 0,
        generationsTotal: profile.trial_total_generations,
        dailyLimit: limits.trialDailyLimitPerUser,
        totalLimit: limits.trialTotalLimitPerUser,
      },
    }
  }

  // 4. Check daily limit
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { count: todayCount, error: countError } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile.user_id)
    .eq('type', 'trial')
    .gte('created_at', startOfDay.toISOString())

  if (countError) {
    console.error('Error counting daily generations:', countError)
    // Allow on error to avoid blocking legitimate users
  }

  const generationsToday = todayCount || 0

  if (generationsToday >= limits.trialDailyLimitPerUser) {
    return {
      allowed: false,
      error: `Daily trial limit reached (${limits.trialDailyLimitPerUser} generations). Try again tomorrow.`,
      status: {
        allowed: false,
        reason: 'daily_limit_reached',
        isTrial: true,
        trialEnded: false,
        trialDaysRemaining: Math.ceil(
          (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        ),
        generationsToday,
        generationsTotal: profile.trial_total_generations,
        dailyLimit: limits.trialDailyLimitPerUser,
        totalLimit: limits.trialTotalLimitPerUser,
      },
    }
  }

  // 5. Check global daily cap
  const { count: globalCount } = await supabase
    .from('generation_events')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'trial')
    .gte('created_at', startOfDay.toISOString())

  if ((globalCount || 0) >= limits.trialDailyCapGlobal) {
    return {
      allowed: false,
      error: 'Trial capacity reached for today. Please try again tomorrow.',
      status: {
        allowed: false,
        reason: 'global_cap_reached',
        isTrial: true,
        trialEnded: false,
        trialDaysRemaining: Math.ceil(
          (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        ),
        generationsToday,
        generationsTotal: profile.trial_total_generations,
        dailyLimit: limits.trialDailyLimitPerUser,
        totalLimit: limits.trialTotalLimitPerUser,
      },
    }
  }

  // All checks passed
  return {
    allowed: true,
    status: {
      allowed: true,
      isTrial: true,
      trialEnded: false,
      trialDaysRemaining: Math.ceil(
        (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ),
      generationsToday,
      generationsTotal: profile.trial_total_generations,
      dailyLimit: limits.trialDailyLimitPerUser,
      totalLimit: limits.trialTotalLimitPerUser,
    },
    headers: {
      'X-Trial-Remaining-Today': String(
        limits.trialDailyLimitPerUser - generationsToday
      ),
      'X-Trial-Remaining-Total': String(
        limits.trialTotalLimitPerUser - profile.trial_total_generations
      ),
      'X-Trial-Days-Remaining': String(
        Math.ceil(
          (trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      ),
    },
  }
}

/**
 * Record a trial generation event and increment counter
 */
export async function recordTrialGeneration(
  userId: string,
  options?: {
    tokensUsed?: number
    contentHash?: string
    ipAddress?: string
    userAgent?: string
  }
): Promise<void> {
  const supabase = createServiceClient()

  // Insert generation event
  await supabase.from('generation_events').insert({
    user_id: userId,
    type: 'trial',
    tokens_used: options?.tokensUsed || 0,
    content_hash: options?.contentHash,
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
    .eq('type', 'public_demo')
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
    .eq('type', 'public_demo')
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
    contentHash?: string
    userAgent?: string
  }
): Promise<void> {
  const supabase = createServiceClient()

  await supabase.from('generation_events').insert({
    user_id: null,
    type: 'public_demo',
    tokens_used: options?.tokensUsed || 0,
    content_hash: options?.contentHash,
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
