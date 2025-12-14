# postrail - Priority Actions

**Audit Date:** 2025-12-13
**Status:** Aligned | **Priority:** MEDIUM
**Key Gap:** Production deployment readiness

## Recent Work

- **2025-12-13**: feat: implement full Stripe billing system with multi-tier subscriptions
  - Created BillingService wrapper class (`lib/billing.ts`)
  - Added Stripe webhook handler (`app/api/webhooks/stripe/route.ts`)
  - Added multi-tier checkout (Standard $29, Growth $59)
  - Added billing portal and status endpoints
  - Created feature gating system (`lib/feature-gate.ts`)
  - Added comprehensive Zod validation schemas (`lib/schemas.ts`)
  - Created billing migration (`supabase/migrations/20251213_billing_columns.sql`)
- **2025-11-29**: feat: implement trial system with usage limits and abuse protection

## Critical (Do First)

- [x] Implement trial system (3/day, 10 total, 14-day trial)
- [x] Add usage tracking and rate limiting for trials
- [x] Add public demo route (3/month per IP)
- [x] Implement Stripe billing (Standard $29, Growth $59)
- [x] Add subscription-based feature gating
- [x] Create BillingService wrapper class
- [x] Add webhook handler `/api/webhooks/stripe`
- [ ] Run SQL migration for billing columns in production
- [ ] Configure Stripe products and price IDs in Stripe Dashboard
- [ ] Set up Stripe webhook endpoint in Stripe Dashboard

## High Priority

- [x] Add Sentry error tracking (already configured, needs DSN)
- [x] Add Zod request/response validation
- [ ] Implement service layer abstraction
- [ ] Set up Sentry DSN in production

## Medium Priority

- [ ] Add usage analytics dashboard
- [ ] Add email notifications for trial expiry
- [ ] Add subscription renewal reminders
- [ ] Improve error handling with Sentry breadcrumbs

## Notes

- Billing infrastructure complete and type-checked
- 393+ tests, 90% coverage target
- RBAC implemented and integrated with subscription tiers
- Sentry SDK installed and configured (needs production DSN)
- Zod schemas ready for all API endpoints

## New Files Added

| File                                               | Description                                 |
| -------------------------------------------------- | ------------------------------------------- |
| `lib/billing.ts`                                   | BillingService class for Stripe integration |
| `lib/feature-gate.ts`                              | Subscription-based feature access control   |
| `lib/schemas.ts`                                   | Zod validation schemas for API              |
| `app/api/webhooks/stripe/route.ts`                 | Stripe webhook handler                      |
| `app/api/billing/portal/route.ts`                  | Customer portal session endpoint            |
| `app/api/billing/status/route.ts`                  | Subscription status endpoint                |
| `supabase/migrations/20251213_billing_columns.sql` | Billing database columns                    |

---

_Updated: 2025-12-13_
