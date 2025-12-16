# postrail - Priority Actions

**Audit Date:** 2025-12-16
**Status:** Deployed | **Priority:** REVENUE
**Key Gap:** Production activation (Stripe products, migrations, Sentry DSN)

## Recent Work

- **2025-12-16**: Vercel deployment fixed (next.config.ts → .js), Stripe SDK v20 compatibility
- **2025-12-15**: Docs refresh (stack, API surface, architecture, deployment, testing, agent guidance)
- **2025-12-13**: Stripe billing (checkout/portal/status + webhook), feature gating, Zod schemas
- **2025-12-12**: Platform integrations (LinkedIn/Facebook OAuth + posting), QStash scheduling + publish webhook, service-key auth for Growth Autopilot

---

## Prioritized by Value

### 1. Revenue Activation (Manual - Dashboard Work)

> Blocking all paid conversions. Do these first.

- [ ] Run SQL migration in Supabase Dashboard
- [ ] Create Stripe products (Standard $29/mo, Growth $59/mo)
- [ ] Copy price IDs to env vars (`STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_GROWTH`)
- [ ] Set up Stripe webhook → `https://postrail.com/api/webhooks/stripe`
- [ ] Set `SENTRY_DSN` in Vercel

### 2. Trial Conversion Emails (High Value - Reduces Churn)

> Users who don't know trial is expiring = lost revenue

- [ ] Trial expiry warning (3 days before) - Email via Resend
- [ ] Trial expired notification - Prompt to upgrade
- [ ] Welcome email with quick-start guide

### 3. Usage Analytics Dashboard (Medium-High Value)

> Shows users their ROI, increases upgrade likelihood

- [ ] Generation history with platform breakdown
- [ ] Posts published vs scheduled
- [ ] Usage vs limits visualization (trial/paid)

### 4. Post-Purchase Retention (Medium Value)

> Stripe handles basics, but proactive = lower churn

- [ ] Subscription renewal reminder (7 days before)
- [ ] Payment failed recovery email
- [ ] Upgrade prompts when hitting limits

### 5. Developer Experience (Low Priority)

> Only if debugging becomes painful

- [ ] Service layer abstraction (refactor)
- [ ] Sentry breadcrumbs for error context

---

## Completed

- [x] Trial system (3/day, 10 total, 14-day)
- [x] Usage tracking and rate limiting
- [x] Public demo route (3/month per IP)
- [x] Stripe billing infrastructure
- [x] Subscription-based feature gating
- [x] BillingService wrapper class
- [x] Webhook handler `/api/webhooks/stripe`
- [x] Sentry SDK installed
- [x] Zod request/response validation
- [x] Vercel deployment working (https://postrail.vercel.app)
- [x] Stripe SDK v20 compatibility

## Notes

- **Deployed to Vercel** - https://postrail.vercel.app
- Billing + scheduling infrastructure shipped; production requires env/config and migration activation.
- LinkedIn/Facebook/Twitter posting live; Threads pending.
- Redis limiter falls back to memory; ensure prod has Upstash configured.

---

_Updated: 2025-12-16_
