# PostRail Testing Guide

## Overview

PostRail uses a comprehensive multi-layer testing strategy to ensure quality, security, and reliability. The test suite includes unit tests, integration tests, E2E tests, and security-focused tests.

## Test Stack

| Tool                | Purpose                  |
| ------------------- | ------------------------ |
| **Vitest**          | Unit & integration tests |
| **Playwright**      | E2E browser tests        |
| **MSW**             | API mocking              |
| **Testing Library** | React component testing  |

## Running Tests

```bash
# All unit/integration tests
npm test

# Watch mode for development
npm run test:watch

# E2E tests (requires build)
npm run test:e2e

# Security-focused tests
npm run test:security

# Full test suite with coverage
npm run test:all

# Type checking
npm run type-check
```

## Test Structure

```
tests/
├── api/                    # API route tests
│   ├── generate-posts.real.test.ts
│   ├── twitter-connect.real.test.ts
│   ├── facebook-post.test.ts
│   └── rbac-integration.test.ts
├── components/             # React component tests
│   └── NewsletterEditor.real.test.tsx
├── lib/                    # Library/utility tests
│   ├── supabase/          # Supabase client tests
│   ├── rate-limiter.test.ts
│   └── ssrf-protection.test.ts
├── security/               # Security-focused tests
│   ├── race-conditions.test.ts
│   └── twitter-idempotency.test.ts
├── smoke/                  # Deployment smoke tests
│   └── deployment.test.ts
├── e2e/                    # Playwright E2E tests
│   └── critical-path.spec.ts
├── mocks/                  # Shared test mocks
│   ├── supabase.ts
│   └── twitter-api.ts
└── setup.ts               # Global test setup
```

## Test Categories

### Unit Tests

Test individual functions and modules in isolation.

```typescript
// Example: Rate limiter test
describe('RateLimiter', () => {
  it('should enforce per-user limits', async () => {
    const result = await rateLimiter.checkRateLimit('user-123')
    expect(result.allowed).toBe(true)
  })
})
```

### Integration Tests

Test API routes with mocked external dependencies.

```typescript
// Example: API route test
describe('/api/generate-posts', () => {
  it('should generate posts for authenticated users', async () => {
    mockSupabase.auth.getUser.mockResolvedValue(mockUser)
    const response = await POST(request)
    expect(response.status).toBe(200)
  })
})
```

### Security Tests

Verify security controls work under adversarial conditions.

```typescript
// Example: Race condition test
describe('Race Condition Security', () => {
  it('should prevent concurrent rate limit bypass', async () => {
    const promises = Array(50)
      .fill(null)
      .map(() => ssrfProtection.checkRateLimit(userId, clientIP))
    const results = await Promise.all(promises)
    const allowed = results.filter(r => r.allowed).length
    expect(allowed).toBeLessThanOrEqual(5)
  })
})
```

### E2E Tests

Test critical user flows in real browser.

```typescript
// Example: Playwright test
test('newsletter creation flow', async ({ page }) => {
  await page.goto('/dashboard')
  await page.fill('[data-testid="newsletter-title"]', 'Test')
  await page.click('[data-testid="generate-button"]')
  await expect(page.locator('[data-testid="posts-list"]')).toBeVisible()
})
```

### Smoke Tests

Verify deployment configuration is correct.

```typescript
// Example: Config validation
describe('Deployment Config', () => {
  it('should have valid package.json', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    expect(pkg.scripts.build).toBeDefined()
  })
})
```

## Mocking Patterns

### Supabase Mock

```typescript
import {
  createMockSupabaseClient,
  mockSupabaseAuthUser,
} from '../mocks/supabase'

const mockSupabase = createMockSupabaseClient()
mockSupabase.auth.getUser.mockResolvedValue(
  mockSupabaseAuthUser('user-123', 'test@example.com')
)
vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
```

### Twitter API Mock

```typescript
import { createMockTwitterClient } from '../mocks/twitter-api'

mockTwitterClientInstance = createMockTwitterClient()
mockTwitterClientInstance.v2.tweet.mockResolvedValue({
  data: { id: '123', text: 'Posted!' },
})
```

### Environment Variables

```typescript
// Use vi.stubEnv for environment mocking
vi.stubEnv('NODE_ENV', 'production')
vi.stubEnv('NEXT_TRUST_PROXY', 'true')

// Clean up after test
vi.unstubAllEnvs()
```

## Coverage Requirements

| Category   | Target |
| ---------- | ------ |
| Statements | >80%   |
| Branches   | >75%   |
| Functions  | >80%   |
| Lines      | >80%   |

Run coverage report:

```bash
npm run test:coverage
```

## CI/CD Integration

Tests run automatically on:

- Pull request creation/update
- Push to main branch
- Scheduled security audits (weekly)

### GitHub Actions Workflow

```yaml
- name: Run Tests
  run: |
    npm run lint
    npm run type-check
    npm test
    npm run test:e2e
```

## Writing New Tests

### Best Practices

1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Use descriptive names** - Test names should document expected behavior
3. **Isolate tests** - Each test should be independent
4. **Mock external dependencies** - Don't call real APIs in unit tests
5. **Test edge cases** - Include error paths and boundary conditions

### Test File Naming

- Unit tests: `*.test.ts`
- Integration tests: `*.real.test.ts`
- E2E tests: `*.spec.ts`
- Security tests: Place in `tests/security/`

### Security Test Requirements

Security-critical code must have tests for:

- Race conditions under concurrent load
- Input validation edge cases
- Authentication bypass attempts
- Rate limit enforcement
- SSRF protection

## Troubleshooting

### Common Issues

**Tests timeout**: Increase timeout in vitest.config.ts or use `timeout` option

**Mock not working**: Ensure mocks are defined before imports with `vi.mock()`

**Async issues**: Always `await` async operations and use proper assertions

**Environment conflicts**: Use `vi.stubEnv()` instead of direct `process.env` assignment

### Debug Mode

```bash
# Run single test file with verbose output
npm test -- tests/api/generate-posts.real.test.ts --verbose

# Run with debug logs
DEBUG=* npm test
```
