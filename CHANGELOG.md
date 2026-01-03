# Changelog

All notable changes to Postrail will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed

- **Production-Ready Quality Improvements (Jan 3, 2026)**
  - **Accessibility (WCAG 2.1 AA)**: Fixed 11 critical violations (79% → 95% compliance)
    - Added aria-label to 4 icon-only buttons (eye icons, edit/regenerate buttons)
    - Added aria-hidden to decorative icons
    - Fixed color contrast on 15 text elements (gray-600 → gray-700, 3.8:1 → 5.85:1)
    - Added sr-only label with aria-labelledby to newsletter editor
    - Added role="alert" and aria-live="polite" to error messages
  - **Error Handling**: Fixed 6 critical silent failure paths
    - Analytics dashboard user profile query (no error handling → comprehensive logging and user messages)
    - Billing customer creation and update errors (prevents duplicate Stripe customers and billing state inconsistencies)
    - LinkedIn OAuth decryption failures (generic error → actionable reconnect message)
    - OAuth callback failures (no logging → comprehensive error logging with details in redirect)
  - **Security Hardening**: 3 medium-priority improvements
    - XSS risk documentation for HTML injection patterns in landing page
    - Stripe webhook IP rotation resilience (emergency bypass with loud logging)
    - Admin endpoint DoS protection (added Redis rate limiting to monitoring endpoint)
  - **Quality Gates**: All tests passing (696), zero ESLint warnings, successful build

### Fixed

- **Security Fix: QStash Signature & Service Auth (Jan 2, 2026)**
  - Await QStash signature verification in process and publish endpoints (prevents bypass)
  - Restore CSP nonce propagation via request headers (Next.js integration)
  - Add Redis-backed service-key rate limiting with memory fallback (multi-instance support)
  - Fix SSRF status endpoint to use non-mutating rate limit check (prevents counter increment on status checks)

- **Deep Review Security Fixes (Jan 2, 2026)**
  - C1: Unsafe regex in ISO datetime validation (ReDoS prevention)
  - C2: Alert failure swallowing in Redis rate limiter (fatal logging with console fallback)
  - C3: RLS bypass fallback in feature-gate.ts (enforces auth context requirement)
  - C4: Trial limit bypass on database errors (fail closed, not open)
  - H2: OAuth error logging sanitization (prevents token leakage in logs)
  - H3: Payment error messages improved (specific Stripe error details)
  - M1: Dashboard queries parallelized (3x faster analytics endpoint)

### Changed

- **Backlog Verification (Jan 2, 2026)**
  - Verified and documented completion of 7 high/medium priority security issues
  - H2: OAuth state HMAC-signed cookies (cookie-signer.ts)
  - H9: CSP with nonces in production (middleware.ts)
  - M2: Feature gate on scheduling endpoint
  - M3: Server client preferred over service client (RLS enforcement)
  - M8-M9: Zod schemas for type-safe metadata validation
  - M10: Request body Zod validation
  - M11: Worker authentication requires both headers
  - M1: Deferred dual rate limiter consolidation (requires SSRF refactor)

### Fixed

- **Critical Security Improvements (Jan 2, 2026)**
  - Webhook input validation with Zod (prevents malformed UUID DoS)
  - Supabase cookie handling now logs failures properly
  - QStash fail-fast validation in production
  - Atomic trial generation (prevents race condition bypass)

- **Medium Priority Security & UX (Jan 2, 2026)**
  - AI partial failure visibility (shows which posts failed)
  - Error classification system (retryable vs permanent)
  - TypeScript branded types for validated data
  - ESLint false positive fixes with contextual comments

- **Deep Review Security Fixes (Dec 2025)**
  - Account lockout policy (5 attempts = 15min)
  - Redis circuit breaker alerting (Slack/PagerDuty)
  - Crypto key caching (50-100ms performance gain)
  - Structured logger replaces console.log (79 occurrences)

### Added

- **Lower Priority Billing & Observability**
  - Subscription renewal reminder emails (7 days before)
  - Payment failed recovery emails
  - Upgrade prompts when hitting limits (`getUpgradePromptForLimit`)
  - Sentry breadcrumbs for error context in logger
  - Comprehensive test suites for email and feature-gate

- **Medium Priority SOTA Improvements**
  - Fieldset/legend for newsletter date input
  - `<time>` elements for dates in post-scheduler
  - Error boundary for dashboard layout
  - Structured Pino logging in API routes

- **SOTA Audit Critical/High Fixes**
  - Security headers (CSP, HSTS, X-Frame-Options)
  - CORS configuration in middleware
  - Color contrast fixes (gray-500 → gray-600)
  - aria-live on error messages (login, signup, reset-password)
  - Skip links on landing and auth pages
  - JSON-LD SoftwareApplication schema
  - Lazy load TipTap editor (~150KB bundle saved)
  - Per-page metadata for auth pages
  - Compressed OG image (1MB → <200KB)

- **Phase 5: Scheduling & Automation**
  - Smart scheduling with optimal posting times
  - User timezone settings
  - Retry logic with exponential backoff
  - Manual retry API for failed posts

- **Phase 6: Analytics Dashboard**
  - Analytics API with post stats
  - Dashboard analytics page with metrics
  - Stats cards, platform charts, activity timeline

- **AI Features**
  - AI tone settings (professional, casual, etc.)
  - A/B post variants generation

- **Queue-First Generation Flow**
  - Async job processing via QStash worker (`/api/generate-posts/queue`)
  - Job status polling endpoint (`/api/generate-posts/status`)
  - Frontend polling UI with progress indicators
  - Worker authentication with internal tokens
  - Generation event logging for audit trail

### Fixed

- SSRF DNS-rebinding mitigation in scrape endpoint
- Redis rate limiter cleanup bug and hourly window correctness
- Vercel deployment (converted next.config.ts → next.config.js)
- Stripe SDK updated to API version 2025-11-17.clover
- Build-time env validation moved to runtime
- Queue publishing and Stripe config hardening
- Missing newsletter record guard
- Dependabot security vulnerabilities
- SEO and accessibility improvements

### Changed

- ROADMAP.md for strategic direction
- Updated CLAUDE.md with improved commands and architecture docs
- Refactored to use @vbl/shared for Stripe test utilities

## [0.2.0] - 2025-12-13

### Added

- **Stripe Billing System**
  - BillingService wrapper class (`lib/billing.ts`)
  - Multi-tier subscriptions (Standard $29/mo, Growth $59/mo)
  - Stripe webhook handler (`app/api/webhooks/stripe/route.ts`)
  - Billing portal and status endpoints
  - Feature gating by subscription tier (`lib/feature-gate.ts`)
  - Comprehensive Zod validation schemas (`lib/schemas.ts`)
  - Billing database migration

### Changed

- RBAC now integrated with subscription tiers
- Sentry SDK installed and configured

## [0.1.0] - 2025-11-29

### Added

- Initial release
- Next.js 15 App Router setup
- Supabase authentication
- Newsletter import (URL scraping, beehiiv, Substack)
- Claude AI post generation for 4 platforms
- Twitter posting integration (BYOK)
- Rate limiting and SSRF protection
- Comprehensive security implementation
- 393+ test suite with 75%+ coverage

### Tech Stack

- Next.js 16, TypeScript
- Supabase (PostgreSQL + Auth)
- Anthropic Claude API
- Vitest + Playwright for testing
- Tailwind CSS + shadcn/ui
