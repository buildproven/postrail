import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendTrialExpiryWarning, sendTrialExpired } from '@/lib/email'

/**
 * Cron job: Check for trial expirations and send notification emails
 *
 * Runs daily via Vercel Cron
 * - Sends warning emails 3 days before trial expires
 * - Sends expired emails when trial ends
 *
 * Security: Requires CRON_SECRET header
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const now = new Date()
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  const results = {
    warnings: { sent: 0, failed: 0 },
    expired: { sent: 0, failed: 0 },
  }

  try {
    // Find users whose trial expires in exactly 3 days (haven't been notified)
    const { data: warningUsers, error: warningError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, trial_ends_at')
      .eq('subscription_status', 'trial')
      .gte('trial_ends_at', now.toISOString())
      .lte('trial_ends_at', threeDaysFromNow.toISOString())
      .is('trial_warning_sent_at', null)

    if (warningError) {
      console.error('Error fetching warning users:', warningError)
    } else if (warningUsers) {
      for (const user of warningUsers) {
        if (!user.email) continue

        const daysRemaining = Math.ceil(
          (new Date(user.trial_ends_at).getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000)
        )

        const result = await sendTrialExpiryWarning(
          user.email,
          user.full_name,
          daysRemaining
        )

        if (result.success) {
          results.warnings.sent++
          // Mark as notified
          await supabase
            .from('user_profiles')
            .update({ trial_warning_sent_at: now.toISOString() })
            .eq('id', user.id)
        } else {
          results.warnings.failed++
        }
      }
    }

    // Find users whose trial just expired (haven't been notified)
    const { data: expiredUsers, error: expiredError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, trial_ends_at')
      .eq('subscription_status', 'trial')
      .lt('trial_ends_at', now.toISOString())
      .is('trial_expired_sent_at', null)

    if (expiredError) {
      console.error('Error fetching expired users:', expiredError)
    } else if (expiredUsers) {
      for (const user of expiredUsers) {
        if (!user.email) continue

        const result = await sendTrialExpired(user.email, user.full_name)

        if (result.success) {
          results.expired.sent++
          // Mark as notified and update status
          await supabase
            .from('user_profiles')
            .update({
              trial_expired_sent_at: now.toISOString(),
              subscription_status: 'expired',
            })
            .eq('id', user.id)
        } else {
          results.expired.failed++
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    })
  } catch (error) {
    // Log error details server-side only (H5: don't leak to client)
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
