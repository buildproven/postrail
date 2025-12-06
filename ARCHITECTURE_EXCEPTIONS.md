# Architecture Exceptions — Postrail

Purpose: document intentional deviations from the `saas-starter-kit` reference so reviewers understand what is different and why.

## Reference Baseline
- `saas-starter-kit` (Next.js App Router, Prisma/PostgreSQL, NextAuth, Stripe, Sentry, Vitest/Playwright).

## Deviations
- **Data/Auth**: Supabase (auth + Postgres + RLS) instead of Prisma/NextAuth. Rationale: faster delivery for newsletter creators; Supabase handles auth + row security. Mitigation: keep Supabase client setup in `lib/`, enforce RLS for multitenancy.
- **AI Provider**: Anthropic Claude only (no OpenAI fallback). Rationale: content quality and predictable tone. Mitigation: isolate provider calls to a single service layer for future fallbacks.
- **Styling**: Tailwind CSS v4 preview. Rationale: early adoption for new engine. Mitigation: pin versions and run visual smoke tests before upgrades.
- **Rate Limiting**: Custom Redis/memory rate limit + SSRF protections in `lib/rate-limiter.ts` and `lib/ssrf-protection.ts`; not using the starter’s middleware. Rationale: tailored to newsletter scraping and multi-platform posting limits. Mitigation: keep shared helper coverage and monitor 4xx/5xx via Sentry.
- **State Management**: No global client store yet (Zustand planned). Rationale: flows are mostly server-driven. Mitigation: introduce slices for draft/post scheduling when UI coupling grows.
- **Observability**: Sentry added with conservative sampling (20% traces, 10% replay) and DSN gating. Rationale: control cost until traffic scales. Mitigation: adjust sample rates during incidents; set `SENTRY_ENVIRONMENT` per stage.
- **Build/Dev**: Dev uses Turbopack (`next dev --turbopack`). Rationale: faster HMR. Mitigation: ensure `next build` remains canonical before releases.

## Cleanup Plan
- Add Playwright smoke path for newsletter import → generation → schedule.
- Wire Redis-backed rate limiting in production by default; keep “memory” only for local.
- Add Zustand slices if client-side scheduling/editing complexity increases.
