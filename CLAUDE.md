# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PostRail is a newsletter-to-social-media automation platform using AI. It transforms newsletters into platform-optimized posts for LinkedIn, Twitter, Threads, and Facebook.

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack)  |
| Language  | TypeScript 5+ (strict)              |
| Styling   | Tailwind CSS 4.0 + shadcn/ui        |
| Database  | PostgreSQL (Supabase)               |
| Auth      | Supabase Auth (email/GitHub/Google) |
| AI        | Claude Sonnet 4, Opus 4, Haiku 3.5  |
| Billing   | Stripe (multi-tier subscriptions)   |
| Queue     | QStash (Upstash)                    |
| Logging   | Pino (structured JSON)              |
| Testing   | Vitest + Playwright + MSW           |

## Commands

```bash
# Development
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm run type-check       # TypeScript check

# Testing
npm test                 # All unit tests
npm run test:fast        # Fast tests (excludes crypto/real API tests)
npm run test:watch       # Watch mode
npm run test:e2e         # Playwright E2E tests
npx vitest run path/to/file.test.ts  # Single test file

# Quality
npm run lint             # ESLint
npm run quality:ci       # Full quality + security audit
```

## Architecture

### Three-Layer Supabase Pattern

All database access goes through one of three clients in `lib/supabase/`:

- **`client.ts`** - Browser-side (sync, uses anon key)
- **`server.ts`** - API routes (async, respects RLS)
- **`service.ts`** - Admin operations (bypasses RLS, use sparingly)

### Security Middleware Stack

Every API endpoint should use appropriate middleware:

```typescript
// AI generation endpoints
const rateLimiter = new RedisRateLimiter({ requestsPerMinute: 3 })

// URL scraping endpoints
import { validateUrl } from '@/lib/ssrf-protection'

// Trial users
const trialCheck = await checkTrialAccess(user.id) // 3/day, 10 total
```

### Billing & Feature Gating

- `lib/billing.ts` - Stripe integration wrapper
- `lib/feature-gate.ts` - Tier-based feature access (Standard $29, Growth $59)
- `lib/schemas.ts` - Zod validation for all billing operations

### Platform Credentials

OAuth tokens stored encrypted in `platform_connections.metadata`:

- Encryption: AES-256 via `lib/crypto.ts`
- Requires `ENCRYPTION_KEY` env var (64 hex chars)

## Key Patterns

### AI Post Generation

8 posts per newsletter: 4 platforms × 2 types (pre-CTA, post-CTA)

| Platform | Char Limit |
| -------- | ---------- |
| Twitter  | 280        |
| Threads  | 500        |
| LinkedIn | 3000       |
| Facebook | 63206      |

### Testing

- Unit tests use MSW for API mocking (`tests/setup.ts`)
- Coverage thresholds: 90% (lines, functions, branches, statements)
- Crypto/real API tests excluded from `test:fast` for speed

## What NOT to Do

- Don't use Prisma (uses Supabase directly)
- Don't use NextAuth (uses Supabase Auth)
- Don't skip rate limiting on AI endpoints
- Don't skip SSRF protection on URL scraping
- Don't store platform credentials unencrypted
- Don't bypass RLS with service client unless necessary

---

## GitHub Actions Policy

Minimal workflow mode — no new workflows without explicit justification.

---

**Last Updated:** 2026-03-08

## Agent Workflow

### Session Start

```
Read docs/dev_guide/CONVENTIONS.md
```

### Planning: /bs:plan <name> → docs/plans/

### Handoff: /bs:context --save / --resume
