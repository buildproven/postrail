# Deployment Guide

## Overview

Deploy Postrail to Vercel (recommended) or Docker with Stripe billing, QStash scheduling, and Supabase configured. Node 20+ required.

## Environment Variables

### Required

| Variable                                              | Description                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`                            | Supabase project URL                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                       | Supabase anon key                                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`                           | Supabase service role (server-side tasks, service APIs)                              |
| `ANTHROPIC_API_KEY`                                   | Claude API key                                                                       |
| `STRIPE_SECRET_KEY`                                   | Stripe secret key                                                                    |
| `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_GROWTH`       | Stripe price IDs                                                                     |
| `STRIPE_WEBHOOK_SECRET`                               | Stripe webhook signing secret                                                        |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis-backed rate limiter                                                            |
| `QSTASH_TOKEN`                                        | QStash publish token                                                                 |
| `QSTASH_PROCESS_URL`                                  | URL for QStash to call (`https://your-app/api/generate-posts/process` or `/publish`) |
| `QSTASH_CURRENT_SIGNING_KEY`                          | QStash signing key for webhook verification                                          |

### Optional

| Variable                                | Description                                           |
| --------------------------------------- | ----------------------------------------------------- |
| `LINKEDIN_CLIENT_ID/SECRET`             | LinkedIn OAuth                                        |
| `META_APP_ID/SECRET`                    | Facebook OAuth                                        |
| `QSTASH_NEXT_SIGNING_KEY`               | Next signing key (rotation)                           |
| `RATE_LIMIT_MODE`                       | `auto` (default) \| `redis` \| `memory` \| `disabled` |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSNs (server/client)                           |
| `SENTRY_ORG` / `SENTRY_PROJECT`         | Sentry upload config                                  |

## Deployment Options

### Vercel (Recommended)

```bash
npm i -g vercel
vercel
# Add env vars
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_PRICE_STANDARD
vercel env add STRIPE_PRICE_GROWTH
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add QSTASH_TOKEN
vercel env add QSTASH_PROCESS_URL
vercel env add QSTASH_CURRENT_SIGNING_KEY
```

Set the QStash destination to the deployed URLs for `/api/generate-posts/process` and `/api/queues/publish`.

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

Ensure env vars are injected (e.g., `docker run --env-file .env.production`).

## Database Setup (Supabase)

1. Create a Supabase project.
2. Apply migrations from `supabase/migrations/`.
3. Configure Row Level Security policies per migrations.
4. Provision service role key for server-side/service APIs.

## Verification Checklist

- Auth works (Supabase session).
- AI generation and scrape endpoints respond (rate limits enforced).
- Platform connections succeed (Twitter BYOK, LinkedIn, Facebook).
- Scheduling/publish works end-to-end (QStash signature verified).
- Stripe checkout/portal and webhook handling succeed.
- Sentry DSN set (optional) and errors reported.

---

Last Updated: 2025-12-17
