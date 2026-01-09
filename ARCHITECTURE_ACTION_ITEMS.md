# Architecture Review - Action Items

**Created:** 2026-01-08  
**Priority Order:** P0 (Critical) → P1 (High) → P2 (Medium)

---

## P0: Critical - Fix This Week (12 hours total)

### TD-1: Fix Test Environment Configuration (2 hours)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** 39 failing tests blocking CI/CD

**Tasks:**

- [ ] Add missing env vars to `vitest.config.ts`:
  ```typescript
  env: {
    COOKIE_SECRET: 'test-cookie-secret-for-hmac-signing',
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ENCRYPTION_KEY: 'a'.repeat(64), // 64 hex chars
  }
  ```
- [ ] Add crypto cache reset utility to `lib/crypto.ts`:
  ```typescript
  export function __resetCryptoCache() {
    cachedEncryptionKey = null
    derivedKeyCache.clear()
  }
  ```
- [ ] Update component tests to match actual DOM structure
- [ ] Run `npm test` to verify all tests pass
- [ ] Update `.github/workflows/ci.yml` if needed

**Files:**

- `/Users/brettstark/Projects/postrail/vitest.config.ts`
- `/Users/brettstark/Projects/postrail/lib/crypto.ts`
- `/Users/brettstark/Projects/postrail/tests/api/billing-webhook.real.test.ts`
- `/Users/brettstark/Projects/postrail/tests/components/TwitterSetupGuide.real.test.tsx`
- `/Users/brettstark/Projects/postrail/tests/lib/crypto.test.ts`

**Success Criteria:**

- All 920 tests pass
- CI/CD pipeline green
- No test isolation issues

---

### TD-2: Audit Service Client Usage (4 hours)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** Security risk (RLS bypass), architectural violation

**Tasks:**

- [ ] Run audit: `grep -r "createServiceClient" app/api lib/ | grep -v "import"`
- [ ] Review 75 files using service client
- [ ] Create approved list:
  - `lib/billing.ts` - ✅ Cross-user Stripe operations
  - `lib/trial-guard.ts` - ✅ System limits, global caps
  - `lib/disposable-emails.ts` - ✅ No user context
  - `lib/service-auth.ts` - ✅ Server-to-server auth
- [ ] Fix violations:
  - `lib/feature-gate.ts` lines 112-130 - Remove service client fallback
  - `app/api/generate-posts/route.ts` - Use server client only (remove line 4)
  - Others TBD during audit
- [ ] Add ESLint rule to prevent future misuse:
  ```javascript
  rules: {
    'no-restricted-imports': ['error', {
      paths: [{
        name: '@/lib/supabase/service',
        importNames: ['createServiceClient'],
        message: 'Service client bypasses RLS - use server client unless approved (see CLAUDE.md)'
      }]
    }]
  }
  ```
- [ ] Test affected API routes
- [ ] Update `CLAUDE.md` with approved usage patterns

**Files:**

- All 75 files using `createServiceClient` (see `ARCHITECTURE_REVIEW.md` section 1.1)
- `/Users/brettstark/Projects/postrail/lib/feature-gate.ts`
- `/Users/brettstark/Projects/postrail/app/api/generate-posts/route.ts`
- `/Users/brettstark/Projects/postrail/eslint.config.mjs` (or `.eslintrc.js`)

**Success Criteria:**

- Service client only used in approved contexts
- ESLint rule enforced
- All API routes use server client for user requests
- Documentation updated

---

### TD-3: Add Crypto Cache Reset for Tests (30 minutes)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** Intermittent test failures, test isolation issues

**Tasks:**

- [ ] Add cache reset utility to `lib/crypto.ts`:
  ```typescript
  // Test-only export (not in production bundle due to tree-shaking)
  export function __resetCryptoCache(): void {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('__resetCryptoCache() is only for tests')
    }
    cachedEncryptionKey = null
    derivedKeyCache.clear()
  }
  ```
- [ ] Update `tests/lib/crypto.test.ts` to use cache reset:

  ```typescript
  import { __resetCryptoCache } from '@/lib/crypto'

  beforeEach(() => {
    __resetCryptoCache()
    // Set fresh env vars
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })
  ```

- [ ] Run crypto tests: `npm test tests/lib/crypto.test.ts`
- [ ] Verify 2 previously failing tests now pass

**Files:**

- `/Users/brettstark/Projects/postrail/lib/crypto.ts`
- `/Users/brettstark/Projects/postrail/tests/lib/crypto.test.ts`

**Success Criteria:**

- All crypto tests pass
- No test isolation issues
- Cache reset only available in test environment

---

## P1: High Priority - Next Sprint (16 hours total)

### TD-4: Add Retry Logic for AI Generation (4 hours)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** Partial failures require manual regeneration, poor UX

**Tasks:**

- [ ] Add exponential backoff utility to `lib/utils.ts`:
  ```typescript
  export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn()
      } catch (error) {
        if (i === maxRetries - 1) throw error
        await new Promise(resolve =>
          setTimeout(resolve, baseDelay * Math.pow(2, i))
        )
      }
    }
    throw new Error('Unreachable')
  }
  ```
- [ ] Update `app/api/generate-posts/route.ts` to use retry:
  ```typescript
  const postContent = await retryWithBackoff(
    () => generatePost(title, content, platform, postType),
    3, // max retries
    2000 // 2s base delay
  )
  ```
- [ ] Store failure reason in database:
  - Add `failure_reason` column to `social_posts` table
  - Update insert to include failure reason
- [ ] Add regenerate endpoint: `app/api/posts/[postId]/regenerate/route.ts`
- [ ] Update UI to show regenerate button for failed posts
- [ ] Test with forced failures

**Files:**

- `/Users/brettstark/Projects/postrail/lib/utils.ts`
- `/Users/brettstark/Projects/postrail/app/api/generate-posts/route.ts`
- `/Users/brettstark/Projects/postrail/app/api/posts/[postId]/regenerate/route.ts` (new)
- Database migration for `failure_reason` column

**Success Criteria:**

- Transient AI failures automatically retry
- Failed posts show reason in UI
- Users can regenerate individual posts
- Exponential backoff prevents rate limit issues

---

### TD-5: Document Database Schema (2 hours)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** Onboarding friction, unclear relationships

**Tasks:**

- [ ] Create `docs/database-schema.md` with:
  - Table descriptions
  - Column types and constraints
  - Foreign key relationships
  - RLS policies
  - Indexes
- [ ] Generate ER diagram using Supabase Studio or dbdiagram.io
- [ ] Document migration strategy (Supabase migrations)
- [ ] Add schema to `CLAUDE.md` reference section
- [ ] Review with team

**Files:**

- `/Users/brettstark/Projects/postrail/docs/database-schema.md` (new)
- `/Users/brettstark/Projects/postrail/docs/er-diagram.png` (new)
- `/Users/brettstark/Projects/postrail/CLAUDE.md` (update)

**Success Criteria:**

- Complete schema documentation
- Visual ER diagram
- Clear RLS policy documentation
- New developers can understand database structure in < 15 minutes

---

### TD-6: Create Test Fixture System (8 hours)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** Brittle tests, repetitive test data creation

**Tasks:**

- [ ] Create `tests/fixtures/index.ts`:
  ```typescript
  export const fixtures = {
    user: {
      trial: () => ({ id: 'test-trial', plan: 'trial', ... }),
      standard: () => ({ id: 'test-std', plan: 'standard', ... }),
      growth: () => ({ id: 'test-growth', plan: 'growth', ... }),
    },
    newsletter: {
      draft: () => ({ id: 'newsletter-1', status: 'draft', ... }),
      published: () => ({ id: 'newsletter-2', status: 'published', ... }),
    },
    post: {
      linkedin: () => ({ platform: 'linkedin', ... }),
      twitter: () => ({ platform: 'x', ... }),
    },
    subscription: {
      active: () => ({ status: 'active', ... }),
      past_due: () => ({ status: 'past_due', ... }),
    },
  }
  ```
- [ ] Add factory functions with overrides:
  ```typescript
  export const create = {
    user: (overrides?: Partial<User>) => ({
      ...fixtures.user.trial(),
      ...overrides,
    }),
  }
  ```
- [ ] Update 10 test files to use fixtures (sample)
- [ ] Document fixture pattern in `tests/README.md`
- [ ] Review with team

**Files:**

- `/Users/brettstark/Projects/postrail/tests/fixtures/index.ts` (new)
- `/Users/brettstark/Projects/postrail/tests/fixtures/types.ts` (new)
- `/Users/brettstark/Projects/postrail/tests/README.md` (new)
- Sample test files to update

**Success Criteria:**

- Consistent test data across all tests
- Easy to create variations (overrides)
- Reduced test boilerplate by ~50%
- Clear documentation for fixture usage

---

### TD-7: Add React Error Boundaries (1 hour)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** Uncaught UI errors, poor UX

**Tasks:**

- [ ] Create `components/ErrorBoundary.tsx`:

  ```typescript
  'use client'
  import { Component, ReactNode } from 'react'

  export class ErrorBoundary extends Component<
    { children: ReactNode; fallback: ReactNode },
    { hasError: boolean }
  > {
    state = { hasError: false }

    static getDerivedStateFromError() {
      return { hasError: true }
    }

    componentDidCatch(error: Error, errorInfo: any) {
      logger.error({ error, errorInfo })
    }

    render() {
      if (this.state.hasError) {
        return this.props.fallback
      }
      return this.props.children
    }
  }
  ```

- [ ] Wrap dashboard layout:
  ```typescript
  // app/dashboard/layout.tsx
  export default function DashboardLayout({ children }) {
    return (
      <ErrorBoundary fallback={<ErrorFallback />}>
        {children}
      </ErrorBoundary>
    )
  }
  ```
- [ ] Create fallback UI component
- [ ] Test with forced error
- [ ] Add error reporting to Sentry

**Files:**

- `/Users/brettstark/Projects/postrail/components/ErrorBoundary.tsx` (new)
- `/Users/brettstark/Projects/postrail/components/ErrorFallback.tsx` (new)
- `/Users/brettstark/Projects/postrail/app/dashboard/layout.tsx`

**Success Criteria:**

- UI errors don't crash entire app
- User sees friendly error message
- Errors logged to Sentry
- User can recover without refresh (if possible)

---

### TD-8: Enable Sentry in Production (1 hour)

**Owner:** TBD  
**Status:** 🔴 Not Started  
**Impact:** Missing production error tracking

**Tasks:**

- [ ] Create Sentry project (if not exists)
- [ ] Add env vars to production:
  ```
  SENTRY_DSN=https://...@sentry.io/...
  NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
  SENTRY_ORG=your-org
  SENTRY_PROJECT=postrail
  ```
- [ ] Update `next.config.js` to enable Sentry (already configured)
- [ ] Configure alert thresholds:
  - Error rate > 1% of requests
  - Circuit breaker opens
  - Rate limit failures
- [ ] Test with forced error in production
- [ ] Set up Slack notifications

**Files:**

- Production environment variables (Vercel dashboard)
- `/Users/brettstark/Projects/postrail/next.config.js` (verify config)
- Sentry dashboard (alerts)

**Success Criteria:**

- All production errors logged to Sentry
- Team notified of critical errors
- Source maps uploaded for stack traces
- First error captured within 24 hours of deployment

---

## P2: Medium Priority - Backlog (32 hours total)

### TD-9: E2E Test Suite (16 hours)

**Status:** 🔴 Not Started  
**Impact:** Risk of regressions in critical flows

**Flows to Test:**

1. Sign up → Generate posts → Schedule → Publish
2. Trial limit enforcement (3/day, 10 total)
3. Upgrade flow (trial → standard)
4. OAuth connection (LinkedIn, Twitter)
5. Post regeneration (failed posts)

**Tools:**

- Playwright (already configured)
- Visual regression testing (Percy or Chromatic)

---

### TD-10: CDN for Static Assets (auto on Vercel)

**Status:** ✅ Handled by Vercel  
**Impact:** Minimal (Vercel automatically caches static assets)

No action needed - Vercel Edge Network handles this automatically.

---

### TD-11: Database Query Optimization (8 hours)

**Status:** 🔴 Not Started  
**Impact:** Potential performance gains (measure first)

**Tasks:**

- [ ] Enable query logging in Supabase
- [ ] Identify slow queries (> 100ms)
- [ ] Add indexes:
  - `generation_events(user_id, created_at)` - for daily/hourly queries
  - `social_posts(newsletter_id, status)` - for dashboard
  - `platform_connections(user_id, is_active)` - for platform checks
- [ ] Measure before/after performance
- [ ] Document query patterns

**Success Criteria:**

- All queries < 100ms (p95)
- Dashboard loads < 2s
- No N+1 query issues

---

### TD-12: OpenTelemetry Tracing (8 hours)

**Status:** 🔴 Not Started  
**Impact:** Better production debugging, performance insights

**Tasks:**

- [ ] Set up Honeycomb or Jaeger
- [ ] Add tracing to API routes
- [ ] Add custom spans for:
  - AI generation (per platform)
  - Database queries
  - OAuth flows
- [ ] Create dashboards for:
  - Request latency (p50, p95, p99)
  - Error rates by endpoint
  - AI API costs

**Success Criteria:**

- End-to-end request tracing
- Identify slow operations
- Cost attribution per user/tier

---

## Summary

**Total Effort:**

- P0 (Critical): 12 hours
- P1 (High): 16 hours
- P2 (Medium): 32 hours
- **Total: 60 hours (~2 weeks for 1 developer)**

**Recommended Sprint Plan:**

1. **Week 1:** TD-1, TD-2, TD-3 (fix tests + security)
2. **Week 2:** TD-4, TD-5, TD-7, TD-8 (UX + monitoring)
3. **Week 3-4:** TD-6, TD-9 (test infrastructure + E2E)
4. **Backlog:** TD-11, TD-12 (performance + observability)

**Next Steps:**

1. Assign owners to P0 tasks
2. Create GitHub issues with links to this document
3. Schedule daily standup for P0 items
4. Review progress after Week 1
