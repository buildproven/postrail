# postrail - Priority Actions

**Audit Date:** 2025-11-29
**Status:** Partially Aligned | **Priority:** HIGH
**Key Gap:** No monetization infrastructure

## Recent Work

- **2025-11-29**: feat: implement trial system with usage limits and abuse protection (f64d3a5)

## Critical (Do First)

- [x] Implement trial system (3/day, 10 total, 14-day trial)
- [x] Add usage tracking and rate limiting for trials
- [x] Add public demo route (3/month per IP)
- [ ] Implement Stripe billing (Standard $29, Growth $59)
- [ ] Add subscription-based feature gating
- [ ] Create BillingService wrapper class
- [ ] Add webhook handler `/api/webhooks/stripe`
- [ ] Run SQL migration for trial system tables

## High Priority

- [ ] Implement service layer abstraction
- [ ] Add Sentry error tracking
- [ ] Add Zod request/response validation

## Notes

- Excellent security/testing foundation (393+ tests, 90% coverage target)
- RBAC already implemented - can adapt for subscription tiers
- Has Supabase Auth - good for user management
- Trial system implemented with full abuse protection
