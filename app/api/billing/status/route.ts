/**
 * Subscription Status API
 *
 * Returns current subscription status and usage limits.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingService, SUBSCRIPTION_TIERS } from '@/lib/billing'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = await billingService.getSubscriptionStatus(user.id)
    const tierConfig = SUBSCRIPTION_TIERS[status.tier]

    return NextResponse.json({
      tier: status.tier,
      tierName: tierConfig.name,
      status: status.status,
      limits: {
        dailyGenerations: tierConfig.dailyLimit,
        totalGenerations: tierConfig.totalLimit,
        platforms: tierConfig.platforms,
      },
      features: tierConfig.features,
      currentPeriodEnd: status.currentPeriodEnd?.toISOString(),
      cancelAtPeriodEnd: status.cancelAtPeriodEnd,
    })
  } catch (error) {
    console.error('Status fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subscription status' },
      { status: 500 }
    )
  }
}
