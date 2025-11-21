# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Development
npm run dev              # Start Next.js dev server with Turbopack
npm run build           # Production build
npm run start           # Start production server

# Code Quality
npm run lint            # Run ESLint
npm run lint:fix        # Auto-fix ESLint and Stylelint issues
npm run format          # Format with Prettier
npm run format:check    # Check Prettier formatting

# Testing
npm test                # Run Vitest unit tests once
npm run test:watch      # Vitest in watch mode
npm run test:ui         # Vitest UI interface
npm run test:coverage   # Generate coverage report

npm run test:e2e        # Playwright E2E tests
npm run test:e2e:ui     # Playwright with UI
npm run test:e2e:headed # Playwright visible browser

# Security & Quality Validation
npm run security:audit    # Check npm dependencies
npm run security:secrets  # Scan for hardcoded secrets
npm run security:config   # Run security configuration
npm run validate:all      # Run comprehensive validation

# Git Hooks
npm run prepare          # Install Husky git hooks
```

## Node Version Requirements

**CRITICAL**: This project requires **Node 20+**. The `.npmrc` enforces this via `engine-strict=true`.

```bash
# Check version
node --version  # Must be v20.x.x+

# If using nvm
nvm use
```

## Architecture & Key Patterns

### Authentication Flow (Supabase)

**Three-Layer Architecture**:

1. **Client-side** (`lib/supabase/client.ts`): Browser components use `createClient()`
2. **Server-side** (`lib/supabase/server.ts`): Server Components/API routes use async `createClient()`
3. **Middleware** (`lib/supabase/middleware.ts`): Session refresh via `updateSession()`

**Middleware Protection**:

- Routes starting with `/dashboard/*` require authentication → redirect to `/auth/login` if not authenticated
- Routes starting with `/auth/*` redirect authenticated users → redirect to `/dashboard`
- Middleware runs on ALL routes except static files (via `config.matcher`)

### API Route Patterns

**Authentication Check** (all API routes):

```typescript
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

**Enhanced API Security** (all routes):

```typescript
// Rate limiting check (AI generation endpoints)
const rateLimitResult = await rateLimiter.checkRateLimit(user.id)
if (!rateLimitResult.allowed) {
  return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
}

// Request tracing and observability
return withObservability.trace('operation_name', async (requestId) => {
  // API implementation with automatic logging and metrics
})
```

**SSRF Protection** (`/api/scrape`):

- DNS resolution to IP addresses before fetching
- Private IP range blocking (localhost, 192.168.x.x, AWS metadata, etc.)
- Port filtering (only 80/443 allowed)
- Zero redirects (`maxRedirects: 0`) to prevent 302-based bypasses
- No domain allowlist (users may have newsletters on ANY domain)
- Comprehensive URL validation with `lib/ssrf-protection.ts`

**AI Generation** (`/api/generate-posts`):

- Rate limiting: 3/min, 10/hour per user with content deduplication
- Parallel post generation (3 platforms × 2 post types = 6 posts)
- Timeout protection (30s per post)
- Transaction-safe: rollback newsletter creation if posts fail to save
- Fail-fast validation: check `ANTHROPIC_API_KEY` at module load and runtime
- Request correlation and structured logging

**Platform Posting** (`/api/platforms/*/post`):

- Idempotency protection with optimistic locking
- Status-based replay prevention
- Platform credential encryption with `ENCRYPTION_KEY`
- Comprehensive error handling and retry logic

### Database Schema

**Key Tables**:

- `newsletters`: User's imported newsletters (title, content, status)
- `social_posts`: Generated posts per platform (platform, post_type, content, scheduled_time, status)

**Relationships**:

- One newsletter → Many social_posts (6 posts per newsletter: 3 platforms × 2 types)

### Component Patterns

**shadcn/ui Components**:

- Located in `components/ui/` (button, input, card, badge, etc.)
- Use Radix UI primitives with Tailwind styling
- Configured via `components.json`

**Custom Components**:

- `newsletter-editor.tsx`: Tiptap rich text editor for newsletter content
- `post-preview-card.tsx`: Social post preview with character count badges

## Testing Strategy

**Current State**: 393+ passing tests with 75%+ coverage across 5 test types

Based on [TEST_STRATEGY_AUDIT.md](https://github.com/brettstark73/create-quality-automation/blob/claude/fix-eslint-command-01Eg8BZZe58yiZ7RNGsGHkXL/TEST_STRATEGY_AUDIT.md), we implement comprehensive testing that validates both structure AND execution.

### Test Types

**1. Unit Tests** (`npm test`)

- 393+ tests covering components, API routes, and utilities
- Mock external dependencies (Supabase, Anthropic, Twitter API)
- Run on every commit via Husky pre-commit hook
- Files: `tests/api/*.test.ts`, `tests/components/*.test.tsx`, `tests/lib/*.test.ts`

**2. Command Execution Tests** (`npm run test:execution`)

- **Critical**: Verify npm scripts actually work in isolated environments
- Catches broken ESLint configs, deprecated CLI flags, build failures
- Run commands in temporary directories to test in fresh environments
- Files: `tests/execution/command-execution.test.ts`
- **Why**: "12,258 tests that missed a deprecated ESLint flag" - structure tests aren't enough

**3. API Contract Tests** (`npm run test:contracts`)

- Verify external API contracts haven't changed (Anthropic, Twitter, Supabase)
- Make REAL API calls (skipped by default, enable with `ENABLE_CONTRACT_TESTS=true`)
- Run weekly in CI, not on every commit (costs money, slow)
- Files: `tests/contracts/api-contracts.test.ts`
- **Why**: Mocked tests don't catch breaking changes in external SDKs

**4. Smoke Tests** (`npm run test:smoke`)

- Fast pre-deployment checks for configuration validity
- Verify files exist, environment variables documented, no hardcoded secrets
- Run before deploying to catch configuration errors
- Files: `tests/smoke/deployment.test.ts`

**5. E2E Tests** (`npm run test:e2e`)

- Full user flows with Playwright (newsletter import, post generation, etc.)
- Test in real browser environment
- Files: `e2e/*.spec.ts`

**6. Flow Tests** (`npm run test:flow`, `npm run test:generation`)

- Integration tests for full newsletter → post generation flow
- Files: `test-full-flow.js`, `test-generation.js`

### Running Tests

```bash
# Standard development workflow
npm test                  # Unit tests only (fast)
npm run test:watch        # Unit tests in watch mode
npm run test:coverage     # Unit tests with coverage report

# Pre-deployment checks
npm run test:smoke        # Fast configuration checks
npm run test:all          # Unit + Smoke + E2E (comprehensive)

# Specialized tests
npm run test:execution    # Verify npm scripts work (slow, run weekly)
npm run test:contracts    # Verify API contracts (costs money, run weekly)
npm run test:e2e          # Browser-based E2E tests
npm run test:flow         # Full flow integration test
```

### Test Philosophy

**Key Insight from Audit**: "Your tests verify that configurations exist, but don't verify they actually work"

- ✅ **DO**: Test actual execution (run `npm run lint`, not just check if script exists)
- ✅ **DO**: Test in isolated environments (temp directories, fresh npm install)
- ✅ **DO**: Make real API calls occasionally (weekly contract tests)
- ❌ **DON'T**: Only test structure (file exists, script defined)
- ❌ **DON'T**: Only mock external APIs (misses breaking changes)
- ❌ **DON'T**: Test in current project context (misses environment issues)

### When Writing New Tests

- **Unit tests**: Import and test actual components/functions with mocked dependencies
- **API tests**: Mock `@/lib/supabase/server` and external services (axios, Anthropic, Twitter)
- **Integration tests**: Use Playwright for end-to-end flows
- **Execution tests**: Run commands in isolated temp directories
- **Contract tests**: Make real API calls, skip by default, guard with env var

## Environment Variables

**Required for Development** (see `.env.local.example`):

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase anonymous key
- `ANTHROPIC_API_KEY`: Claude API key for post generation

**Optional** (for future OAuth implementation):

- `LINKEDIN_CLIENT_ID/SECRET`: LinkedIn OAuth
- `META_APP_ID/SECRET`: Facebook/Threads OAuth
- `NEXTAUTH_SECRET/URL`: NextAuth configuration
- `UPSTASH_REDIS_*/QSTASH_*`: Queue system (future scheduling feature)

## Critical Implementation Details

### AI Post Generation Strategy

**Pre-CTA Posts** (24-8 hours before newsletter):

- Create FOMO, urgency, curiosity
- Tease 3-5 key insights without revealing everything
- Clear CTA: "Sign up so you don't miss it"

**Post-CTA Posts** (48-72 hours after newsletter):

- Reframe as valuable resource (guide/playbook/blueprint)
- List 3-4 specific outcomes/benefits
- Engagement trigger: "Comment [WORD] to get access"

**Platform Tones**:

- **LinkedIn**: Professional, ROI-focused, sparse emojis (1-2), 3-5 hashtags
- **Threads**: Conversational, casual, liberal emojis (2-3), question hooks
- **Facebook**: Story-driven, community-focused, moderate emojis (1-2)

**Character Limits**:

- LinkedIn: 3000 (target 70% = 2100)
- Threads: 500 (target 70% = 350)
- Facebook: 63206 (target 70% = 44244)

### URL Scraping with Mozilla Readability

Uses `@mozilla/readability` (same as Firefox Reader Mode) for intelligent content extraction:

- Automatically finds article content
- Removes ads, navigation, footers
- Preserves paragraph structure
- Cleans up whitespace while keeping readability

### Security Architecture

**Multi-Layer Security Implementation**: LetterFlow implements comprehensive security controls across five layers:

#### 1. Rate Limiting (`lib/rate-limiter.ts`)

**Purpose**: Prevent API abuse and ensure fair resource usage
```typescript
// Per-user limits: 3/min, 10/hour for AI generation
const rateLimitResult = await rateLimiter.checkRateLimit(user.id)
if (!rateLimitResult.allowed) {
  return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
}
```

**Features**:
- Content-based deduplication (same input = cached result)
- Automatic cleanup of expired rate limit records
- Request queuing and batching for efficiency
- Memory-based storage with periodic cleanup

#### 2. SSRF Protection (`lib/ssrf-protection.ts`)

**Purpose**: Prevent Server-Side Request Forgery attacks
```typescript
// Comprehensive URL validation before fetching
const validation = await ssrfProtection.validateUrl(newsletterUrl)
if (!validation.safe) {
  return NextResponse.json({ error: validation.reason }, { status: 400 })
}
```

**Protection Layers**:
1. Parse URL and validate protocol (HTTP/HTTPS only)
2. DNS resolution to IP addresses before fetching
3. Block private IP ranges (RFC 1918, cloud metadata endpoints)
4. Port filtering (only 80/443 allowed)
5. Zero redirects (`maxRedirects: 0`) to prevent bypass
6. Response size limits (5MB max)

#### 3. Idempotency Protection

**Purpose**: Prevent duplicate operations and ensure data consistency
```typescript
// Check if post already exists and published
if (existingPost?.status === 'published' && existingPost.platform_post_id) {
  return NextResponse.json({ success: true, fromCache: true })
}
```

**Implementation**:
- Database unique constraints (`newsletter_id, platform, post_type`)
- Optimistic locking for concurrent operation safety
- Status-based replay protection
- Transaction-safe rollback on failures

#### 4. Observability (`lib/observability.ts`)

**Purpose**: Comprehensive monitoring and incident response
```typescript
// Structured logging with request tracing
const withObservability = new ObservabilityManager()
export default withObservability.trace('operation_name', async (requestId) => {
  // Operation implementation with automatic logging
})
```

**Features**:
- Request correlation IDs for distributed tracing
- Structured event logging (security, performance, errors)
- Real-time metrics collection
- Health check endpoints for monitoring
- Security event alerting

#### 5. Environment Validation (`lib/env-validator.ts`)

**Purpose**: Fail-fast configuration validation
```typescript
// Startup validation with clear error messages
const validation = validateEnvironment()
if (!validation.valid) {
  console.error('Environment validation failed:', validation.errors)
  process.exit(1)
}
```

**Validation Rules**:
- Required environment variables presence
- Format validation (URLs, API keys, encryption keys)
- AES-256 key validation (64 hex chars)
- Development vs production environment checks

### Monitoring Endpoints

**Health & Status Monitoring**:
- `/api/monitoring?section=health` - Overall system health
- `/api/monitoring?section=security` - Security events and metrics
- `/api/monitoring?section=logs&level=warn` - Filtered log access
- `/api/rate-limit-status` - Rate limiting status for users
- `/api/ssrf-status` - SSRF protection statistics
- `/api/twitter-status` - Platform posting status

**Authentication & Authorization**:
- All `/api/*` routes check for authenticated user
- Middleware handles session refresh and route protection
- No API keys or secrets in client-side code
- Platform credentials encrypted with `ENCRYPTION_KEY`

## Common Development Patterns

### Running a Single Test

```bash
# Run specific test file
npm test -- tests/api/scrape.test.ts

# Run tests matching pattern
npm test -- --grep "SSRF"
```

### Adding a New API Route

1. Create route handler in `app/api/[route]/route.ts`
2. Add authentication check at the top
3. Validate input with Zod schema (if using forms)
4. Use `createClient()` from `@/lib/supabase/server` for database access
5. Handle errors with appropriate HTTP status codes
6. Add corresponding tests in `tests/api/`

### Adding a New shadcn/ui Component

```bash
npx shadcn@latest add [component-name]
# This adds the component to components/ui/
```

### Working with Supabase

**Server Components/API Routes**:

```typescript
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient() // Note: async
```

**Client Components**:

```typescript
import { createClient } from '@/lib/supabase/client'
const supabase = createClient() // Note: synchronous
```

## Project Structure Logic

```
app/
├── (auth)/              # Authentication pages (route group, no layout)
│   ├── login/
│   ├── signup/
│   └── reset-password/
├── (dashboard)/         # Protected dashboard (route group with dashboard layout)
│   ├── layout.tsx       # Dashboard-specific layout
│   ├── page.tsx         # Dashboard home
│   ├── newsletters/     # Newsletter management
│   ├── platforms/       # Platform connections (stub)
│   └── settings/        # User settings (stub)
├── api/                 # API routes
│   ├── scrape/          # URL scraping with SSRF protection
│   ├── generate-posts/  # AI post generation with rate limiting
│   ├── platforms/*/post # Platform posting with idempotency
│   ├── monitoring/      # System health and observability
│   ├── rate-limit-status/ # Rate limiting status endpoint
│   ├── ssrf-status/     # SSRF protection statistics
│   └── twitter-status/  # Platform posting status
└── layout.tsx           # Root layout

lib/
├── supabase/            # Supabase client configuration
│   ├── client.ts        # Browser client
│   ├── server.ts        # Server client
│   └── middleware.ts    # Session refresh & route protection
├── rate-limiter.ts      # Rate limiting with content deduplication
├── ssrf-protection.ts   # SSRF attack prevention
├── observability.ts     # Monitoring, logging, health checks
├── env-validator.ts     # Environment validation at startup
└── utils.ts             # Utility functions (cn, etc.)

components/
├── ui/                  # shadcn/ui components
└── *.tsx                # Custom components

tests/
├── setup.ts             # Vitest configuration
├── api/                 # API route tests
├── components/          # Component tests
└── integration/         # Integration tests
```

## Development Roadmap Context

**Current Phase**: Week 2 - AI Generation (partially complete)

- ✅ Newsletter input module
- ✅ Claude AI integration
- ✅ Post generation for 3 platforms
- ⏳ Platform OAuth + posting
- ⏳ Scheduling system
- ⏳ Analytics dashboard

**Future Phases**:

- Week 3-4: LinkedIn, Threads, Facebook OAuth + posting APIs
- Week 5: Upstash Redis queue + QStash scheduling
- Week 6: Analytics dashboard + PWA setup
