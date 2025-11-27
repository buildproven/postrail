# Postrail Architecture & Data Flow

## System Overview

Postrail is a secure newsletter-to-social-media automation platform with comprehensive security controls, rate limiting, and observability.

## Data Flow Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   User Input    │    │   URL Scraping   │    │ Content Storage │
│                 │    │                  │    │                 │
│ • Newsletter URL│────▶│ • SSRF Protection│────▶│ • Supabase DB   │
│ • Manual Text   │    │ • Rate Limiting  │    │ • Readability   │
│ • Title/Content │    │ • Port Filtering │    │ • Validation    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AI Content Generation                        │
│                                                                 │
│ • Rate Limiting (3/min per user, 10/hour per user)            │
│ • Request Deduplication (content-based hashing)                │
│ • Queue Management (concurrent request handling)               │
│ • Claude API Integration (Anthropic)                          │
│ • Platform-specific tone and formatting                        │
│ • Character limit optimization                                  │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Content Processing                         │
│                                                                 │
│ • Newsletter creation (Supabase transaction)                   │
│ • Post generation (6 posts: 3 platforms × 2 types)           │
│ • Database persistence (social_posts table)                    │
│ • Unique constraints (newsletter_id, platform, post_type)      │
│ • Status tracking (draft → publishing → published/failed)      │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Platform Publishing                          │
│                                                                 │
│ • Idempotency Protection (status-based + optimistic locking)   │
│ • BYOK Credential Management (encrypted in metadata)           │
│ • Platform APIs (Twitter v2, LinkedIn, Facebook, Threads)      │
│ • Retry Logic with backoff                                     │
│ • Duplicate Prevention                                          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              Monitoring & Observability                        │
│                                                                 │
│ • Structured Logging (request IDs, user tracking)              │
│ • Metrics Collection (performance, errors, security events)    │
│ • Health Checks (error rates, response times, memory usage)    │
│ • Alerting (rate limit abuse, high error rates, stuck posts)   │
│ • Status Dashboards (/api/monitoring, /api/*-status)          │
└─────────────────────────────────────────────────────────────────┘
```

## Security Architecture

### Multi-Layer Protection

```
┌─────────────────────────────────────────────────────────────────┐
│                     Security Layers                            │
│                                                                 │
│ 1. Input Validation & Environment Protection                   │
│    • Environment variable validation at startup                │
│    • Request schema validation                                 │
│    • Authentication middleware (Supabase Auth)                 │
│                                                                │
│ 2. Rate Limiting & Abuse Prevention                           │
│    • Per-user AI generation limits (3/min, 10/hour)          │
│    • Per-user + per-IP scraping limits (5/min user, 10/min IP)│
│    • Request deduplication and queue management               │
│                                                                │
│ 3. SSRF Protection (Server-Side Request Forgery)              │
│    • DNS resolution validation                                │
│    • Private IP range blocking (RFC1918, cloud metadata)      │
│    • Port filtering (only 80/443 allowed)                     │
│    • Domain blocklist (AWS/GCP/Azure metadata endpoints)      │
│                                                                │
│ 4. Idempotency & Data Integrity                              │
│    • Content-based request deduplication                      │
│    • Database unique constraints                              │
│    • Optimistic locking for concurrent operations             │
│    • Status-based replay protection                           │
│                                                                │
│ 5. Observability & Incident Response                          │
│    • Structured logging with request correlation              │
│    • Security event monitoring and alerting                   │
│    • Performance metrics and health checks                    │
│    • Failed operation tracking and debugging                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Core Modules

| Module                                             | Purpose                          | Key Features                                             |
| -------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| **Rate Limiter** (`lib/rate-limiter.ts`)           | Prevents API abuse               | Per-user limits, content deduplication, queue management |
| **SSRF Protection** (`lib/ssrf-protection.ts`)     | Prevents internal network access | DNS validation, port filtering, IP blocking              |
| **Observability** (`lib/observability.ts`)         | System monitoring                | Structured logging, metrics, health checks               |
| **Environment Validator** (`lib/env-validator.ts`) | Configuration validation         | Startup validation, clear error messages                 |

### API Architecture

| Endpoint                      | Purpose                 | Security Features                           |
| ----------------------------- | ----------------------- | ------------------------------------------- |
| `/api/generate-posts`         | AI content generation   | Rate limiting, deduplication, observability |
| `/api/scrape`                 | URL content extraction  | SSRF protection, rate limiting              |
| `/api/platforms/twitter/post` | Social media publishing | Idempotency, optimistic locking             |
| `/api/monitoring`             | System observability    | Health checks, metrics, alerting            |
| `/api/*-status`               | Component status        | Debugging, monitoring, transparency         |

### Database Schema

```sql
-- Core entities
newsletters (id, user_id, title, content, status, created_at, updated_at)
social_posts (id, newsletter_id, platform, post_type, content, character_count,
              status, platform_post_id, published_at, scheduled_time,
              error_message, created_at, updated_at)

-- Security constraints
UNIQUE(newsletter_id, platform, post_type)  -- Prevents duplicate generation

-- Platform connections
platform_connections (id, user_id, platform, oauth_token, oauth_refresh_token,
                      metadata, is_active, created_at, updated_at)
```

## Technology Stack

### Frontend

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety and developer experience
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Component library with Radix UI primitives

### Backend

- **Next.js API Routes** - Serverless functions
- **Supabase** - PostgreSQL database with auth
- **Anthropic Claude** - AI content generation
- **Twitter API v2** - Social media publishing

### Security & Infrastructure

- **Environment Validation** - Startup configuration checks
- **Rate Limiting** - In-memory with cleanup and persistence
- **SSRF Protection** - Multi-layer network security
- **Structured Logging** - Request tracing and metrics
- **GitHub Actions** - CI/CD with security testing

### Monitoring & Observability

- **Health Checks** - System status and alerting
- **Metrics Collection** - Performance and security events
- **Request Tracing** - End-to-end operation tracking
- **Error Monitoring** - Structured error handling and reporting

## Deployment Architecture

### Development

- Local development with hot reloading
- Environment validation on startup
- Local testing with security checks
- Git hooks for code quality

### CI/CD Pipeline

- Automated testing (unit, smoke, E2E)
- Security scanning (ESLint, gitleaks)
- TypeScript compilation validation
- Deployment to staging/production

### Production (Vercel)

- Serverless function deployment
- Environment variable management
- SSL termination and CDN
- Monitoring and logging integration

## Security Considerations

### Threat Model

- **SSRF Attacks**: Mitigated by comprehensive URL validation
- **Rate Limit Abuse**: Prevented by multi-layer rate limiting
- **API Key Compromise**: Minimized by proper secret management
- **Duplicate Operations**: Prevented by idempotency controls
- **Data Injection**: Mitigated by input validation and prepared statements

### Security Best Practices

- Principle of least privilege for API access
- Environment-based configuration management
- Comprehensive logging for audit trails
- Regular security testing and validation
- Fail-fast validation at system boundaries
