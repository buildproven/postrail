# PostRail Scalability Architecture

**Last Updated:** 2026-01-15
**Status:** Production-Ready

This document describes PostRail's scalability architecture, including queue systems, rate limiting, database patterns, caching strategies, and observability.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [QStash Queue System](#qstash-queue-system)
3. [Redis Rate Limiting](#redis-rate-limiting)
4. [Database Patterns (Supabase)](#database-patterns-supabase)
5. [Caching Strategies](#caching-strategies)
6. [Monitoring & Observability](#monitoring--observability)
7. [System Interactions](#system-interactions)
8. [Configuration](#configuration)
9. [Scaling Considerations](#scaling-considerations)

---

## Architecture Overview

PostRail uses a serverless-first architecture optimized for horizontal scaling:

| Component         | Technology            | Purpose                                    | Fallback Strategy          |
| ----------------- | --------------------- | ------------------------------------------ | -------------------------- |
| **Queue**         | QStash (Upstash)      | Async job processing, delayed scheduling   | None (critical dependency) |
| **Rate Limiting** | Redis (Upstash)       | Distributed rate limits (3/min, 10/hour)   | In-memory (per-instance)   |
| **Database**      | PostgreSQL (Supabase) | Primary data store with RLS                | Service client (admin ops) |
| **Caching**       | Redis + In-Memory     | Deduplication, trial limits, system config | Memory fallback            |
| **Logging**       | Pino + Observability  | Structured logs, metrics, security events  | Console output             |
| **Encryption**    | AES-256-GCM           | OAuth token protection                     | None (critical dependency) |
| **Alerting**      | Slack/PagerDuty       | Critical system failures                   | Local logging              |

**Key Principles:**

- **Graceful Degradation:** Systems fall back to in-memory when distributed services fail
- **Circuit Breakers:** Auto-detect failures and switch to fallback mode
- **Observability-First:** All critical operations logged with structured data
- **Security by Default:** RLS enforced, credentials encrypted, rate limits everywhere

---

## QStash Queue System

**Location:** `lib/platforms/qstash.ts`

### Purpose

Distributed task queue for:

- Async AI post generation (offload expensive Claude API calls)
- Delayed post scheduling (up to 7 days in advance)
- Idempotent job processing with signature verification

### Integration Points

```typescript
// Enqueue AI generation job
POST /api/generate-posts/queue
  └─> publishGenerationJob(jobId)
       └─> QStash publishes to /api/generate-posts/process

// Schedule post for future publication
POST /api/posts/schedule
  └─> schedulePost(socialPostId, scheduledTime)
       └─> QStash delivers at scheduled time to /api/queues/publish

// Cancel scheduled post
DELETE /api/posts/[postId]/schedule
  └─> cancelScheduledPost(messageId)
```

### Key Functions

```typescript
// lib/platforms/qstash.ts

export async function publishGenerationJob(jobId: string): Promise<void>
// Publishes job to QStash for async processing
// Target: POST {QSTASH_PROCESS_URL}
// Headers: Content-Type: application/json

export async function schedulePost(
  socialPostId: string,
  scheduledTime: Date
): Promise<{ messageId: string }>
// Schedules post with delay in seconds
// Delay: Math.max(0, Math.floor((scheduledTime - Date.now()) / 1000))
// Constraint: Posts >7 days may have additional delays

export async function cancelScheduledPost(messageId: string): Promise<void>
// Cancels pending scheduled message
// DELETE https://qstash.upstash.io/v2/messages/{messageId}

export async function verifyQStashSignature(
  signature: string,
  body: string,
  url: string
): Promise<boolean>
// Verifies webhook signature using QSTASH_CURRENT_SIGNING_KEY
// Required for production security
```

### Configuration

**Environment Variables (Required):**

```bash
QSTASH_TOKEN=eyJxxx...              # Authentication token
QSTASH_CURRENT_SIGNING_KEY=sig_xxx  # Current signing key (CRITICAL)
QSTASH_NEXT_SIGNING_KEY=sig_yyy     # Next key (for rotation)
QSTASH_PROCESS_URL=https://yourapp.com/api/generate-posts/process
```

**Validation:**

- Production: Throws error if QSTASH_TOKEN missing
- Development: Allows missing config (graceful degradation)

### Failure Handling

**Webhook Security:**

- All incoming webhooks MUST verify signature via `verifyQStashSignature()`
- Returns 401 Unauthorized if signature invalid
- Prevents replay attacks and unauthorized job injection

**Retry Strategy:**

- QStash handles retries automatically (exponential backoff)
- Failed jobs logged via observability system
- Idempotency enforced via content hash deduplication

**Monitoring:**

```typescript
// Check QStash configuration status
const configured = isQStashConfigured() // true if token exists
```

### Scheduling Service Integration

**Location:** `lib/scheduling-service.ts`

```typescript
export async function schedulePostsForNewsletter(
  newsletterId: string,
  supabaseClient: SupabaseClient
): Promise<ScheduleResult[]>
// Schedules all posts from newsletter
// Uses calculateOptimalTime() for platform-specific timing
// Calls schedulePost() for each post with QStash integration
// Returns: { postId, platform, scheduledTime, qstashScheduled: boolean }
```

**Optimal Timing:**

- LinkedIn: 9 AM user's local time (B2B audience)
- Twitter: 12 PM user's local time (lunch break)
- Facebook: 7 PM user's local time (evening engagement)
- Threads: 6 PM user's local time (after work)

---

## Redis Rate Limiting

**Location:** `lib/redis-rate-limiter.ts`

### Purpose

Distributed rate limiting for serverless environments with automatic failover to in-memory fallback.

### Architecture

**Primary Mode: Redis (Distributed)**

- Shared state across all instances
- Atomic increment operations via pipelines
- TTL-based sliding windows

**Fallback Mode: In-Memory (Per-Instance)**

- Used when Redis unavailable
- Per-instance limits only
- Periodic cleanup (1% probability per request)

**Circuit Breaker:**

- Threshold: 3 consecutive Redis failures
- Reset Window: 30 seconds
- Auto-recovery: Attempts every 30s

### Rate Limits

```typescript
const RATE_LIMITS = {
  requestsPerMinute: 3, // AI generation requests per minute
  requestsPerHour: 10, // AI generation requests per hour
  windowMinute: 60 * 1000, // 1 minute sliding window
  windowHour: 60 * 60 * 1000, // 1 hour sliding window
}
```

### Key Methods

```typescript
class RedisRateLimiter {
  async checkRateLimit(
    userId: string,
    contentHash?: string
  ): Promise<{
    allowed: boolean
    retryAfter?: number // Seconds until next allowed request
    requestsRemaining: number // Remaining quota
    resetTime: Date // When quota resets
    backend: 'redis' | 'memory' // Which backend is active
    degraded?: boolean // True if fallback mode
  }>

  async getUserStatus(userId: string): Promise<{
    requestsRemaining: number
    resetTime: Date
    isLimited: boolean
    degraded: boolean
    backend: 'redis' | 'memory'
  }>

  async getStats(): Promise<{
    backend: 'redis' | 'memory'
    activeUsers: number // Count of users with active limits
    redisHealth: string // 'healthy' | 'degraded' | 'failed'
    timestamp: Date
  }>

  async healthCheck(): Promise<{
    healthy: boolean
    backend: 'redis' | 'memory'
    latency: number // Round-trip latency in ms
    degraded: boolean
  }>
}
```

### Deduplication Cache

**Purpose:** Prevent duplicate AI generation requests

```typescript
async storeDedupResult(
  userId: string,
  contentHash: string,
  result: GenerationResult
): Promise<void>
  // Stores result in Redis with 10-minute TTL
  // Key: dedup:{userId}:{contentHash}

async getCachedResult(
  userId: string,
  contentHash: string
): Promise<GenerationResult | null>
  // Retrieves cached result if exists

generateContentHash(
  title: string,
  content: string,
  userId: string
): string
  // SHA-256 hash of title + content + userId
  // Used as deduplication key
```

### Configuration

**Environment Variables:**

```bash
RATE_LIMIT_MODE=auto|redis|memory|disabled  # Default: auto
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

**Modes:**

- `auto`: Try Redis, fallback to memory on failure
- `redis`: Redis only (fail if unavailable)
- `memory`: In-memory only (per-instance)
- `disabled`: No rate limiting (development only)

### Circuit Breaker Behavior

**Failure Detection:**

```typescript
// Track consecutive Redis failures
if (redisOperation fails) {
  consecutiveFailures++
  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    // Circuit opens → switch to memory
    backend = 'memory'
    sendCriticalAlert('Redis Rate Limiter Circuit Breaker Opened', ...)
  }
}
```

**Recovery:**

```typescript
// Every 30 seconds, attempt Redis health check
setInterval(async () => {
  if (backend === 'memory') {
    const health = await redis.ping()
    if (health === 'PONG') {
      consecutiveFailures = 0
      backend = 'redis' // Circuit closes
      logger.info('Rate limiter recovered to Redis')
    }
  }
}, 30000)
```

**Degradation Signal:**

- All responses include `degraded: true` when using memory fallback
- `/api/health` returns `503 Service Unavailable` in production
- Critical alert sent via Slack/PagerDuty

### Redis Key Structure

```
rate_limit:{userId}:minute:{windowNumber}  -> counter (TTL: 60s)
rate_limit:{userId}:hour:{windowNumber}    -> counter (TTL: 3600s)
dedup:{userId}:{contentHash}               -> GenerationResult (TTL: 600s)
```

**Window Calculation:**

```typescript
const minuteWindow = Math.floor(Date.now() / WINDOW_MINUTE)
const hourWindow = Math.floor(Date.now() / WINDOW_HOUR)
```

### Protected Endpoints

```typescript
// AI generation endpoints (main rate limiter)
POST / api / generate - posts
POST / api / generate - posts / queue
POST / api / posts / [postId] / variants

// Admin monitoring (separate rate limiter)
GET / api / monitoring
```

### Memory Fallback Cleanup

```typescript
// Runs probabilistically (1% chance per request)
// Removes keys older than 1 hour or outside active time windows
// Prevents unbounded memory growth in development
if (Math.random() < 0.01) {
  cleanupStaleMemoryKeys()
}
```

---

## Database Patterns (Supabase)

**Location:** `lib/supabase/` (three-layer pattern)

### Three-Layer Architecture

PostRail uses three distinct Supabase clients with different security contexts:

| Client      | Key            | RLS             | Use Case                          |
| ----------- | -------------- | --------------- | --------------------------------- |
| **Browser** | Anon           | ✅ Enforced     | Client-side browser code          |
| **Server**  | Anon + Cookies | ✅ Enforced     | API routes with user context      |
| **Service** | Service Role   | ❌ **BYPASSED** | Admin operations, background jobs |

### 1. Browser Client (`client.ts`)

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Characteristics:**

- Uses anonymous key (publicly visible)
- Row Level Security (RLS) enforced
- Sync operations only
- Session managed via cookies

**Use Cases:**

- Client components reading user data
- Browser-side authentication state
- Real-time subscriptions

### 2. Server Client (`server.ts`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: cookiesToSet => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

**Characteristics:**

- Uses anonymous key + auth cookies
- RLS enforced (respects user context)
- Async operations with session refresh
- **Preferred for API routes**

**Use Cases:**

- API routes with authenticated user
- Server-side rendering with user data
- Any operation where user context exists

### 3. Service Client (`service.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

let serviceClient: SupabaseClient | null = null

export async function createServiceClient(): Promise<SupabaseClient> {
  if (serviceClient) return serviceClient

  if (process.env.NODE_ENV === 'production') {
    logger.warn('Service role client created (bypasses RLS)', {
      event: 'service_client_created',
      timestamp: new Date().toISOString(),
    })
  }

  serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  return serviceClient
}
```

**⚠️ Security Warning:**

- **BYPASSES ALL RLS POLICIES**
- Full admin access to all tables
- Audit logged on creation (production)

**Legitimate Use Cases:**

✅ **Allowed:**

- System configuration (`system_limits`, `feature_flags`)
- Background cron jobs without user context
- Stripe webhook handlers (cross-user billing)
- Trial/usage tracking with global view
- Disposable email validation
- Feature gating fallback (when server client unavailable)

❌ **Forbidden:**

- User-initiated API requests (use server client)
- Reading user data that should respect RLS
- Any operation where user context is available

**Usage Examples:**

```typescript
// lib/trial-guard.ts - System limits caching
const supabase = await createServiceClient()
const { data: limits } = await supabase
  .from('system_limits')
  .select('*')
  .single()

// lib/billing.ts - Stripe customer management
const supabase = await createServiceClient()
await supabase
  .from('user_profiles')
  .update({ stripe_customer_id: customerId })
  .eq('id', userId)

// lib/disposable-emails.ts - Email validation
const supabase = await createServiceClient()
const { data } = await supabase
  .from('disposable_email_domains')
  .select('domain')
```

### Connection Pooling

**Supabase Managed:**

- Connection pooling handled by Supabase
- Default: PgBouncer in transaction mode
- Max connections: Scales with plan tier

**Best Practices:**

- Reuse client instances (singleton pattern for service client)
- Close connections in serverless functions (automatic via Vercel)
- Use RLS for security, not application logic

### Query Patterns

**Pagination:**

```typescript
// Always use range() for large result sets
const { data } = await supabase.from('newsletters').select('*').range(0, 99) // Limit: 100 items per page
```

**Optimization:**

```typescript
// Use select() to limit columns
const { data } = await supabase
  .from('newsletters')
  .select('id, title, created_at') // Only needed columns

// Use filters for efficiency
const { data } = await supabase
  .from('social_posts')
  .select('*')
  .eq('newsletter_id', newsletterId)
  .order('created_at', { ascending: false })
```

---

## Caching Strategies

### 1. Trial Limits (System Config)

**Location:** `lib/trial-guard.ts`

**Cache Duration:** 5 minutes

```typescript
let systemLimitsCache: SystemLimits | null = null
let systemLimitsCacheTime: number = 0
const SYSTEM_LIMITS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getSystemLimits(): Promise<SystemLimits> {
  const now = Date.now()

  if (
    systemLimitsCache &&
    now - systemLimitsCacheTime < SYSTEM_LIMITS_CACHE_TTL
  ) {
    return systemLimitsCache
  }

  // Fetch from database (service client)
  const supabase = await createServiceClient()
  const { data } = await supabase.from('system_limits').select('*').single()

  systemLimitsCache = data
  systemLimitsCacheTime = now

  return data
}
```

**Cached Configuration:**

```typescript
{
  trialDailyLimitPerUser: 3,          // Generations per day
  trialTotalLimitPerUser: 10,         // Total during trial
  trialDailyCapGlobal: 200,           // Global cap across all trial users
  publicDemoMonthlyLimitPerIp: 3,     // Per IP address
  publicDemoCapGlobal: 100,           // Total public demo budget
  smsVerificationEnabled: false,
  disposableEmailBlockingEnabled: true
}
```

**Invalidation:** Time-based (5 minutes)

### 2. Deduplication Cache (Redis)

**Location:** `lib/redis-rate-limiter.ts`

**Cache Duration:** 10 minutes

```typescript
const DEDUP_TTL = 10 * 60  // 10 minutes

async storeDedupResult(
  userId: string,
  contentHash: string,
  result: GenerationResult
) {
  const key = `dedup:${userId}:${contentHash}`
  await redis.set(key, JSON.stringify(result), { ex: DEDUP_TTL })
}
```

**Purpose:**

- Prevent duplicate AI generation requests
- Return cached results for identical content
- Content hash: SHA-256 of (title + content + userId)

**Invalidation:** Time-based (10 minutes)

### 3. Encryption Key Cache

**Location:** `lib/crypto.ts`

**Cache Duration:** Application lifetime

```typescript
let parsedKeyCache: Buffer | null = null

function getParsedKey(): Buffer {
  if (parsedKeyCache) return parsedKeyCache

  const key = process.env.ENCRYPTION_KEY
  if (!key) throw new Error('ENCRYPTION_KEY not set')

  parsedKeyCache = Buffer.from(key, 'hex')
  return parsedKeyCache
}
```

**Purpose:** Avoid repeated hex parsing (performance optimization)

**Invalidation:** Never (static config)

### 4. Derived Key Cache (LRU)

**Location:** `lib/crypto.ts`

**Cache Size:** 100 entries

```typescript
interface DerivedKeyCache {
  [password: string]: {
    [salt: string]: Buffer
  }
}

const derivedKeyCache: DerivedKeyCache = {}
const MAX_DERIVED_KEY_CACHE_SIZE = 100

function deriveKey(password: string, salt: Buffer): Buffer {
  const saltHex = salt.toString('hex')

  if (derivedKeyCache[password]?.[saltHex]) {
    return derivedKeyCache[password][saltHex]
  }

  // PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2024)
  const derived = crypto.pbkdf2Sync(
    password,
    salt,
    600000, // 600k iterations (was 100k)
    32, // 32 bytes for AES-256
    'sha256'
  )

  // LRU eviction
  if (Object.keys(derivedKeyCache).length >= MAX_DERIVED_KEY_CACHE_SIZE) {
    delete derivedKeyCache[Object.keys(derivedKeyCache)[0]]
  }

  if (!derivedKeyCache[password]) {
    derivedKeyCache[password] = {}
  }
  derivedKeyCache[password][saltHex] = derived

  return derived
}
```

**Purpose:** Avoid expensive PBKDF2 derivation (300-600ms per call)

**Invalidation:** LRU eviction (max 100 entries)

### 5. Feature Gate Cache (Implicit)

**Location:** `lib/feature-gate.ts`

**No explicit caching:** Queries database on each check

**Future Optimization:**

```typescript
// Potential Redis cache for subscription status
const cached = await redis.get(`subscription:${userId}`)
if (cached) return JSON.parse(cached)

const status = await getSubscriptionStatus(userId)
await redis.set(`subscription:${userId}`, JSON.stringify(status), { ex: 300 })
```

---

## Monitoring & Observability

**Location:** `lib/observability.ts` and `lib/logger.ts`

### Two-Layer Approach

**Layer 1: Pino Logger** (`logger.ts`)

- Structured JSON logging
- Automatic sensitive field redaction
- Sentry breadcrumbs integration

**Layer 2: Observability Manager** (`observability.ts`)

- In-memory metrics collection
- Request tracking and duration
- System health calculation
- Alert detection

### In-Memory Storage

```typescript
const MAX_LOGS = 1000 // Sliding window
const MAX_METRICS = 5000 // Sliding window
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes
```

**Limits:**

- Logs: Last 1000 entries (FIFO)
- Metrics: Last 5000 entries (FIFO)
- Cleanup: Every 5 minutes

### Event Types Tracked

**AI Generation:**

```
ai_generation_request
ai_generation_success
ai_generation_failure
ai_generation_rate_limited
ai_generation_cache_race
```

**Scraping:**

```
scrape_request
scrape_success
scrape_failure
scrape_ssrf_blocked
scrape_rate_limited
```

**Social Platforms:**

```
twitter_post_success/failure
linkedin_post_success/failure
facebook_post_success/failure
```

**Security:**

```
monitoring_unauthorized_access
monitoring_rate_limited
trial_access_denied
public_demo_rate_limited
supabase_error
anthropic_error
```

### Health Checks

**Location:** `lib/observability.ts`

```typescript
getHealthStatus(): {
  uptime: {
    status: 'pass' | 'fail',
    details: string  // e.g., "12345s"
  },
  error_rate: {
    status: 'pass' | 'fail',
    details: string  // e.g., "5.2%"
  },
  response_time: {
    status: 'pass' | 'fail',
    details: string  // e.g., "1200ms"
  },
  memory_usage: {
    status: 'pass' | 'fail',
    details: string  // e.g., "850/1000 logs"
  }
}
```

**Failure Thresholds:**

- Error Rate: > 10%
- Response Time: > 5s (avg)
- Memory Usage: > 90% (logs or metrics)

### Monitoring Endpoints

**Health Check:** `GET /api/health`

```typescript
Returns: 200 OK | 503 Service Unavailable
Headers:
  X-RateLimit-Backend: redis|memory
  X-RateLimit-Degraded: true (if degraded)
```

**Rate Limit Status:** `GET /api/rate-limit-status`

```typescript
Returns: {
  user: {
    requestsRemaining: number
    resetTime: Date
    isLimited: boolean
    degraded: boolean
  },
  limits: {
    requestsPerMinute: 3
    requestsPerHour: 10
  },
  system: {  // Admin only
    backend: 'redis' | 'memory'
    activeUsers: number
    redisHealth: string
  }
}
```

**Admin Monitoring:** `GET /api/monitoring`

```typescript
Requires: Admin role (from user_profiles.role)
Rate Limited: Yes (separate RedisRateLimiter instance)

Sections:
  ?section=all         - All data
  ?section=logs        - Recent logs
  ?section=metrics     - Metrics summary
  ?section=stats       - System stats
  ?section=security    - Security events
  ?section=alerts      - Alert recommendations
  ?section=optimization - Performance recommendations

Returns:
  - Health status (uptime, error rate, response time, memory)
  - Recent logs (filtered by level)
  - Metrics summary (events, counts, durations)
  - Security events (unauthorized access, rate limits, SSRF)
  - Alert recommendations (based on thresholds)
  - Optimization recommendations
```

### Alert System

**Location:** `lib/alerts.ts`

**Severity Levels:**

- `critical`: Immediate action required (Slack + PagerDuty)
- `warning`: Potential issues (Slack only)
- `info`: Informational (logged only)

**Configuration:**

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
PAGERDUTY_INTEGRATION_KEY=<routing-key>
```

**Critical Alerts:**

```typescript
// Circuit breaker opened
sendCriticalAlert(
  'Redis Rate Limiter Circuit Breaker Opened',
  'Rate limiting degraded to memory-only mode',
  { consecutiveFailures, threshold, impact, action }
)

// High error rate
sendCriticalAlert(
  'High Error Rate Detected',
  `Error rate: ${errorRate}% (threshold: 10%)`,
  { errorCount, totalRequests, timeWindow }
)
```

---

## System Interactions

### Flow 1: AI Post Generation (End-to-End)

```
User Request
  ↓
POST /api/generate-posts/queue
  ↓
[1] Rate Limiter Check (Redis/Memory)
  ├─ Allowed → Continue
  └─ Denied → 429 Too Many Requests
  ↓
[2] Feature Gate Check (Subscription Tier)
  ├─ Has Access → Continue
  └─ No Access → 403 Forbidden
  ↓
[3] Trial Guard Check (Trial Limits)
  ├─ Within Limits → Continue
  └─ Exceeded → 429 + Upgrade Prompt
  ↓
[4] Deduplication Check (Redis Cache)
  ├─ Cache Hit → Return Cached Result (200)
  └─ Cache Miss → Continue
  ↓
[5] Create Job Record (Database)
  ↓
[6] Enqueue to QStash
  ↓
  publishGenerationJob(jobId)
  ↓
QStash Async Processing
  ↓
POST /api/generate-posts/process (Webhook)
  ↓
[7] Verify QStash Signature
  ├─ Valid → Continue
  └─ Invalid → 401 Unauthorized
  ↓
[8] Call Claude API (AI Generation)
  ↓
[9] Store Results in Database
  ↓
[10] Cache Result (Redis, 10-min TTL)
  ↓
[11] Update Job Status → 'completed'
```

### Flow 2: Post Scheduling

```
User Schedules Post
  ↓
POST /api/posts/schedule
  ↓
[1] Validate Post Exists (Database)
  ↓
[2] Calculate Optimal Time
  ├─ LinkedIn: 9 AM user timezone
  ├─ Twitter: 12 PM user timezone
  ├─ Facebook: 7 PM user timezone
  └─ Threads: 6 PM user timezone
  ↓
[3] Calculate Delay (seconds)
  delaySeconds = (scheduledTime - Date.now()) / 1000
  ↓
[4] Call schedulePost(socialPostId, scheduledTime)
  ↓
QStash Schedule Message
  ↓
[5] Update Database (scheduled_time, qstash_message_id)
  ↓
[Wait until scheduledTime...]
  ↓
QStash Delivers Message
  ↓
POST /api/queues/publish (Webhook)
  ↓
[6] Verify QStash Signature
  ↓
[7] Fetch Post from Database
  ↓
[8] Decrypt Platform Credentials (lib/crypto.ts)
  ↓
[9] Publish to Social Platform
  ├─ Twitter API
  ├─ LinkedIn API
  ├─ Facebook API
  └─ Threads API (via Instagram)
  ↓
[10] Update Post Status → 'published'
  ↓
[11] Log Success/Failure (Observability)
```

### Flow 3: Rate Limit Degradation

```
Normal Operation (Redis)
  ↓
Redis Connection Failure
  ├─ Timeout
  ├─ Auth Error
  └─ Network Error
  ↓
[1] Increment consecutiveFailures
  ↓
consecutiveFailures >= 3?
  ├─ No → Retry Redis (backoff)
  └─ Yes → Open Circuit Breaker
       ↓
  [2] Switch to Memory Fallback
       ↓
  [3] Send Critical Alert
       ├─ Slack Webhook
       └─ PagerDuty Incident
       ↓
  [4] Set degraded=true in Responses
       ↓
  [5] Health Endpoint → 503
       ↓
  [Every 30 seconds...]
       ↓
  [6] Attempt Redis Health Check
       ├─ Success → Close Circuit
       │    ├─ Reset consecutiveFailures
       │    ├─ Switch to Redis
       │    └─ Log Recovery
       └─ Failure → Continue Degraded
```

---

## Configuration

### Critical Variables (App Won't Start)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# AI
ANTHROPIC_API_KEY=sk-ant-xxx

# Encryption (OAuth tokens)
ENCRYPTION_KEY=64-hex-chars  # openssl rand -hex 32

# Session Security
COOKIE_SECRET=random-string
```

### Production Features (Recommended)

```bash
# QStash (Queue System)
QSTASH_TOKEN=eyJxxx...
QSTASH_CURRENT_SIGNING_KEY=sig_xxx
QSTASH_NEXT_SIGNING_KEY=sig_yyy
QSTASH_PROCESS_URL=https://yourapp.com/api/generate-posts/process

# Redis (Rate Limiting)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
RATE_LIMIT_MODE=auto  # auto|redis|memory|disabled

# Billing (Optional)
BILLING_ENABLED=true
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_PRICE_STANDARD=price_xxx  # $29/month
STRIPE_PRICE_GROWTH=price_xxx    # $59/month

# Monitoring (Optional)
SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
PAGERDUTY_INTEGRATION_KEY=routing-key

# Email (Optional)
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@yourapp.com

# Admin Endpoints
ENABLE_MONITORING_ENDPOINT=true
ENABLE_STATUS_ENDPOINTS=true
```

### Development Overrides

```bash
# Local development
NODE_ENV=development
LOG_LEVEL=debug

# Disable features for testing
RATE_LIMIT_MODE=disabled
BILLING_ENABLED=false
```

---

## Scaling Considerations

### Current Limits

| System            | Current Limit                       | Scaling Strategy                        |
| ----------------- | ----------------------------------- | --------------------------------------- |
| **Rate Limiting** | 3 req/min, 10 req/hour per user     | Redis cluster, increase limits per tier |
| **Queue**         | Unlimited (QStash managed)          | QStash auto-scales                      |
| **Database**      | Supabase plan-dependent             | Connection pooling, read replicas       |
| **Caching**       | In-memory (1000 logs, 5000 metrics) | Redis for distributed caching           |
| **Trial Limits**  | 200 trial generations/day globally  | Increase `trialDailyCapGlobal`          |

### Bottlenecks & Solutions

#### 1. In-Memory Observability Storage

**Problem:** 1000 logs + 5000 metrics evicted quickly under high load

**Solution:**

- Migrate to Redis/TimescaleDB for persistent storage
- Increase limits: `MAX_LOGS = 10000, MAX_METRICS = 50000`
- Add log level filtering (only store warn/error in production)

#### 2. Service Client Overuse

**Problem:** Service client bypasses RLS, potential security risk

**Solution:**

- Audit all `createServiceClient()` usage
- Replace with server client where possible
- Add stricter logging for service client operations

#### 3. Database N+1 Queries

**Problem:** Sequential queries for newsletter posts

**Solution (Already Implemented):**

```typescript
// lib/scheduling-service.ts - Line 145
const posts = await Promise.all(
  postIds.map(id => schedulePost(...))
)
```

#### 4. Redis Single Point of Failure

**Problem:** Circuit breaker fallback is per-instance only

**Solution:**

- Redis Cluster for high availability
- Redis Sentinel for automatic failover
- Persistent fallback to PostgreSQL for rate limits

#### 5. QStash Job Monitoring

**Problem:** No visibility into failed/pending jobs

**Solution:**

- Add `/api/admin/queue-status` endpoint
- Query QStash API for job status
- Alert on jobs stuck >5 minutes

#### 6. Platform Rate Limits

**Problem:** No coordination across social platform rate limits

**Related Backlog Item:** VBL6

**Solution:**

- Add platform-specific rate limiters (Twitter 300/3hrs, LinkedIn 100/day)
- Store platform limits in Redis with TTL
- Queue posts when approaching limits

### Scaling Roadmap

**Phase 1: Current (0-1K users)**

- ✅ Redis rate limiting with memory fallback
- ✅ QStash async processing
- ✅ Supabase connection pooling
- ✅ In-memory observability

**Phase 2: Growth (1K-10K users)**

- 🔲 Redis cluster for high availability
- 🔲 Persistent observability storage (Redis/TimescaleDB)
- 🔲 Platform-specific rate limiters (VBL6)
- 🔲 Database read replicas
- 🔲 CDN caching for static assets

**Phase 3: Scale (10K-100K users)**

- 🔲 Horizontal API scaling (Vercel auto-scales)
- 🔲 Database sharding by user_id
- 🔲 Dedicated Redis cluster per region
- 🔲 OpenTelemetry distributed tracing
- 🔲 Separate analytics database (ClickHouse)

### Monitoring for Scale

**Key Metrics to Track:**

1. **Rate Limiter Health:**
   - Redis latency (p50, p95, p99)
   - Circuit breaker open events
   - Fallback usage percentage

2. **Queue Performance:**
   - QStash job latency (enqueue → process)
   - Failed job rate
   - Scheduled message delivery accuracy

3. **Database:**
   - Query latency (p50, p95, p99)
   - Connection pool saturation
   - RLS policy performance

4. **AI Generation:**
   - Claude API latency
   - Cache hit rate (deduplication)
   - Generation success rate

5. **User Experience:**
   - Time to first post (end-to-end)
   - Scheduling accuracy (scheduled vs actual time)
   - Error rate by endpoint

---

## Known Gaps & Limitations

### 1. Observability Storage

**Gap:** In-memory storage (1000 logs, 5000 metrics) insufficient for debugging

**Impact:** Historical data lost after eviction

**Recommendation:** Migrate to Redis or TimescaleDB

### 2. Query Pagination

**Gap:** Some list queries lack pagination limits

**Impact:** Potential memory issues with large result sets

**Recommendation:** Add `range(0, 99)` to all list queries

### 3. Platform Rate Limit Coordination

**Gap:** No tracking of social platform rate limits

**Impact:** Possible API blocking from Twitter/LinkedIn/Facebook

**Recommendation:** Implement VBL6 (platform rate limit strategy)

### 4. QStash Job Monitoring

**Gap:** No visibility into QStash job status

**Impact:** Failed jobs require manual investigation

**Recommendation:** Add admin dashboard for queue status

### 5. Database Backup Strategy

**Gap:** No documented disaster recovery plan

**Impact:** Potential data loss without clear recovery procedure

**Recommendation:** Document Supabase backup/restore process

### 6. Distributed Tracing

**Gap:** No request tracing across services (API → Queue → Platform)

**Impact:** Difficult to debug end-to-end failures

**Recommendation:** Add OpenTelemetry instrumentation

### 7. API Versioning

**Gap:** No versioning strategy for 54 endpoints

**Related Backlog Item:** VBL7

**Impact:** Breaking changes affect all users simultaneously

**Recommendation:** Migrate to `/v1/*` endpoints

---

## Related Documentation

- [CLAUDE.md](./CLAUDE.md) - Project overview and tech stack
- [BACKLOG.md](./BACKLOG.md) - Priority items and roadmap
- [README.md](./README.md) - Setup and development guide

---

**Questions or Updates?**
This document should be updated when:

- New scalability systems are added
- Rate limits or thresholds change
- Major architectural refactors occur
- Production incidents reveal gaps

Last reviewed: 2026-01-15
