/**
 * Stripe Webhook Handler
 *
 * Handles subscription lifecycle events:
 * - checkout.session.completed
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.payment_succeeded
 * - invoice.payment_failed
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { billingService } from '@/lib/billing'
import { createServiceClient } from '@/lib/supabase/service'
import { logger, security } from '@/lib/logger'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

// Stripe webhook IP ranges (https://stripe.com/docs/ips)
// Updated 2026-01-03 - verified at https://stripe.com/files/ips/ips_webhooks.txt
const STRIPE_WEBHOOK_IPS = [
  '3.18.12.63',
  '3.130.192.231',
  '13.235.14.237',
  '13.235.122.149',
  '18.211.135.69',
  '35.154.171.200',
  '52.15.183.38',
  '54.88.130.119', // M15 fix: Added missing Stripe webhook IP
  '54.88.130.237', // M15 fix: Added missing Stripe webhook IP
  '54.187.174.169',
  '54.187.205.235',
  '54.187.216.72',
]

function isStripeIP(ip: string | null): boolean {
  if (!ip) return false
  // Also allow localhost in development
  if (process.env.NODE_ENV === 'development' && ip.includes('127.0.0.1')) {
    return true
  }
  return STRIPE_WEBHOOK_IPS.includes(ip)
}

/**
 * Get user ID and tier from Stripe customer ID
 */
async function getUserFromCustomer(customerId: string): Promise<{
  userId?: string
  tier?: string
}> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('user_id, subscription_tier')
    .eq('stripe_customer_id', customerId)
    .single()

  return {
    userId: data?.user_id,
    tier: data?.subscription_tier ?? undefined,
  }
}

export async function POST(request: NextRequest) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    logger.warn({
      type: 'warning',
      context: 'stripe_webhook',
      msg: 'Stripe webhook: Missing configuration',
    })
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  // Validate request origin (IP allowlist)
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const clientIp = forwardedFor?.split(',')[0] || realIp

  // EMERGENCY BYPASS: Set STRIPE_WEBHOOK_BYPASS_IP_CHECK=true to disable IP validation
  // WARNING: This bypasses a security layer and should ONLY be used if Stripe rotates IPs
  // and updates their documentation BEFORE updating this allowlist. Monitor security logs closely.
  const bypassIPCheck = process.env.STRIPE_WEBHOOK_BYPASS_IP_CHECK === 'true'

  if (bypassIPCheck) {
    logger.warn({
      type: 'security',
      context: 'stripe_webhook_ip_bypass',
      ip: clientIp,
      msg: '⚠️ SECURITY WARNING: Stripe IP allowlist bypassed via STRIPE_WEBHOOK_BYPASS_IP_CHECK. Signature verification is still enforced. Remove this env var ASAP and update IP allowlist.',
    })
  } else if (!isStripeIP(clientIp)) {
    logger.error({
      type: 'security',
      context: 'stripe_webhook_ip_validation',
      ip: clientIp,
      msg: '🚨 ALERT: Stripe webhook rejected - unauthorized IP address. This could indicate an attack or Stripe IP rotation. Check https://stripe.com/files/ips/ips_webhooks.txt',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover',
  })

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    logger.error({
      type: 'error',
      error: err instanceof Error ? err : new Error(String(err)),
      context: 'stripe_webhook_signature',
      msg: 'Webhook signature verification failed',
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )
          const customerId = session.customer as string

          await billingService.updateSubscriptionFromWebhook(
            customerId,
            subscription
          )

          // Log subscription creation
          const { userId, tier } = await getUserFromCustomer(customerId)
          if (userId && tier) {
            security.subscriptionCreated(userId, tier, customerId)
          }

          logger.info({ customerId }, 'Checkout completed for customer')
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        await billingService.updateSubscriptionFromWebhook(
          customerId,
          subscription
        )

        const eventParts = event.type.split('.')
        const action = eventParts[eventParts.length - 1]

        logger.info({ customerId }, `Subscription ${action} for customer`)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Get user info before cancellation
        const { userId, tier } = await getUserFromCustomer(customerId)

        await billingService.handleSubscriptionCancelled(customerId)

        // Log subscription cancellation
        if (userId && tier) {
          security.subscriptionCancelled(
            userId,
            tier,
            customerId,
            subscription.cancellation_details?.reason ?? undefined
          )
        }

        logger.info({ customerId }, 'Subscription cancelled for customer')
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        const subscriptionId = (invoice as { subscription?: string | null })
          .subscription

        // Update subscription status to active on successful payment
        if (subscriptionId) {
          const subscription =
            await stripe.subscriptions.retrieve(subscriptionId)
          await billingService.updateSubscriptionFromWebhook(
            customerId,
            subscription
          )
        }

        // Log payment success
        const { userId } = await getUserFromCustomer(customerId)
        if (userId) {
          security.paymentSucceeded(
            userId,
            customerId,
            invoice.amount_paid,
            invoice.id
          )
        }

        logger.info({ customerId }, 'Payment succeeded for customer')
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Log payment failure
        const { userId } = await getUserFromCustomer(customerId)
        if (userId) {
          security.paymentFailed(
            userId,
            customerId,
            invoice.amount_due,
            (invoice as { last_payment_error?: { message?: string } })
              .last_payment_error?.message
          )
        }

        // Update status to past_due
        await supabase
          .from('user_profiles')
          .update({ subscription_status: 'past_due' })
          .eq('stripe_customer_id', customerId)

        logger.warn({ customerId }, 'Payment failed for customer')
        break
      }

      default:
        logger.info({ eventType: event.type }, 'Unhandled Stripe event type')
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error({ error }, 'Webhook handler error')
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
