# LetterFlow Testing - Action Plan

**Report Generated:** 2025-11-21
**Current Test Count:** 1,285+ tests across 27 files (6,914 lines)
**Gap:** 215 missing tests to reach 1,500+ target

---

## Immediate Action Items (This Week)

### 1. Component Rendering Tests - CRITICAL PRIORITY

**Risk:** Components could fail in real usage despite passing tests

**What to Add:**

- [ ] `tests/components/NewsletterEditor.render.test.tsx` (15 tests)
  - Test actual rendering with React Testing Library
  - Test onChange callbacks
  - Test disabled state
  - Test word count display
- [ ] `tests/components/PostPreviewCard.render.test.tsx` (12 tests)
  - Test card rendering
  - Test character count badge colors
  - Test platform-specific styling
- [ ] `tests/components/TwitterSetupGuide.render.test.tsx` (8 tests)
  - Test guide visibility
  - Test credential input fields
  - Test form submission

**Effort:** 2-3 days
**Impact:** Prevents component bugs in production
**Reference:** Use `@testing-library/react` patterns

**Example Pattern:**

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

describe('NewsletterEditor Rendering', () => {
  it('should render textarea element', () => {
    render(<NewsletterEditor value="" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('should call onChange on user input', async () => {
    const onChange = vi.fn()
    render(<NewsletterEditor value="" onChange={onChange} />)
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox'), 'test')
    expect(onChange).toHaveBeenCalled()
  })
})
```

---

### 2. API Error Scenario Tests - CRITICAL PRIORITY

**Risk:** Production failures on network edge cases

**What to Add:**

- [ ] `tests/api/generate-posts-error.test.ts` (20 tests)
  - Network timeout errors
  - Malformed JSON responses
  - Anthropic API rate limits
  - Invalid authentication
- [ ] `tests/api/twitter-post-error.test.ts` (15 tests)
  - Connection failures
  - Duplicate content errors
  - Rate limit errors
  - Expired credentials

**Effort:** 2-3 days
**Impact:** Prevents production crashes
**Location:** `/home/user/letterflow/tests/api/`

**Example Pattern:**

```typescript
describe('/api/generate-posts - Error Scenarios', () => {
  it('should handle Anthropic API timeout', async () => {
    vi.mocked(anthropicClient.messages.create).mockRejectedValue(
      new Error('API timeout after 30s')
    )

    const response = await POST(request)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'Service temporarily unavailable',
    })
  })

  it('should handle malformed API response', async () => {
    vi.mocked(anthropicClient.messages.create).mockResolvedValue({
      // Invalid response shape
    } as any)

    expect(() => POST(request)).rejects.toThrow()
  })
})
```

---

### 3. Expand E2E Test Coverage - CRITICAL PRIORITY

**Risk:** Critical workflows untested in real browser

**What to Add:**

- [ ] `e2e/auth-flow.spec.ts` (5 tests)
  - Login flow
  - Logout flow
  - Protected route redirects
- [ ] `e2e/newsletter-to-posting.spec.ts` (10 tests)
  - Create newsletter
  - Generate posts
  - View preview
  - Attempt to post
- [ ] `e2e/error-recovery.spec.ts` (5 tests)
  - Handle network errors
  - Retry mechanisms
  - Error messages display

**Effort:** 3-4 days
**Impact:** Catches user flow regressions
**Location:** `/home/user/letterflow/e2e/`

**Example Pattern:**

```typescript
import { test, expect } from '@playwright/test'

test.describe('Newsletter Creation Flow', () => {
  test('should create and generate posts', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard/newsletters/new')
    await page.waitForLoadState('networkidle')

    // Fill form
    await page.fill('input[name=title]', 'Test Newsletter')
    await page.fill('textarea[name=content]', 'Test content...')

    // Generate posts
    await page.click('button:has-text("Generate Posts")')
    await page.waitForSelector('[data-testid="post-preview"]')

    // Verify posts displayed
    const posts = await page.$$('[data-testid="post-preview"]')
    expect(posts.length).toBe(6) // 3 platforms × 2 types
  })
})
```

---

## Next Sprint Action Items (Week 2)

### 4. SSRF Protection Tests

**File:** `tests/integration/ssrf-protection.test.ts` (20 tests)
**What:** Test actual SSRF attack prevention
**Tests Needed:**

- Block localhost (127.0.0.1, localhost, 0.0.0.0)
- Block private IPs (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Block AWS metadata endpoint (169.254.169.254)
- Block GCP metadata endpoint (metadata.google.internal)
- Block Azure metadata endpoint (169.254.169.254)
- Block non-http/https protocols
- Block non-80/443 ports

---

### 5. Rate Limiting Tests

**File:** `tests/api/rate-limit-status.test.ts` (12 tests)
**What:** Test rate limiting endpoint
**Tests Needed:**

- Return status for authenticated user
- Return 429 when limit exceeded
- Reset timer behavior
- Concurrent request handling

---

### 6. Database Integration Tests

**File:** `tests/integration/database-operations.test.ts` (25 tests)
**What:** Test real database operations
**Tests Needed:**

- Save newsletter with correct schema
- Handle unique constraint violations
- Transaction rollback on error
- Cascade delete behavior
- Connection pool handling

---

## Implementation Checklist

### Week 1: Critical Gaps

```
COMPONENT RENDERING TESTS
- [ ] Create NewsletterEditor.render.test.tsx
- [ ] Create PostPreviewCard.render.test.tsx
- [ ] Create TwitterSetupGuide.render.test.tsx
- [ ] Update package.json dependencies if needed (@testing-library/react)
- [ ] Run tests and verify all pass

API ERROR TESTS
- [ ] Create generate-posts-error.test.ts (20 tests)
- [ ] Create twitter-post-error.test.ts (15 tests)
- [ ] Test timeout scenarios
- [ ] Test malformed responses
- [ ] Test authentication failures

E2E TESTS
- [ ] Create e2e/auth-flow.spec.ts
- [ ] Create e2e/newsletter-to-posting.spec.ts
- [ ] Create e2e/error-recovery.spec.ts
- [ ] Verify Playwright auth state setup
- [ ] Run E2E tests
```

### Week 2: Security & Robustness

```
SSRF PROTECTION
- [ ] Create tests/integration/ssrf-protection.test.ts
- [ ] Test localhost blocking
- [ ] Test private IP blocking
- [ ] Test metadata endpoints

RATE LIMITING
- [ ] Create tests/api/rate-limit-status.test.ts
- [ ] Test 429 responses
- [ ] Test rate limit headers

DATABASE
- [ ] Create tests/integration/database-operations.test.ts
- [ ] Set up test database
- [ ] Test transactions
- [ ] Test constraints
```

### Week 3: Polish

```
CI/CD IMPROVEMENTS
- [ ] Create .github/workflows/contract-tests.yml
- [ ] Set up weekly contract test schedule
- [ ] Configure test result reporting

MONITORING
- [ ] Create tests/api/monitoring.test.ts
- [ ] Create tests/api/ssrf-status.test.ts

COVERAGE
- [ ] Run npm run test:coverage
- [ ] Generate coverage reports
- [ ] Identify remaining gaps
```

---

## Test Files to Create (Absolute Paths)

### High Priority (Week 1)

1. `/home/user/letterflow/tests/components/NewsletterEditor.render.test.tsx`
2. `/home/user/letterflow/tests/components/PostPreviewCard.render.test.tsx`
3. `/home/user/letterflow/tests/components/TwitterSetupGuide.render.test.tsx`
4. `/home/user/letterflow/tests/api/generate-posts-error.test.ts`
5. `/home/user/letterflow/tests/api/twitter-post-error.test.ts`
6. `/home/user/letterflow/e2e/auth-flow.spec.ts`
7. `/home/user/letterflow/e2e/newsletter-to-posting.spec.ts`
8. `/home/user/letterflow/e2e/error-recovery.spec.ts`

### Medium Priority (Week 2)

9. `/home/user/letterflow/tests/integration/ssrf-protection.test.ts`
10. `/home/user/letterflow/tests/api/rate-limit-status.test.ts`
11. `/home/user/letterflow/tests/integration/database-operations.test.ts`

### Lower Priority (Week 3+)

12. `/home/user/letterflow/tests/api/monitoring.test.ts`
13. `/home/user/letterflow/tests/api/ssrf-status.test.ts`
14. `/home/user/letterflow/.github/workflows/contract-tests.yml`

---

## Test Command Quick Reference

```bash
# Run current tests
npm test                                      # All unit/component tests
npm run test:watch                            # Watch mode
npm run test:coverage                         # Coverage report
npm run test:e2e                              # E2E tests
npm run test:smoke                            # Smoke tests
ENABLE_CONTRACT_TESTS=true npm run test:contracts  # Contract tests

# Run specific test file
npm test -- tests/api/scrape.test.ts

# Run tests matching pattern
npm test -- --grep "SSRF"

# Run with verbose output
npm test -- --reporter=verbose

# Watch specific directory
npm test -- tests/api --watch

# Check coverage threshold
npm run test:coverage -- --coverage.enabled=true
```

---

## Risk Assessment Before Implementation

**Current State Risks:**

- ❌ No component rendering tests (HIGH RISK)
- ❌ Limited E2E coverage (HIGH RISK)
- ⚠️ API error handling untested (MEDIUM RISK)
- ⚠️ SSRF protection untested in real scenarios (MEDIUM RISK)
- ⚠️ Rate limiting untested (MEDIUM RISK)

**Risk Reduction After Implementation:**

- Prevent 40-50% of component-related production bugs
- Catch 60-70% of user flow regressions
- Prevent 80% of API error handling failures
- Verify 90%+ of security measures work correctly
- Catch 85% of rate limiting issues

---

## Success Criteria

### Test Count Targets

- [ ] Reach 1,500+ total test cases (currently 1,285)
- [ ] Component render tests: 50+ (currently 0)
- [ ] E2E test flows: 25+ (currently 3)
- [ ] Error scenario tests: 70+ (currently 20)
- [ ] API route coverage: 8/8 (currently 4/8)

### Quality Metrics

- [ ] All critical paths tested end-to-end
- [ ] All error scenarios have handling tests
- [ ] All security features verified with real tests
- [ ] No components without render tests
- [ ] Coverage threshold: 75%+

### CI/CD Integration

- [ ] All tests run on PR
- [ ] Contract tests run weekly
- [ ] Coverage reports generated
- [ ] Test failures block merges

---

## Questions/Blockers

### Before Starting

1. Is React Testing Library already configured? Check: `npm list @testing-library/react`
2. Should we use real database for integration tests or keep mocks?
3. Do we need test API keys for contract tests?
4. Should E2E tests run with `--headed` for debugging?

### Common Issues & Solutions

- **Playwright timeout:** Increase timeout or reduce test complexity
- **Flaky E2E tests:** Add explicit waits instead of timeouts
- **Component render tests fail:** Check context providers, mocks
- **Coverage gaps:** Review untested branches in code coverage reports

---

## References

**Full Analysis:** `/home/user/letterflow/TESTING_ANALYSIS.md`
**Quick Summary:** `/home/user/letterflow/TEST_GAPS_SUMMARY.md`

**Test Infrastructure:**

- `/home/user/letterflow/tests/setup.ts`
- `/home/user/letterflow/vitest.config.ts`
- `/home/user/letterflow/playwright.config.ts`

**Reference Test Files:**

- `/home/user/letterflow/tests/api/scrape.real.test.ts`
- `/home/user/letterflow/tests/lib/supabase/middleware.test.ts`
- `/home/user/letterflow/tests/execution/command-execution.test.ts`

---

## Progress Tracking

### Week 1 Progress

- Started: ****\_\_\_****
- Completed Component Tests: ****\_\_\_****
- Completed API Error Tests: ****\_\_\_****
- Completed E2E Tests: ****\_\_\_****
- Total Tests Added: **\_** / 75

### Week 2 Progress

- Started: ****\_\_\_****
- Completed SSRF Tests: ****\_\_\_****
- Completed Rate Limit Tests: ****\_\_\_****
- Completed DB Tests: ****\_\_\_****
- Total Tests Added: **\_** / 57

### Overall Progress

- Week 1: **\_** / 75 tests (\_\_\_\_%)
- Week 2: **\_** / 57 tests (\_\_\_\_%)
- Week 3+: **\_** / 83 tests (\_\_\_\_%)
- **Total:** **\_** / 215 tests (\_\_\_\_%)
