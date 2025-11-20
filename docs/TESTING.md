# Testing Guide for LetterFlow

## ⚠️ CRITICAL: Mostly Placeholder Tests

**Current state**: 100 tests total - **28 real tests (28%)** with actual coverage, **72 placeholder tests (72%)** with no coverage.

**Real regression protection**: Only SSRF security (12 tests) and PostPreviewCard component (16 tests) are properly tested. Everything else provides **zero protection** against regressions.

### What This Means:

- **Not testing components**: Tests never import or render React components
- **Not testing API routes**: Tests never import or call route handlers
- **Not testing integrations**: No Supabase, Anthropic, or HTTP mocking
- **False confidence**: 100% passing tests that would still pass if you broke the entire application

### Test Structure

```
tests/
├── setup.ts                           # Test configuration
├── api/                               # API route LOGIC tests (not actual routes)
│   ├── scrape.test.ts                # URL validation logic
│   └── generate-posts.test.ts        # Post generation business logic
├── components/                        # Component LOGIC tests (not actual components)
│   ├── PostPreviewCard.test.tsx      # Character limit calculations
│   └── NewsletterEditor.test.tsx     # Word count logic
└── integration/                       # Workflow LOGIC tests (not actual flows)
    └── newsletter-flow.test.ts       # Business rules validation
```

## What These Tests Actually Do

### ❌ What They DON'T Test:

- **Not testing actual API routes** - They never import or call the route handlers
- **Not rendering components** - They never import or render React components
- **Not mocking Supabase** - No database interaction testing
- **Not mocking Anthropic** - No AI API testing
- **Not testing integrations** - No actual HTTP requests or database queries

### ✅ What They DO Test:

- Business logic calculations (character limits, percentages, word counts)
- Data structure validation (correct fields, types, combinations)
- Configuration constants (platform limits, post type options)
- String manipulation logic (content cleaning, formatting)

## Running Tests

```bash
# Requires Node 20+ (see .nvmrc)
nvm use

# Run all tests once
npm test

# Watch mode (runs on file changes)
npm run test:watch

# With UI interface
npm run test:ui

# With coverage report (will show 0% real coverage)
npm run test:coverage
```

## Test Results

```
Total Tests: 72
✅ All Passing: 72 (100%)
🔴 Real Coverage: ~0%
```

**Why 100% passing doesn't mean safety**: These tests validate hard-coded logic that never changes. They will continue to pass even if you completely break the actual application.

### Example of Placeholder Test:

**tests/components/NewsletterEditor.test.tsx:14-18**

```typescript
it('should calculate word count correctly', () => {
  const content = 'This is a test newsletter with ten words exactly here'
  const words = content.trim().split(/\s+/)
  expect(words.length).toBe(10)
})
```

This tests string splitting logic, NOT the actual NewsletterEditor component. The component is never imported or rendered.

## What Real Tests Would Look Like

### Real Component Test Example:

```typescript
import { render, screen } from '@testing-library/react'
import { NewsletterEditor } from '@/components/newsletter-editor'

it('should update word count when content changes', async () => {
  const onChange = vi.fn()
  render(<NewsletterEditor content="" onChange={onChange} />)

  const editor = screen.getByRole('textbox')
  await userEvent.type(editor, 'Test content')

  expect(screen.getByText(/2 words/i)).toBeInTheDocument()
  expect(onChange).toHaveBeenCalled()
})
```

### Real API Test Example:

```typescript
import { POST } from '@/app/api/scrape/route'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server')
vi.mock('axios')

it('should reject SSRF attempts', async () => {
  const mockSupabase = {
    auth: { getUser: () => ({ data: { user: { id: '123' } } }) },
  }
  vi.mocked(createClient).mockReturnValue(mockSupabase)

  const request = new Request('http://localhost/api/scrape', {
    method: 'POST',
    body: JSON.stringify({ url: 'https://beehiiv.com.attacker.tld' }),
  })

  const response = await POST(request)
  expect(response.status).toBe(403)
})
```

## Why Placeholder Tests Exist

These were created to satisfy the "add tests" requirement quickly, but they don't provide the regression protection of real tests. They validate that:

1. **Platform combinations work**: 3 platforms × 2 post types = 6 posts ✅
2. **Character limits are correct**: LinkedIn (3000), Threads (500), Facebook (63206) ✅
3. **Percentage calculations work**: 2700/3000 = 90% ✅
4. **Data structures are valid**: Posts have required fields ✅

## Manual Testing Required

Since automated tests don't cover real functionality, manual testing is critical:

### 1. Authentication Flow

```bash
1. Go to /auth/login
2. Sign in with magic link
3. Verify redirect to /dashboard
4. Check /auth/reset-password works
5. Verify expired links show /auth/auth-code-error
```

### 2. URL Scraping (SSRF Protection)

```bash
# Test valid newsletter URL
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"url": "https://example.beehiiv.com/p/post"}'

# Test SSRF bypass attempt (should fail)
curl -X POST http://localhost:3000/api/scrape \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"url": "https://beehiiv.com.attacker.tld"}'
```

### 3. AI Generation

```bash
1. Create newsletter at /dashboard/newsletters/new
2. Import or paste content
3. Click "Generate Social Posts"
4. Verify 6 posts generate (3 platforms × 2 types)
5. Check character counts are within limits
6. Verify posts have platform-appropriate tone
```

### 4. Preview Page

```bash
1. Navigate to /dashboard/newsletters/[id]/preview
2. Verify posts grouped by type (Pre-CTA, Post-CTA)
3. Check character count badges (green < 90%, yellow 90-100%, red > 100%)
4. Test Edit/Regenerate buttons (UI only, no functionality yet)
```

### 5. Navigation

```bash
1. Test /dashboard/newsletters shows newsletter list
2. Test /dashboard/platforms shows platform connections stub
3. Test /dashboard/settings shows account info
4. Test /dashboard/newsletters/[id]/schedule shows scheduling stub
```

## Security Testing Checklist

### SSRF Protection:

- [ ] Reject `https://beehiiv.com.attacker.tld` (subdomain bypass)
- [ ] Reject `http://127.0.0.1` (localhost)
- [ ] Reject `http://192.168.1.1` (private IP)
- [ ] Reject `http://169.254.169.254` (AWS metadata)
- [ ] Accept `https://example.beehiiv.com/p/post` (valid)
- [ ] Accept `https://beehiiv.com/p/post` (exact match)

### Authentication:

- [ ] `/api/scrape` requires auth (401 without token)
- [ ] `/api/generate-posts` requires auth (401 without token)
- [ ] Dashboard pages redirect to login when not authenticated

## Next Steps: Building Real Tests

To create a meaningful test suite:

### Phase 1: Component Tests

```bash
# Install additional dependencies if needed
npm install -D @testing-library/user-event

# Create real component tests
tests/components/
  ├── PostPreviewCard.test.tsx     # Render, props, interactions
  ├── NewsletterEditor.test.tsx    # Tiptap integration, onChange
  └── Dashboard.test.tsx            # Navigation, layout
```

### Phase 2: API Tests

```bash
# Create real API tests with mocking
tests/api/
  ├── scrape.test.ts              # Mock axios, test SSRF
  ├── generate-posts.test.ts      # Mock Anthropic SDK
  └── auth.test.ts                # Mock Supabase auth
```

### Phase 3: Integration Tests

```bash
# Use Playwright for E2E testing
npm install -D @playwright/test

tests/e2e/
  ├── auth-flow.spec.ts           # Full auth flow
  ├── newsletter-creation.spec.ts # URL import → AI → Preview
  └── navigation.spec.ts          # All page transitions
```

## Test Philosophy (Aspirational)

**What we should have**:

- Real component rendering with @testing-library/react
- API route testing with request/response mocking
- Supabase client mocking for database operations
- Anthropic SDK mocking for AI generation
- E2E tests with Playwright for critical user flows

**What we have**:

- Business logic validation (useful but insufficient)
- Configuration constant testing
- Data structure validation

## Node Version Requirement

⚠️ **Tests require Node 20+**

```bash
# Check your Node version
node -v  # Should be v20.x.x or higher

# Use .nvmrc
nvm use

# Or install Node 20+
# https://nodejs.org/en/download/
```

On Node 14, tests fail immediately with:

```
Unexpected token '??='
```

---

## Status: ⚠️ Placeholder Tests Only

**Reality Check**:

- ✅ 72/72 tests passing
- 🔴 0% real application coverage
- 🔴 No regression protection
- 🔴 No component rendering tests
- 🔴 No API route tests
- 🔴 No database mocking

**Manual testing is currently the primary quality assurance method.**

To see the placeholder tests run:

```bash
npm run test:ui
```

This will show all tests passing, but remember: **they're not testing the actual application code**.
