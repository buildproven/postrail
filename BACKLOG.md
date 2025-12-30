# postrail - Priority Actions

**Audit Date:** 2025-12-30
**Status:** Deployed | **SOTA Score:** ~88/100 (after fixes)
**Key Gap:** Minor improvements remaining (lower priority)

## Recent Work

- **2025-12-30**: Medium priority SOTA fixes (fieldset/legend, time elements, error boundary, structured logging)
- **2025-12-30**: Critical/High priority SOTA fixes (security headers, CORS, color contrast, aria-live, skip links, JSON-LD, lazy TipTap, OG image)
- **2025-12-30**: SOTA audit (SEO 72, A11y 78, Security 78, Architecture 85, Performance 72, Code Quality 85)
- **2025-12-17**: Landing page rewrite (sales copy, pricing tiers, how-it-works), settings page upgrade UI, README roadmap update
- **2025-12-16**: Vercel deployment fixed (next.config.ts → .js), Stripe SDK v20 compatibility
- **2025-12-15**: Docs refresh (stack, API surface, architecture, deployment, testing, agent guidance)
- **2025-12-13**: Stripe billing (checkout/portal/status + webhook), feature gating, Zod schemas

---

## 🔴 Critical - Fix Before Launch

> Security and compliance blockers

- [x] Add security headers (CSP, HSTS, X-Frame-Options)
- [x] Add CORS configuration to middleware
- [x] Fix color contrast (gray-500 → gray-600, muted-foreground)
- [x] Compress OG image (1MB → <200KB)

## 🟡 High Priority - Fix This Week

> A11y and SEO improvements

- [x] Add aria-live to error messages (login, signup, reset-password)
- [x] Add skip links to landing page and auth pages
- [x] Add JSON-LD SoftwareApplication schema to homepage
- [x] Lazy load TipTap editor (save ~150KB bundle)
- [x] Add per-page metadata to auth pages

## 📊 Medium Priority - SOTA Improvements

> From audit recommendations

- [x] Trial expiry warning emails (3 days before) - Resend (already implemented in lib/email.ts)
- [x] Trial expired notification - Prompt to upgrade (already implemented in lib/email.ts)
- [x] Welcome email with quick-start guide (already implemented in lib/email.ts)
- [x] Usage analytics dashboard (generation history, platform breakdown) - app/dashboard/analytics/
- [x] Add `aria-label` to icon-only buttons - N/A (no icon-only buttons in PostPreviewCard)
- [x] Wrap newsletter date input in fieldset with legend
- [x] Add `<time>` elements for dates in post-scheduler
- [x] Migrate console.log to structured logger (key API files)
- [x] Add error boundary to dashboard layout

## 📚 Lower Priority

> Nice to have

- [ ] Subscription renewal reminder (7 days before)
- [ ] Payment failed recovery email
- [ ] Upgrade prompts when hitting limits
- [ ] Service layer abstraction (refactor)
- [ ] Sentry breadcrumbs for error context
- [ ] Add sitemap entries for /pricing, /features pages
- [ ] Replace axios with native fetch in client code

---

## Completed

- [x] Run SQL migration in Supabase Dashboard
- [x] Create Stripe products (Standard $29/mo, Growth $59/mo)
- [x] Copy price IDs to env vars
- [x] Set up Stripe webhook secret in Vercel
- [x] Set `SENTRY_DSN` in Vercel
- [x] Landing page with sales copy and pricing tiers
- [x] Settings page with Standard/Growth upgrade options
- [x] Trial system (3/day, 10 total, 14-day)
- [x] Usage tracking and rate limiting
- [x] Public demo route (3/month per IP)
- [x] Stripe billing infrastructure
- [x] Subscription-based feature gating
- [x] BillingService wrapper class
- [x] Webhook handler `/api/webhooks/stripe`
- [x] Sentry SDK installed
- [x] Zod request/response validation
- [x] Vercel deployment working
- [x] Stripe SDK v20 compatibility
- [x] Security hardening (RLS, search_path)

## SOTA Audit Summary (2025-12-30)

| Area          | Score  | Key Issues                                         |
| ------------- | ------ | -------------------------------------------------- |
| SEO           | 72/100 | Missing JSON-LD, per-page metadata, large OG image |
| Accessibility | 78/100 | Color contrast, aria-live, skip links              |
| Security      | 78/100 | Missing headers, CORS                              |
| Architecture  | 85/100 | Solid patterns, minor consolidation needed         |
| Performance   | 72/100 | TipTap bundle, OG image size                       |
| Code Quality  | 85/100 | TypeScript strict, 0 ESLint errors                 |

---

_Updated: 2025-12-30_
