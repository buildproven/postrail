# Architecture Exceptions — Postrail

Purpose: document intentional deviations from the `saas-starter-kit` reference so reviewers understand what is different and why.

## Reference Baseline

- `saas-starter-kit` (Next.js App Router, Prisma/PostgreSQL, NextAuth, Stripe, Sentry, Vitest/Playwright).

## Deviations

- **Data/Auth**: Supabase (auth + Postgres + RLS) instead of Prisma/NextAuth. Rationale: faster delivery and built-in auth/RLS. Mitigation: keep Supabase clients split (`client/server/service`), enforce RLS, and gate service-role access to server-only code paths.
- **AI Provider**: Anthropic Claude only (no OpenAI fallback). Rationale: content quality and tone consistency. Mitigation: isolate provider calls behind a single service; add fallback adapter when needed.
- **Styling**: Tailwind CSS v4 preview + shadcn/ui. Rationale: future-proofed utility engine. Mitigation: pin versions and run visual smoke tests before upgrades.
- **Rate Limiting & SSRF**: Custom Redis-backed limiter + memory fallback (`lib/redis-rate-limiter.ts`) and hardened SSRF guard (`lib/ssrf-protection.ts`) instead of starter middleware. Rationale: tuned to scrape/generation/posting patterns. Mitigation: keep coverage on helpers and monitor rate-limit status endpoints.
- **Scheduling/Queues**: Upstash QStash for scheduling/publish instead of cron/worker queues. Rationale: serverless-friendly scheduling. Mitigation: enforce signature verification, keep publish route idempotent.
- **Service Integrations**: Service keys + feature gating (`lib/service-auth.ts`, `lib/feature-gate.ts`) for Growth Autopilot; Stripe billing + portal baked into API routes. Rationale: multi-tenant agency use cases. Mitigation: scope permissions per key and audit usage.
- **Observability**: Sentry wired with DSN gating and conservative sampling (20% traces, 10% replay). Rationale: cost control. Mitigation: adjust per environment via env vars; keep structured logging.
- **Build/Dev**: Turbopack for dev (`next dev --turbopack`). Rationale: faster HMR. Mitigation: always validate with `next build` in CI.

## Cleanup Plan

- Add Playwright smoke path for import → generate → schedule → publish.
- Default production to Redis-backed rate limiting; keep “memory” mode only for local.
- Add lightweight client state only if scheduling/editor coupling grows.
