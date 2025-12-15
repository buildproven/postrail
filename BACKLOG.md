# postrail - Priority Actions

**Audit Date:** 2025-12-15  
**Status:** Aligned | **Priority:** HIGH  
**Key Gaps:** Production readiness (billing + scheduling), observability config

## Recent Work

- **2025-12-14**: Docs refresh (stack, API surface, architecture, deployment, testing, agent guidance)
- **2025-12-13**: Stripe billing (checkout/portal/status + webhook), feature gating, Zod schemas
- **2025-12-12**: Platform integrations (LinkedIn/Facebook OAuth + posting), QStash scheduling + publish webhook, service-key auth for Growth Autopilot

## Critical (Do First)

- [ ] Run billing migrations in prod (`supabase/migrations/20251213_billing_columns.sql`)
- [ ] Configure Stripe products/prices + webhook endpoint (portal/checkout/status live)
- [ ] Configure QStash URLs + signing keys in prod (`/api/generate-posts/process`, `/api/queues/publish`)
- [ ] Set Sentry DSN/ENV per stage (server + browser) and validate error capture
- [ ] Verify Redis-backed rate limiting in prod (`RATE_LIMIT_MODE=redis`, Upstash creds)

## High Priority

- [ ] Add service-key audit dashboard (usage, rate limits, client scopes)
- [ ] Add usage analytics dashboard (posts generated/scheduled/published per platform)
- [ ] Email alerts for trial expiry and billing failures
- [ ] Harden publish idempotency (double-submit + QStash retry paths)

## Medium Priority

- [ ] Subscription renewal reminders + receipts
- [ ] Improve Sentry breadcrumbs on API routes (platform/billing)
- [ ] Add smoke E2E for import → generate → schedule → publish (Playwright)

## Notes

- Billing + scheduling infrastructure shipped; production requires env/config and migration activation.
- LinkedIn/Facebook/Twitter posting live; Threads pending.
- Redis limiter falls back to memory; ensure prod has Upstash configured.

---

_Updated: 2025-12-15_
