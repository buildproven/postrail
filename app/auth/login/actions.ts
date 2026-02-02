'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { logger, security } from '@/lib/logger'
import { sendAccountLockoutEmail } from '@/lib/email'
import { headers } from 'next/headers'

export interface LoginResult {
  success: boolean
  error?: string
  locked?: boolean
  lockoutUntil?: string
  minutesRemaining?: number
}

/**
 * Secure login action with account lockout protection
 * - Checks for account lockout (5 failed attempts = 15min lockout)
 * - Records failed attempts with IP/user-agent for audit
 * - Clears lockout on successful login
 * - Sends email notification on account lockout
 */
export async function secureLogin(
  email: string,
  password: string
): Promise<LoginResult> {
  const serviceSupabase = createServiceClient()
  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0] || null
  const userAgent = headersList.get('user-agent') || null

  try {
    // Step 1: Check if account is locked
    const { data: lockStatus, error: lockError } = await serviceSupabase.rpc(
      'is_account_locked',
      {
        p_email: email,
      }
    )

    if (lockError) {
      logger.error({
        type: 'error',
        error: lockError,
        context: 'account_lockout_check',
        email,
        msg: 'Failed to check account lockout status',
      })
      return {
        success: false,
        error: 'An error occurred. Please try again.',
      }
    }

    // Step 2: If locked, reject login attempt
    if (lockStatus?.locked) {
      logger.warn({
        type: 'security',
        context: 'locked_account_login_attempt',
        email,
        ip: ipAddress,
        attempts: lockStatus.attempts,
        msg: 'Login attempt on locked account',
      })

      return {
        success: false,
        locked: true,
        lockoutUntil: lockStatus.lockout_until,
        minutesRemaining: Math.ceil(lockStatus.minutes_remaining),
        error: `Account locked due to too many failed attempts. Try again in ${Math.ceil(
          lockStatus.minutes_remaining
        )} minutes.`,
      }
    }

    // Step 3: Attempt login
    const supabase = await createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    // Step 4: Handle failed login
    if (signInError) {
      // Record failed attempt
      const { data: attemptResult } = await serviceSupabase.rpc(
        'record_failed_login',
        {
          p_email: email,
          p_ip_address: ipAddress,
          p_user_agent: userAgent,
        }
      )

      // OWASP A09: Log security event with structured logging
      security.loginFailure(email, signInError.message || 'invalid_credentials', {
        ip: ipAddress || undefined,
        userAgent: userAgent || undefined,
      })

      // Send lockout notification email if threshold reached
      if (attemptResult?.should_notify) {
        logger.info({
          type: 'security',
          context: 'account_lockout_triggered',
          email,
          ip: ipAddress,
          msg: 'Account lockout triggered - 5 failed attempts',
        })
        sendAccountLockoutEmail(email).catch((err) => {
          logger.error({
            type: 'security',
            context: 'account_lockout_email_failed',
            email,
            error: String(err),
          })
        })
      }

      return {
        success: false,
        locked: attemptResult?.locked || false,
        error: attemptResult?.locked
          ? 'Too many failed attempts. Account locked for 15 minutes.'
          : 'Invalid email or password',
      }
    }

    // Step 5: Successful login - clear failed attempts
    await serviceSupabase.rpc('clear_failed_logins', {
      p_email: email,
    })

    // OWASP A09: Log successful login for security monitoring
    // Note: userId not available until after getUser() call, so we log with email for now
    logger.info({
      type: 'security',
      context: 'successful_login',
      email,
      ip: ipAddress,
      msg: 'User logged in successfully',
    })

    return { success: true }
  } catch (error) {
    logger.error({
      type: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
      context: 'secure_login',
      email,
      msg: 'Unexpected error during login',
    })

    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.',
    }
  }
}
