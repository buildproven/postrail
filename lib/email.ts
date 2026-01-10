import { Resend } from 'resend'
import { logger, logError } from '@/lib/logger'

// Base URL for email links - uses env var or production fallback
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || '${BASE_URL}'

// Lazy-initialize Resend to avoid build-time errors when API key is missing
let resendClient: Resend | null = null

function getResend(): Resend {
  if (!resendClient) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }
    resendClient = new Resend(process.env.RESEND_API_KEY)
  }
  return resendClient
}

// FROM_EMAIL configurable via env var for self-hosted deployments
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || 'PostRail <noreply@yourdomain.com>'

export interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

/**
 * Send trial expiry warning email (3 days before)
 */
export async function sendTrialExpiryWarning(
  email: string,
  name: string | null,
  daysRemaining: number
): Promise<EmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Your PostRail trial expires in ${daysRemaining} days`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">Your trial is ending soon</h1>
          <p>Hi ${name || 'there'},</p>
          <p>Your PostRail trial expires in <strong>${daysRemaining} days</strong>.</p>
          <p>You've been transforming newsletters into social posts with AI. Don't lose access!</p>

          <h3>What you'll keep with a subscription:</h3>
          <ul>
            <li>✅ Unlimited AI post generation</li>
            <li>✅ All 4 platforms (Twitter, LinkedIn, Threads, Facebook)</li>
            <li>✅ Scheduled posting</li>
            <li>✅ Analytics dashboard</li>
          </ul>

          <a href="${BASE_URL}/dashboard/settings"
             style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Upgrade Now - Starting at $29/mo
          </a>

          <p style="color: #666; font-size: 14px;">
            Questions? Reply to this email - we're here to help.
          </p>
        </div>
      `,
    })

    if (error) {
      logger.error({
        type: 'email.trial_expiry_warning.failed',
        email,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    logger.info({
      type: 'email.trial_expiry_warning.sent',
      email,
      id: data?.id,
    })
    return { success: true, id: data?.id }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: 'trial_expiry_email',
    })
    return { success: false, error: String(err) }
  }
}

/**
 * Send trial expired notification
 */
export async function sendTrialExpired(
  email: string,
  name: string | null
): Promise<EmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your PostRail trial has ended',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">Your trial has ended</h1>
          <p>Hi ${name || 'there'},</p>
          <p>Your PostRail free trial has expired.</p>
          <p>But the good news? You can pick up right where you left off.</p>

          <a href="${BASE_URL}/dashboard/settings"
             style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Subscribe Now - $29/mo
          </a>

          <p><strong>Growth plan ($59/mo)</strong> includes:</p>
          <ul>
            <li>Advanced analytics</li>
            <li>Bulk generation</li>
            <li>Priority support</li>
            <li>API access</li>
          </ul>

          <p style="color: #666; font-size: 14px;">
            Miss your newsletters-to-posts magic? We'll be here when you're ready.
          </p>
        </div>
      `,
    })

    if (error) {
      logger.error({
        type: 'email.trial_expired.failed',
        email,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    logger.info({ type: 'email.trial_expired.sent', email, id: data?.id })
    return { success: true, id: data?.id }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: 'trial_expired_email',
    })
    return { success: false, error: String(err) }
  }
}

/**
 * Send welcome email with quick-start guide
 */
export async function sendWelcomeEmail(
  email: string,
  name: string | null
): Promise<EmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to PostRail! 🚀',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">Welcome to PostRail!</h1>
          <p>Hi ${name || 'there'},</p>
          <p>You're all set to transform your newsletters into viral social posts.</p>

          <h3>Quick Start (2 minutes):</h3>
          <ol>
            <li><strong>Paste a newsletter URL</strong> - We'll extract the content</li>
            <li><strong>Click Generate</strong> - AI creates posts for all platforms</li>
            <li><strong>Review & Post</strong> - Edit if needed, then publish</li>
          </ol>

          <a href="${BASE_URL}/dashboard/newsletters/new"
             style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Create Your First Posts
          </a>

          <p><strong>Your trial includes:</strong></p>
          <ul>
            <li>14 days of full access</li>
            <li>3 generations per day</li>
            <li>10 total generations</li>
          </ul>

          <p style="color: #666; font-size: 14px;">
            Questions? Just reply to this email.
          </p>
        </div>
      `,
    })

    if (error) {
      logger.error({
        type: 'email.welcome.failed',
        email,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    logger.info({ type: 'email.welcome.sent', email, id: data?.id })
    return { success: true, id: data?.id }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: 'welcome_email',
    })
    return { success: false, error: String(err) }
  }
}

/**
 * Send subscription renewal reminder (7 days before)
 */
export async function sendRenewalReminder(
  email: string,
  name: string | null,
  daysUntilRenewal: number,
  planName: string,
  amount: number
): Promise<EmailResult> {
  try {
    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Your PostRail ${planName} subscription renews in ${daysUntilRenewal} days`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #4F46E5;">Subscription Renewal Reminder</h1>
          <p>Hi ${name || 'there'},</p>
          <p>Your PostRail <strong>${planName}</strong> subscription will automatically renew in <strong>${daysUntilRenewal} days</strong>.</p>

          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0;"><strong>Plan:</strong> ${planName}</p>
            <p style="margin: 8px 0 0 0;"><strong>Amount:</strong> $${(amount / 100).toFixed(2)}/month</p>
          </div>

          <p>No action needed - your subscription will continue seamlessly.</p>

          <p>Need to make changes?</p>
          <a href="${BASE_URL}/dashboard/settings"
             style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Manage Subscription
          </a>

          <p style="color: #666; font-size: 14px;">
            Questions about billing? Reply to this email.
          </p>
        </div>
      `,
    })

    if (error) {
      logger.error({
        type: 'email.renewal_reminder.failed',
        email,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    logger.info({ type: 'email.renewal_reminder.sent', email, id: data?.id })
    return { success: true, id: data?.id }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: 'renewal_reminder_email',
    })
    return { success: false, error: String(err) }
  }
}

/**
 * Send payment failed notification
 */
export async function sendPaymentFailed(
  email: string,
  name: string | null,
  planName: string,
  retryDate: Date | null
): Promise<EmailResult> {
  try {
    const retryText = retryDate
      ? `We'll automatically retry on ${retryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`
      : "We'll retry the payment soon."

    const { data, error } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Action needed: Your PostRail payment failed',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #DC2626;">Payment Failed</h1>
          <p>Hi ${name || 'there'},</p>
          <p>We weren't able to process your payment for your PostRail <strong>${planName}</strong> subscription.</p>

          <p>${retryText}</p>

          <p>To avoid any interruption to your service, please update your payment method:</p>

          <a href="${BASE_URL}/dashboard/settings"
             style="display: inline-block; background: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Update Payment Method
          </a>

          <p><strong>What happens if payment isn't updated?</strong></p>
          <ul>
            <li>Your subscription will be paused after 3 failed attempts</li>
            <li>You'll lose access to premium features</li>
            <li>Your data will be preserved for 30 days</li>
          </ul>

          <p style="color: #666; font-size: 14px;">
            Need help? Reply to this email and we'll assist you.
          </p>
        </div>
      `,
    })

    if (error) {
      logger.error({
        type: 'email.payment_failed.failed',
        email,
        error: error.message,
      })
      return { success: false, error: error.message }
    }

    logger.info({ type: 'email.payment_failed.sent', email, id: data?.id })
    return { success: true, id: data?.id }
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: 'payment_failed_email',
    })
    return { success: false, error: String(err) }
  }
}
