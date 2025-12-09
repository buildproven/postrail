import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Mock Stripe client if keys are missing (for development/demo)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID || 'price_mock_pro'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // If Stripe is not configured, return a mock success url
    if (!STRIPE_SECRET_KEY) {
      console.warn('⚠️ Stripe not configured. Simulating checkout session.')
      return NextResponse.json({
        url: `${APP_URL}/dashboard/settings?success=true&mock=true`,
      })
    }

    // Dynamic import to avoid build errors if stripe package isn't installed
    const Stripe = (await import('stripe')).default
    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-11-17.clover', // Stripe SDK compatible version
    })

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      billing_address_collection: 'auto',
      customer_email: user.email,
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${APP_URL}/dashboard/settings?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/dashboard/settings?canceled=true`,
      metadata: {
        userId: user.id,
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to start checkout session' },
      { status: 500 }
    )
  }
}
