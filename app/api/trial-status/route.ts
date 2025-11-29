import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getTrialStatusForUser } from '@/lib/trial-guard'

/**
 * GET /api/trial-status - Get current user's trial status
 *
 * Returns trial usage information for display in UI:
 * - Days remaining
 * - Daily generations used/remaining
 * - Total generations used/remaining
 * - Plan status
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const trialStatus = await getTrialStatusForUser(user.id)

    if (!trialStatus) {
      return NextResponse.json(
        { error: 'Failed to get trial status' },
        { status: 500 }
      )
    }

    // Calculate additional UI-friendly values
    const response = {
      ...trialStatus,
      dailyRemaining: trialStatus.dailyLimit - trialStatus.generationsToday,
      totalRemaining: trialStatus.totalLimit - trialStatus.generationsTotal,
      usagePercentage: Math.round(
        (trialStatus.generationsTotal / trialStatus.totalLimit) * 100
      ),
      shouldShowUpgradePrompt:
        trialStatus.isTrial &&
        (trialStatus.trialDaysRemaining <= 3 ||
          trialStatus.generationsTotal >= trialStatus.totalLimit - 2 ||
          trialStatus.generationsToday >= trialStatus.dailyLimit - 1),
    }

    const headers: Record<string, string> = {
      'X-Trial-Days-Remaining': String(trialStatus.trialDaysRemaining),
      'X-Trial-Daily-Remaining': String(response.dailyRemaining),
      'X-Trial-Total-Remaining': String(response.totalRemaining),
    }

    return NextResponse.json(response, { headers })
  } catch (error) {
    console.error('Error getting trial status:', error)
    return NextResponse.json(
      { error: 'Failed to get trial status' },
      { status: 500 }
    )
  }
}
