/**
 * Stripe Customer Portal API
 *
 * Creates portal sessions for users to manage their subscriptions.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingService } from '@/lib/billing'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await billingService.createPortalSession(user.id)

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ url: result.url })
  } catch (error) {
    console.error('Portal session error:', error)
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    )
  }
}
