# Repository Guidelines

## Stack & Runtime

- Next.js 16 (App Router) with TypeScript strict, Tailwind v4 + shadcn/ui, Supabase (Postgres + Auth), Stripe billing, Upstash QStash + Redis for scheduling, Sentry telemetry (client/edge/server configs).
- Node 20+ required (Volta pinned to 20.11.1); npm 10+. Keep `next.config.ts` and middleware intact for routing, headers, and observability.

## Project Structure

- `app/` routes and API handlers: billing (`api/billing/*`), platform OAuth/posting for Twitter/LinkedIn/Facebook, post generation/scheduling (`api/posts/*`, `api/queues/publish`), and dashboard pages (platforms, settings, newsletters).
- `components/` shared UI (setup guides, scheduler, shadcn `ui/dialog`); keep feature-specific pieces colocated with their routes.
- `lib/` domain helpers: Supabase clients (`supabase/{client,server,service}.ts`), `billing.ts`, `service-auth.ts`, `feature-gate.ts`, `schemas.ts`, `trial-guard.ts`, rate limiters (`rate-limiter.ts`, `redis-rate-limiter.ts`), `platforms/qstash.ts`, `ssrf-protection.ts`, `crypto.ts`, logging/observability.
- `supabase/` migrations and full schema; `tests/` Vitest suites (API/platform real tests, contracts, security, smoke); `e2e/` Playwright specs; `docs/` API/testing/architecture notes.

## Commands

- Dev/build: `npm run dev` (Turbopack), `npm run build`, `npm start`.
- Quality: `npm run lint`, `npm run type-check` (+ `type-check:tests`), `npm run lint:fix`, `npm run format[:check]`.
- Tests (Vitest): `npm test`, tiered `test:fast|medium|slow`, `test:smoke`, `test:contracts` (ENABLE_CONTRACT_TESTS), `test:coverage`, `test:smart` (strategy helper). E2E: `npm run test:e2e` (`:ui`/`:headed` variants).
- Security/validation: `npm run security:audit`, `npm run security:secrets`, `npm run validate:pre-push` (lint + stylelint + format check + tests + smoke), `npm run quality:ci`.

## Coding & Testing Conventions

- TypeScript-first; components `PascalCase`, hooks `useCamelCase`, utilities/constants `camelCase`/`SCREAMING_SNAKE_CASE`. Preserve `use client` boundaries and avoid sharing client-only code with server modules.
- Tailwind + `class-variance-authority`/`tailwind-merge` for composition; keep styling colocated with route/feature components.
- Prefer Vitest + MSW for unit/integration; reserve `*.real.test.ts` for intentional integration cases and gate external calls via envs/mocks when possible. Add contract tests for integrations and smoke coverage for deploy risks.

## Security & Configuration

- Use `.env.local` (copy from `.env.local.example`); never commit secrets. Keep encryption for platform credentials (`crypto.ts`), rate limiting (`rate-limiter.ts`/`redis-rate-limiter.ts`), SSRF protection (`ssrf-protection.ts`), and trial/feature gating intact on API routes.
- Sentry configs (`sentry.*.config.ts`) and logging should remain wired when refactoring. Prefer QStash for scheduled/publish flows instead of ad-hoc cron/queues.

## Commits & PRs

- Short, action-oriented commit messages (`feat:`, `fix:`, `chore:`). Describe scope/risks/validation in PRs; include screenshots for UI and logs for backend changes. Ensure `npm run validate:pre-push` passes or note any intentional skips.
