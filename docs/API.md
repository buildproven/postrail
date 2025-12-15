# PostRail API Reference

## Overview

PostRail exposes RESTful endpoints for AI post generation, newsletter ingestion, scheduling, and platform publishing. User-facing endpoints require a Supabase session; service endpoints use scoped service keys.

## Authentication

- **Supabase session (default)**: Cookie-based session for all user APIs.
- **Service API keys**: `Authorization: Bearer vbl_sk_*` for Growth Autopilot endpoints (`/api/posts/bulk`, `/api/clients/[clientId]/metrics`). Keys are hashed and permission-scoped.
- **Webhooks**: Stripe webhooks verify `STRIPE_WEBHOOK_SECRET`; QStash callbacks verify `Upstash-Signature`.

## Rate Limits

| Endpoint Category       | Limit                | Notes                                |
| ----------------------- | -------------------- | ------------------------------------ |
| AI Generation           | 3/min, 10/hour       | Redis-backed with in-memory fallback |
| URL Scraping (per user) | 5/min                | SSRF protection + IP throttling      |
| URL Scraping (per IP)   | 10/min               |                                      |
| Service API keys        | Per-key (DB defined) | Enforced via `service_keys` limits   |

## Core Endpoints

### AI Generation

- `POST /api/generate-posts` – Generate posts for a newsletter (title/content/url, platform list). Returns newsletter + post drafts.
- `POST /api/generate-posts/queue` / `POST /api/generate-posts/process` – Internal queue + QStash worker.
- `GET /api/generate-posts/status?jobId=...` – Check queued job status.

### Scraping

- `POST /api/scrape` – Fetch newsletter content with SSRF protection. Auth required. Enforces per-user/IP limits.

### Posts & Scheduling

- `POST /api/posts/schedule` – Schedule a single post (`postId`, `scheduledTime`) or bulk schedule all posts for a newsletter (`newsletterId`, `newsletterPublishDate`). Uses QStash when configured.
- `POST /api/posts/bulk` – Service-only bulk post creation for Growth Autopilot clients (max 50 posts/request, `clientId`, array of posts). Requires `create_post` permission.
- `POST /api/queues/publish` – QStash webhook to publish scheduled posts to connected platforms; requires `Upstash-Signature`.

### Platform Connections & Posting

**Twitter/X**

- `GET /api/platforms/twitter/auth` → `GET /api/platforms/twitter/callback` – OAuth flow.
- `POST /api/platforms/twitter/connect` – BYOK credentials (app key/secret, access token/secret).
- `GET /api/platforms/twitter/connect` – Connection status.
- `POST /api/platforms/twitter/post` – Publish a post (uses stored credentials).

**LinkedIn**

- `GET /api/platforms/linkedin/auth` → `GET /api/platforms/linkedin/callback` – OAuth flow.
- `GET /api/platforms/linkedin/connect` – Connection status.
- `POST /api/platforms/linkedin/post` – Publish post.

**Facebook**

- `GET /api/platforms/facebook/auth` → `GET /api/platforms/facebook/callback` – OAuth flow for Pages.
- `GET /api/platforms/facebook/connect` – Page connection status.
- `POST /api/platforms/facebook/post` – Publish Page post.

### Billing

- `POST /api/billing/checkout` – Create Stripe checkout session for `standard` or `growth` tiers.
- `POST /api/billing/portal` – Customer portal session.
- `GET /api/billing/status` – Current subscription status for authenticated user.
- `POST /api/webhooks/stripe` – Stripe webhook (requires `STRIPE_WEBHOOK_SECRET`).

### Metrics & Admin

- `GET /api/clients/[clientId]/metrics` – Service-only aggregated metrics; requires `read_metrics` and client access.
- `GET /api/health` – Health probe.
- `GET /api/monitoring` – Observability snapshot.
- `GET /api/rate-limit-status`, `/api/ssrf-status`, `/api/trial-status`, `/api/twitter-status` – Diagnostics/status endpoints (auth required).

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Code               | HTTP Status | Description                              |
| ------------------ | ----------- | ---------------------------------------- |
| `UNAUTHORIZED`     | 401         | Missing or invalid session               |
| `FORBIDDEN`        | 403         | Insufficient permissions                 |
| `VALIDATION_ERROR` | 422         | Invalid request body                     |
| `RATE_LIMITED`     | 429         | Too many requests                        |
| `CONFLICT`         | 409         | Resource conflict (e.g., duplicate post) |
| `NOT_FOUND`        | 404         | Resource not found                       |
| `INTERNAL_ERROR`   | 500         | Server error                             |

---

## Character Limits

Platform-specific character limits enforced during generation:

| Platform  | Limit  |
| --------- | ------ |
| Twitter/X | 280    |
| Threads   | 500    |
| LinkedIn  | 3,000  |
| Facebook  | 63,206 |

---

## Idempotency

Post publishing endpoints implement idempotency:

- Posts in `draft`, `scheduled`, or `failed` status can be published
- Posts in `publishing` status return `409 Conflict`
- Posts in `published` status return cached result

This prevents duplicate posts when retrying failed requests.
