# Dev Guide — PostRail

> Load at session start. Replaces blind codebase exploration.
> **Last updated:** 2026-03-08

## What This Project Does

PostRail is an AI-powered social media automation platform for newsletter creators. It ingests newsletters (via beehiiv, Substack, or custom URL scraping) and generates platform-optimized posts for Twitter/X, LinkedIn, Facebook, and Threads — then schedules them via Upstash QStash with a pre-CTA / post-CTA strategy.

**Tech stack:** Next.js 16 (App Router, Turbopack) · TypeScript 5+ (strict) · Supabase (PostgreSQL + Auth) · Anthropic Claude API · Upstash Redis + QStash · Tailwind CSS 4.0 + shadcn/ui · Stripe billing · Pino logging · Vitest + Playwright + MSW

**Entry point:** `app/page.tsx` (marketing landing) → `app/dashboard/` (authenticated app)

## Directory Structure

```
postrail/
├── app/               # Next.js App Router pages and API routes
│   ├── api/           # All API route handlers
│   ├── auth/          # Auth pages (login, signup, callback)
│   └── dashboard/     # Main app UI (post-auth)
├── lib/               # Shared business logic
│   ├── supabase/      # Three-layer DB clients (client/server/service)
│   ├── platforms/     # Per-platform posting logic
│   ├── middleware/     # API middleware (rate limiting, auth)
│   ├── billing.ts     # Stripe integration
│   ├── feature-gate.ts# Tier-based access control
│   ├── crypto.ts      # AES-256 credential encryption
│   ├── ssrf-protection.ts  # URL validation for scraping
│   ├── scheduling.ts  # QStash scheduling logic
│   └── schemas.ts     # Zod validation schemas
├── tests/             # Vitest unit/integration + Playwright E2E
├── docs/              # Dev guides and plans
│   ├── dev_guide/     # This file and other dev references
│   └── plans/         # Agent planning docs (/bs:plan output)
└── .claude/           # Claude Code workspace metadata
```

## Key Files

| File                        | Role                                              |
| --------------------------- | ------------------------------------------------- |
| `lib/supabase/client.ts`    | Browser-side Supabase client (anon key)           |
| `lib/supabase/server.ts`    | Server-side Supabase client (respects RLS)        |
| `lib/supabase/service.ts`   | Admin client (bypasses RLS — use sparingly)       |
| `lib/billing.ts`            | Stripe checkout, portal, subscription status      |
| `lib/feature-gate.ts`       | Tier gating: Standard ($29) / Growth ($59)        |
| `lib/crypto.ts`             | AES-256 encryption for OAuth tokens               |
| `lib/ssrf-protection.ts`    | URL validation for newsletter scraping            |
| `lib/scheduling.ts`         | QStash job creation and scheduling                |
| `lib/redis-rate-limiter.ts` | Per-user rate limiting for AI endpoints           |
| `app/api/`                  | All API routes (follow middleware patterns below) |
| `.env.local.example`        | Full env var reference (12KB)                     |

## Conventions

**Naming:** Files use kebab-case. React components use PascalCase. API routes follow Next.js App Router conventions (`app/api/[resource]/route.ts`).

**Feature addition pattern:**

1. Add Zod schema to `lib/schemas.ts`
2. Add API route under `app/api/`
3. Apply rate limiting + SSRF protection middleware as appropriate
4. Use `lib/supabase/server.ts` for DB access (not service client)
5. Add unit test with MSW mock; add smoke test if user-facing

**Database access rules:**

- `client.ts` — browser only
- `server.ts` — API routes (default choice)
- `service.ts` — admin/background jobs only; never in user-facing routes

**AI generation:** 8 posts per newsletter (4 platforms × pre-CTA + post-CTA). Platform char limits: Twitter 280, Threads 500, LinkedIn 3000, Facebook 63206.

**Security — mandatory on every AI or scraping endpoint:**

```typescript
const rateLimiter = new RedisRateLimiter({ requestsPerMinute: 3 }) // AI
import { validateUrl } from '@/lib/ssrf-protection' // scraping
```

**Style:** Tailwind CSS 4.0 + shadcn/ui components. No custom CSS unless absolutely necessary. Prettier + ESLint enforced via pre-commit hooks.

## Running the Project

```bash
# Install
npm install

# Development (Turbopack)
npm run dev

# Type check
npm run type-check

# Tests
npm test                # All unit tests
npm run test:fast       # Excludes crypto/real-API tests (faster)
npm run test:watch      # Watch mode
npm run test:e2e        # Playwright E2E

# Lint + format
npm run lint
npm run format:check

# Full quality gate
npm run quality:ci
```

## Agent Gotchas

- **Three env files:** `.env.local` (dev), `.env.production.local` (prod), `.env.test.example` (test). Never commit any of them.
- **`ENCRYPTION_KEY`** must be 64 hex chars — used for AES-256 OAuth token encryption. Missing = crypto.ts throws at startup.
- **`BILLING_ENABLED`** defaults to `false` — all users get Growth tier access unless explicitly enabled.
- **Do NOT use Prisma** — Supabase client is used directly.
- **Do NOT use NextAuth** — Supabase Auth handles all authentication.
- **QStash** is optional for local dev — scheduling features degrade gracefully without it.
- **MSW** handles API mocking in unit tests (`tests/setup.ts`) — don't hit real APIs in unit tests.
- Coverage thresholds are strict: 90% lines/functions/branches/statements.

## Active Development Areas

From recent git log:

- Dependency updates (Dependabot active — limit 2 PRs)
- CI/CD hardening (qa-architect integration, test suite performance)
- Docker support and deployment guides
- Removed `.claude-setup` submodule — config now standalone
