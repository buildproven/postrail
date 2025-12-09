# PostRail - Claude Guide

> Newsletter-to-social-media automation with AI. Transform newsletters into platform-optimized posts.

**Status**: MVP launched | **Tests**: 393+

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Framework | Next.js 16 (App Router)             |
| Language  | TypeScript 5+ (strict)              |
| Styling   | Tailwind CSS 4.0 + shadcn/ui        |
| Database  | PostgreSQL (Supabase)               |
| Auth      | Supabase Auth (email/GitHub/Google) |
| AI        | Claude Sonnet 4, Opus 4, Haiku 3.5  |
| Billing   | Stripe                              |
| Queue     | QStash (Upstash)                    |

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
├── api/generate-posts/ # AI generation (rate limited)
├── api/platforms/      # OAuth & posting
├── api/billing/        # Stripe checkout
└── dashboard/          # Protected routes
lib/
├── supabase/           # Client/server/service
├── rbac.ts             # Role-based access
├── trial-guard.ts      # Trial limits
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
- `lib/redis-rate-limiter.ts` - Distributed rate limiting
- `lib/ssrf-protection.ts` - SSRF attack prevention
- `lib/crypto.ts` - Platform credential encryption

---

_See `docs/` for details. Global rules in `~/.claude/CLAUDE.md`._
