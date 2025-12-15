# Postrail Architecture

## System Overview

Postrail turns newsletters into platform-ready social posts with scheduling and billing baked in. Stack: Next.js 16 (App Router) + TypeScript, Supabase (Postgres + Auth), Anthropic for generation, Upstash Redis + QStash for rate limiting and scheduled publishing, Stripe for subscriptions, and Sentry for observability.

## Data Flow

1. **Ingest** – User submits newsletter content or URL → `/api/scrape` (SSRF protection + rate limits) → Supabase persists newsletter + posts.
2. **Generate** – `/api/generate-posts` applies character limits and post-type strategy → drafts stored in `social_posts`.
3. **Connect** – Users link platforms (Twitter BYOK, LinkedIn/Facebook OAuth) → encrypted credentials in `platform_connections`.
4. **Schedule** – `/api/posts/schedule` sets `scheduled_time`; QStash queues publish jobs (immediate or delayed).
5. **Publish** – QStash hits `/api/queues/publish` → posts go to platform APIs → status/idempotency updates.
6. **Billing & Access** – Stripe checkout/portal + `/api/billing/status`; feature gating via subscription tier and service keys for Growth Autopilot.

## Security Architecture

- **Input/Config**: `lib/env-validator.ts` fail-fast config; request schemas in `lib/schemas.ts`.
- **Auth**: Supabase session for user APIs; service keys (`vbl_sk_*`) for Growth Autopilot (`lib/service-auth.ts`).
- **Rate Limiting**: Redis-backed (Upstash) with memory fallback; 3/min & 10/hour for AI, SSRF limits 5/min user & 10/min IP.
- **SSRF Protection**: `lib/ssrf-protection.ts` (DNS resolution, private IP block, port filtering, blocklists).
- **Idempotency & Integrity**: Content hashing/dedup in rate limiter; DB unique constraints; status-based publish guards.
- **Observability**: Structured logging + Sentry configs (client/edge/server); status endpoints (`/api/monitoring`, `/api/rate-limit-status`, `/api/ssrf-status`, `/api/twitter-status`, `/api/trial-status`, `/api/health`).

## Core Modules

| Module                                          | Purpose                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `lib/rate-limiter.ts` / `redis-rate-limiter.ts` | AI request limiting, dedup, health checks                                      |
| `lib/ssrf-protection.ts`                        | URL validation, IP/port blocking, scrape throttling                            |
| `lib/platforms/qstash.ts`                       | QStash client, scheduling, signature verification                              |
| `lib/billing.ts`                                | Stripe checkout/portal/status + tier metadata                                  |
| `lib/service-auth.ts`                           | Scoped service keys + permissions                                              |
| `lib/feature-gate.ts` / `lib/schemas.ts`        | Feature flags + request validation                                             |
| `lib/supabase/{client,server,service}.ts`       | Supabase clients (browser, server, service)                                    |
| `lib/crypto.ts`                                 | Credential encryption/decryption, hashing                                      |
| `app/api/...`                                   | Route handlers for generation, scrape, billing, scheduling, platform auth/post |

## API Surface (high level)

- **Generation**: `/api/generate-posts`, `/api/generate-posts/{queue,process,status}`
- **Scrape**: `/api/scrape`
- **Scheduling**: `/api/posts/schedule`, `/api/queues/publish` (QStash webhook)
- **Platform Connect/Post**: `/api/platforms/{twitter,linkedin,facebook}/{auth,callback,connect,post}`, BYOK connect for Twitter
- **Service APIs**: `/api/posts/bulk`, `/api/clients/[clientId]/metrics` (service keys)
- **Billing**: `/api/billing/{checkout,portal}`, `/api/billing/status`, `/api/webhooks/stripe`
- **Diagnostics**: `/api/health`, `/api/monitoring`, `/api/rate-limit-status`, `/api/ssrf-status`, `/api/trial-status`, `/api/twitter-status`

## Data Model (simplified)

- `newsletters`: id, user_id, title/content, status, created_at/updated_at
- `social_posts`: id, newsletter_id, platform, post_type, content, character_count, status, platform_post_id, scheduled_time, published_at, error_message
- `platform_connections`: id, user_id, platform, oauth_token/refresh, metadata (encrypted), is_active, connected_at, platform_user_id/username
- `service_keys`: service_id/name, key_hash, permissions, rate limits, allowed_client_ids, active, last_used_at
- `growth_autopilot_clients`: client metadata for service APIs
- `user_profiles`: includes Stripe customer + subscription linkage

## Technology Stack

- **Frontend**: Next.js 16, React, Tailwind v4, shadcn/ui, Radix primitives
- **Backend**: Next.js API routes, Supabase PG + Auth, Stripe, Anthropic Claude
- **Queues**: Upstash QStash (publish/schedule), Upstash Redis (rate limiting)
- **Observability**: Sentry (DSN gated), structured logs
- **CI/CD**: GitHub Actions (lint, type-check, tests, Playwright, audits)

## Deployment Notes

- Vercel serverless functions; QStash webhooks must point to deployed `/api/queues/publish`.
- Stripe webhook requires `STRIPE_WEBHOOK_SECRET`.
- Environment validation runs at build; missing critical vars will fail fast.
