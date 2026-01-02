# postrail - Priority Actions

**Audit Date:** 2026-01-02
**Status:** Deployed | **SOTA Score:** ~92/100
**Deep Review:** Round 4 Completed | **Critical Issues:** 0

## Recent Work

- **2026-01-02**: Security improvements - QStash signature verification, CSP nonce propagation, service-key rate limiting with Redis
- **2026-01-02**: Completed 7 high/medium priority issues (H2, H9, M2, M3, M8, M9, M10, M11) - all items already fixed in previous sessions
- **2026-01-02**: Fixed 4 critical security issues (webhook validation, cookie logging, QStash fail-fast, trial race condition)
- **2026-01-02**: Fixed 5 medium priority issues (partial failures, error classification, branded types, crypto caching, ESLint)
- **2025-12-31**: Deep code review (quality, security, a11y, architecture, type safety, silent failures)
- **2025-12-30**: Lower priority items (renewal/payment emails, upgrade prompts, Sentry breadcrumbs)
- **2025-12-30**: Medium priority SOTA fixes (fieldset/legend, time elements, error boundary)
- **2025-12-30**: Critical/High priority SOTA fixes (security headers, CORS, color contrast)

---

## 🔴 Critical - Fix Immediately

> Security vulnerabilities and build blockers

| ID  | Issue                                                | File:Line                      | Effort | Status |
| --- | ---------------------------------------------------- | ------------------------------ | ------ | ------ |
| C1  | qs package DoS vulnerability (GHSA-6rw7-vpxm-498p)   | package.json                   | S      | [x]    |
| C2  | CORS falls back to request origin when env missing   | middleware.ts:21               | S      | [x]    |
| C3  | Anthropic client init with 'missing-key' fallback    | api/generate-posts/route.ts:22 | S      | [x]    |
| C4  | vitest.config.ts minWorkers invalid option           | vitest.config.ts:15            | S      | [x]    |
| C5  | Test zombie processes (execution tests spawn vitest) | package.json:test:fast         | S      | [x]    |

## 🟠 High Priority - Fix This Week

> Security, data integrity, type safety

| ID  | Issue                                           | File:Line                          | Effort | Status |
| --- | ----------------------------------------------- | ---------------------------------- | ------ | ------ |
| H1  | Rate limiter fail-open on Redis failure         | lib/redis-rate-limiter.ts:270      | M      | [x]    |
| H2  | OAuth state in unsigned cookies                 | api/platforms/_/callback/_.ts      | M      | [x]    |
| H3  | `Record<string, any>` loses type safety         | lib/observability.ts:55            | S      | [x]    |
| H4  | Unsafe metadata cast from DB (no validation)    | api/queues/publish/route.ts:35     | M      | [x]    |
| H5  | Error details returned to client                | api/cron/trial-emails/route.ts:110 | S      | [x]    |
| H6  | Dynamic imports on every call                   | lib/feature-gate.ts:113            | S      | [x]    |
| H7  | QStash scheduling failures silently ignored     | api/posts/schedule/route.ts        | M      | [x]    |
| H8  | Non-null assertions on env vars (runtime crash) | lib/redis-rate-limiter.ts:140      | S      | [x]    |
| H9  | CSP allows unsafe-eval and unsafe-inline        | next.config.js:34                  | M      | [x]    |

## 📊 Medium Priority - This Sprint

> Architecture, code quality, performance

| ID  | Issue                                                                                                                           | File:Line                                | Effort | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ | ------ |
| M1  | Dual rate limiter implementations (DEFERRED: would require significant refactoring of SSRF protection + extensive test updates) | lib/rate-limiter.ts                      | M      | [-]    |
| M2  | Missing feature gate on scheduling                                                                                              | api/posts/schedule/route.ts              | S      | [x]    |
| M3  | Service client used for user-scoped queries                                                                                     | lib/feature-gate.ts                      | M      | [x]    |
| M4  | 400+ line schedule route needs extraction                                                                                       | api/posts/schedule/route.ts              | L      | [ ]    |
| M5  | Dashboard makes 5 sequential queries                                                                                            | app/dashboard/page.tsx                   | M      | [ ]    |
| M6  | Missing request validation (Zod) in generate-posts                                                                              | api/generate-posts/route.ts:204          | S      | [x]    |
| M7  | Rollback logic doesn't check delete success                                                                                     | api/generate-posts/route.ts:343          | S      | [x]    |
| M8  | Unsafe `as unknown as` double casts                                                                                             | api/posts/[postId]/variants/route.ts:193 | M      | [x]    |
| M9  | Unsafe array assertions on metadata.variants                                                                                    | api/posts/[postId]/variants/route.ts:240 | S      | [x]    |
| M10 | Request body casts without Zod validation                                                                                       | api/posts/schedule/route.ts:45           | S      | [x]    |
| M11 | Worker request validation logic inconsistent                                                                                    | api/generate-posts/route.ts:175-189      | S      | [x]    |
| M12 | Page reload after retry (poor UX)                                                                                               | components/post-scheduler.tsx:180        | S      | [ ]    |
| M13 | Hardcoded URLs in email templates                                                                                               | lib/email.ts:53                          | S      | [x]    |

## 📚 Lower Priority - When Needed

> Tech debt, nice-to-haves

| ID  | Issue                                        | File:Line                        | Effort | Status |
| --- | -------------------------------------------- | -------------------------------- | ------ | ------ |
| L1  | ESLint object injection warnings (15)        | Various                          | M      | [ ]    |
| L2  | Missing test coverage for post-scheduler     | components/post-scheduler.tsx    | M      | [ ]    |
| L3  | Unused PLATFORM_OPTIMAL_TIMES constant       | components/post-scheduler.tsx:55 | S      | [ ]    |
| L4  | Props drilling in PostPreviewCard            | components/post-preview-card.tsx | S      | [ ]    |
| L5  | Client-side auth re-fetch in settings        | app/dashboard/settings/page.tsx  | S      | [ ]    |
| L6  | Missing rate limit headers on some endpoints | Various API routes               | S      | [ ]    |
| L7  | Create shared types directory                | types/                           | M      | [ ]    |
| L8  | Service layer abstraction (refactor)         | lib/services/                    | L      | [ ]    |
| L9  | Parallel rate limit/feature checks           | api/generate-posts/route.ts:213  | S      | [ ]    |

---

## Completed (2025-12-31 Deep Review)

- [x] C4: Fixed vitest.config.ts minWorkers invalid option

## Completed (Previous)

- [x] Security headers (CSP, HSTS, X-Frame-Options)
- [x] CORS configuration in middleware
- [x] Color contrast fixes
- [x] OG image compression
- [x] aria-live on error messages
- [x] Skip links
- [x] JSON-LD schema
- [x] Lazy load TipTap
- [x] Per-page metadata
- [x] Trial/welcome/renewal emails
- [x] Usage analytics dashboard
- [x] Fieldset/legend for inputs
- [x] Time elements for dates
- [x] Structured logging
- [x] Error boundary
- [x] Stripe billing infrastructure
- [x] Feature gating

---

## Deep Review Summary (2025-12-31)

| Area             | Status | Issues Found                                             |
| ---------------- | ------ | -------------------------------------------------------- |
| Automated Checks | ✅     | TypeScript, ESLint, 672 tests passing                    |
| Security         | ⚠️     | 1 HIGH dep vuln, CORS fallback, rate limiter fail-open   |
| Type Safety      | ⚠️     | 18 issues (any usage, unsafe casts, non-null assertions) |
| Silent Failures  | ⚠️     | 14 issues (QStash, DB updates, error swallowing)         |
| Architecture     | ✅     | Solid patterns, minor consolidation needed               |
| Deployment       | ✅     | Correct URLs, security headers present                   |

---

_Updated: 2025-12-31_
