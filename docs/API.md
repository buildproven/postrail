# PostRail API Reference

## Overview

PostRail exposes RESTful API endpoints for newsletter management, AI content generation, and social media publishing. All endpoints require authentication unless noted.

## Authentication

All API requests require a valid Supabase session. The session is automatically managed via cookies after login.

```typescript
// Session is validated via Supabase Auth
const supabase = await createClient()
const {
  data: { user },
  error,
} = await supabase.auth.getUser()
```

## Rate Limits

| Endpoint Category       | Limit       | Window     |
| ----------------------- | ----------- | ---------- |
| AI Generation           | 3 requests  | per minute |
| AI Generation           | 10 requests | per hour   |
| URL Scraping (per user) | 5 requests  | per minute |
| URL Scraping (per IP)   | 10 requests | per minute |

---

## Core Endpoints

### POST /api/generate-posts

Generate AI-powered social media posts from newsletter content.

**Request Body:**

```json
{
  "title": "Newsletter Title",
  "content": "Newsletter content text...",
  "platforms": ["linkedin", "twitter", "threads", "facebook"],
  "url": "https://example.com/newsletter" // optional, for scraping
}
```

**Response (200):**

```json
{
  "success": true,
  "newsletterId": "uuid",
  "posts": [
    {
      "id": "uuid",
      "platform": "linkedin",
      "post_type": "pre_cta",
      "content": "Generated post content...",
      "character_count": 280,
      "status": "draft"
    }
  ]
}
```

**Errors:**

- `401` - Unauthorized
- `422` - Validation error (missing content)
- `429` - Rate limit exceeded

---

### POST /api/scrape

Extract content from a URL with SSRF protection.

**Request Body:**

```json
{
  "url": "https://example.com/article"
}
```

**Response (200):**

```json
{
  "success": true,
  "title": "Article Title",
  "content": "Extracted article content...",
  "excerpt": "Brief summary..."
}
```

**Errors:**

- `400` - Invalid URL or blocked domain
- `429` - Rate limit exceeded
- `403` - SSRF protection triggered

---

## Platform Connection Endpoints

### Twitter/X

#### POST /api/platforms/twitter/connect

Connect Twitter account using API credentials (BYOK).

**Request Body:**

```json
{
  "apiKey": "your-api-key",
  "apiSecret": "your-api-secret",
  "accessToken": "your-access-token",
  "accessTokenSecret": "your-access-token-secret"
}
```

**Response (200):**

```json
{
  "success": true,
  "username": "@handle",
  "name": "Display Name"
}
```

#### GET /api/platforms/twitter/connect

Check Twitter connection status.

**Response (200):**

```json
{
  "connected": true,
  "username": "@handle"
}
```

#### DELETE /api/platforms/twitter/connect

Disconnect Twitter account.

#### POST /api/platforms/twitter/post

Publish post to Twitter.

**Request Body:**

```json
{
  "socialPostId": "uuid",
  "content": "Tweet content"
}
```

**Response (200):**

```json
{
  "success": true,
  "tweetId": "1234567890",
  "url": "https://twitter.com/user/status/1234567890"
}
```

---

### LinkedIn

#### GET /api/platforms/linkedin/auth

Initiate LinkedIn OAuth flow. Redirects to LinkedIn authorization.

#### GET /api/platforms/linkedin/callback

OAuth callback handler. Exchanges code for tokens.

#### GET /api/platforms/linkedin/connect

Check LinkedIn connection status.

#### DELETE /api/platforms/linkedin/connect

Disconnect LinkedIn account.

#### POST /api/platforms/linkedin/post

Publish post to LinkedIn.

**Request Body:**

```json
{
  "socialPostId": "uuid",
  "content": "Post content"
}
```

---

### Facebook

#### GET /api/platforms/facebook/auth

Initiate Facebook OAuth flow.

#### GET /api/platforms/facebook/callback

OAuth callback handler.

#### GET /api/platforms/facebook/connect

Check Facebook Page connection status.

#### DELETE /api/platforms/facebook/connect

Disconnect Facebook Page.

#### POST /api/platforms/facebook/post

Publish post to Facebook Page.

**Request Body:**

```json
{
  "socialPostId": "uuid",
  "content": "Post content"
}
```

---

## Queue & Scheduling

### POST /api/posts/schedule

Schedule a post for future publishing.

**Request Body:**

```json
{
  "socialPostId": "uuid",
  "scheduledTime": "2024-01-15T10:00:00Z"
}
```

### POST /api/queues/publish

QStash webhook endpoint for processing scheduled posts. (Internal use)

---

## Billing

### POST /api/billing/checkout

Create Stripe checkout session.

**Request Body:**

```json
{
  "priceId": "price_xxx",
  "successUrl": "/dashboard?success=true",
  "cancelUrl": "/pricing"
}
```

**Response (200):**

```json
{
  "url": "https://checkout.stripe.com/..."
}
```

---

## Monitoring & Status

### GET /api/health

System health check.

**Response (200):**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:00:00Z",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### GET /api/monitoring

System metrics and observability data. (Admin only)

### GET /api/rate-limit-status

Current rate limit status for authenticated user.

**Response (200):**

```json
{
  "aiGeneration": {
    "remaining": 2,
    "resetAt": "2024-01-15T10:01:00Z"
  }
}
```

### GET /api/ssrf-status

SSRF protection status and statistics. (Admin only)

### GET /api/trial-status

Trial usage status for current user.

**Response (200):**

```json
{
  "isTrialing": true,
  "daysRemaining": 10,
  "generationsToday": 2,
  "generationsTotal": 5,
  "limits": {
    "perDay": 3,
    "total": 10
  }
}
```

### GET /api/twitter-status

Twitter API connection health check.

---

## Generation Queue (Internal)

### GET /api/generate-posts/status

Check generation job status.

**Query Parameters:**

- `jobId` - Generation job ID

### POST /api/generate-posts/queue

Queue a generation job. (Internal use)

### POST /api/generate-posts/process

Process queued generation job. (QStash callback)

---

## Error Response Format

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {} // optional additional context
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
