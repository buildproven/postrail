# Changelog

All notable changes to Postrail will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- ROADMAP.md for strategic direction
- Updated CLAUDE.md with improved commands and architecture docs

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
