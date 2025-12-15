# PostRail - Claude Guide

> Newsletter-to-social-media automation with AI. Transform newsletters into platform-optimized posts.

**Status**: MVP launched | **Tests**: 393+ (Vitest + Playwright)

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Framework | Next.js 16 (App Router)             |
| Language  | TypeScript 5+ (strict)              |
| Styling   | Tailwind CSS 4.0 + shadcn/ui        |
| Database  | PostgreSQL (Supabase)               |
| Auth      | Supabase Auth (email/GitHub/Google) |
| AI        | Claude Sonnet 4, Opus 4, Haiku 3.5  |
| Billing   | Stripe (checkout/portal/webhooks)   |
| Queue     | QStash (Upstash) + Upstash Redis    |

## Key Commands

```bash
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript
npm test                 # Unit tests
npm run test:e2e         # Playwright E2E
npm run quality:ci       # Full quality + security
```

## Project Structure

```
app/
├── api/scrape/         # URL scraping (SSRF protected)
├── api/generate-posts/ # AI generation + queue/process/status
├── api/platforms/      # OAuth & posting (Twitter BYOK, LinkedIn, Facebook)
├── api/posts/          # Scheduling (single + bulk) via QStash
├── api/queues/publish/ # QStash publish webhook
├── api/billing/        # Stripe checkout/portal/status + webhook
├── api/clients/        # Metrics for Growth Autopilot (service keys)
└── dashboard/          # Protected routes
lib/
├── supabase/           # Client/server/service
├── rbac.ts             # Role-based access
├── trial-guard.ts      # Trial limits
├── feature-gate.ts     # Subscription-based feature gating
├── service-auth.ts     # Service keys + permissions
├── schemas.ts          # Zod schemas for API validation
├── redis-rate-limiter.ts
├── ssrf-protection.ts
└── crypto.ts           # Platform credential encryption
```

## Critical Patterns

### Three-Layer Supabase

- `client.ts` - Browser (sync)
- `server.ts` - API routes (async)
- `service.ts` - Admin ops (bypasses RLS)

### Trial Guard

```typescript
const trialCheck = await checkTrialAccess(user.id)
// 3/day, 10 total during 14-day trial
```

### Rate Limiting

```typescript
const rateLimiter = new RedisRateLimiter({ requestsPerMinute: 3 })
```

### Platform Credentials

- Encrypted with AES-256 (`lib/crypto.ts`)
- Requires `ENCRYPTION_KEY` (64 hex chars)

### Billing

- Stripe checkout + portal via `lib/billing.ts`
- Requires `STRIPE_SECRET_KEY`, price IDs, webhook secret

## AI Post Strategy

| Type     | Timing       | Goal                 |
| -------- | ------------ | -------------------- |
| Pre-CTA  | 24-8h before | FOMO, tease insights |
| Post-CTA | 48-72h after | Reframe as resource  |

**Char limits**: LinkedIn 3000, Threads 500, Twitter 280, Facebook 63206

## What NOT to Do

- Don't use Prisma (uses Supabase directly)
- Don't use NextAuth (uses Supabase Auth)
- Don't skip rate limiting on AI endpoints
- Don't skip SSRF protection on URL scraping
- Don't store platform credentials unencrypted

## Key Files

- `lib/trial-guard.ts` - Trial limits & abuse protection
- `lib/redis-rate-limiter.ts` - Distributed rate limiting + dedup
- `lib/ssrf-protection.ts` - SSRF attack prevention
- `lib/crypto.ts` - Platform credential encryption
- `lib/billing.ts` - Stripe checkout/portal/status wrapper
- `lib/service-auth.ts` - Service key validation + permissions
- `lib/platforms/qstash.ts` - Scheduling/publish via QStash

---

_See `docs/` for details. Global rules in `~/.claude/CLAUDE.md`._
