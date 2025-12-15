# Changelog

All notable changes to Postrail will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Docs refresh (stack, API surface, architecture, deployment, testing, agent guide)
- Platform integrations: LinkedIn/Facebook OAuth + posting; Twitter BYOK maintained
- Scheduling/publish via QStash (posts/schedule + queues/publish)
- Stripe billing (checkout, portal, status, webhook) with feature gating + service keys
- Supabase service APIs for client metrics and bulk posts (Growth Autopilot)
- Zod schemas for request validation; rate limiter and SSRF hardening

### Changed

- Upgraded to Next.js 16 + Tailwind v4; Turbopack for dev
- Tech stack docs now reflect Redis-backed rate limiting and Sentry gating

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
