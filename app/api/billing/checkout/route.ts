/**
 * Stripe Checkout API
 *
 * Creates checkout sessions for Standard ($29) and Growth ($59) tiers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingService, SUBSCRIPTION_TIERS } from '@/lib/billing'
import { z } from 'zod'
import { logger } from '@/lib/logger'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const checkoutSchema = z.object({
  tier: z.enum(['standard', 'growth']),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate request body
    const body = await request.json()
    const parsed = checkoutSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be "standard" or "growth"' },
        { status: 400 }
      )
    }

    const { tier } = parsed.data

    const result = await billingService.createCheckoutSession(
      user.id,
      user.email,
      {
        tier,
        successUrl: `${APP_URL}/dashboard/settings?success=true`,
        cancelUrl: `${APP_URL}/dashboard/settings?canceled=true`,
      }
    )

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ url: result.url })
  } catch (error) {
    logger.error({ error }, 'Checkout error')
    return NextResponse.json(
      { error: 'Failed to start checkout session' },
      { status: 500 }
    )
  }
}

// GET endpoint for pricing info
export async function GET() {
  return NextResponse.json({
    tiers: {
      standard: {
        name: SUBSCRIPTION_TIERS.standard.name,
        price: SUBSCRIPTION_TIERS.standard.price / 100,
        dailyLimit: SUBSCRIPTION_TIERS.standard.dailyLimit,
        platforms: SUBSCRIPTION_TIERS.standard.platforms,
        features: SUBSCRIPTION_TIERS.standard.features,
      },
      growth: {
        name: SUBSCRIPTION_TIERS.growth.name,
        price: SUBSCRIPTION_TIERS.growth.price / 100,
        dailyLimit: SUBSCRIPTION_TIERS.growth.dailyLimit,
        platforms: SUBSCRIPTION_TIERS.growth.platforms,
        features: SUBSCRIPTION_TIERS.growth.features,
      },
    },
  })
}
