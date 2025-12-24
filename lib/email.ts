import { Resend } from 'resend'

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

const FROM_EMAIL = 'PostRail <noreply@vibebuildlab.com>'

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

          <a href="https://postrail.vibebuildlab.com/dashboard/settings"
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
      console.error('Failed to send trial expiry warning:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('Email send error:', err)
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

          <a href="https://postrail.vibebuildlab.com/dashboard/settings"
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
      console.error('Failed to send trial expired:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('Email send error:', err)
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

          <a href="https://postrail.vibebuildlab.com/dashboard/newsletters/new"
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
      console.error('Failed to send welcome email:', error)
      return { success: false, error: error.message }
    }

    return { success: true, id: data?.id }
  } catch (err) {
    console.error('Email send error:', err)
    return { success: false, error: String(err) }
  }
}
