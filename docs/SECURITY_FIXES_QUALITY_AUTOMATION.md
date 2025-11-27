# Security Fixes - Quality Automation Review

**Date**: November 16, 2025
**Context**: Post-quality automation integration security review
**Test Status**: ✅ 111/111 tests passing (100%)

---

## Summary

All critical and important security issues identified by the quality automation review have been fixed:

| Issue                      | Severity       | Status   | Impact                    |
| -------------------------- | -------------- | -------- | ------------------------- |
| OAuth open redirect        | 🔴 Critical    | ✅ Fixed | Prevents phishing attacks |
| Domain allowlist removed   | 🔴 Critical    | ✅ Fixed | Prevents SSRF attacks     |
| Anthropic API key handling | 🟡 Important   | ✅ Fixed | Better error messages     |
| Dynamic route params       | 🟡 Important   | ✅ Fixed | Performance + type safety |
| Disabled API tests         | 🟢 Recommended | ✅ Fixed | Improved test coverage    |

---

## Fix 1: OAuth Callback Open Redirect Vulnerability

**File**: `app/auth/callback/route.ts`

**Problem**: OAuth callback blindly trusted the `next` query parameter, allowing attackers to redirect users to arbitrary domains after login.

**Attack Example**:

```
https://postrail.io/auth/callback?next=//evil.com
→ User logs in successfully
→ Redirected to https://evil.com (phishing site)
```

**Fix Applied**:

1. Created allowlist of safe redirect paths:

```typescript
const ALLOWED_REDIRECTS = [
  '/dashboard',
  '/dashboard/newsletters',
  '/dashboard/newsletters/new',
  '/dashboard/platforms',
  '/dashboard/settings',
]
```

2. Added validation function:

```typescript
function isValidRedirect(path: string): boolean {
  // Must start with / (relative path)
  if (!path.startsWith('/')) return false

  // Prevent protocol-relative URLs (//evil.com)
  if (path.startsWith('//')) return false

  // Must be in allowlist or start with allowed prefix
  return ALLOWED_REDIRECTS.some(
    allowed => path === allowed || path.startsWith(`${allowed}/`)
  )
}
```

3. Applied validation before redirect:

```typescript
const requestedNext = searchParams.get('next') ?? '/dashboard'
const next = isValidRedirect(requestedNext) ? requestedNext : '/dashboard'
```

**Security Level**: 🟢 Secure

- ✅ Only allows relative paths starting with /
- ✅ Blocks protocol-relative URLs (//evil.com)
- ✅ Restricts to known safe paths
- ✅ Falls back to safe default (/dashboard)

---

## Fix 2: Domain Allowlist Enforcement

**File**: `app/api/scrape/route.ts`

**Problem**: Domain allowlist was removed entirely, and `KNOWN_PLATFORMS` constant was unused, allowing any public domain to be scraped.

**Security Risk**: While SSRF protection remains (DNS resolution + private IP blocking), broader attack surface for abuse.

**Fix Applied**:

1. Restored `ALLOWED_DOMAINS` constant:

```typescript
const ALLOWED_DOMAINS = [
  'beehiiv.com',
  'substack.com',
  'ghost.io',
  'convertkit.com',
  'buttondown.email',
  'medium.com',
  'aisecondact.com', // Added for testing
]
```

2. Made enforcement configurable via environment variable:

```typescript
const ALLOWLIST_ENABLED = process.env.SCRAPE_ALLOWLIST_ENABLED !== 'false'
```

3. Added domain suffix checking:

```typescript
if (ALLOWLIST_ENABLED) {
  const isAllowedDomain = ALLOWED_DOMAINS.some(
    domain => hostname === domain || hostname.endsWith(`.${domain}`)
  )

  if (!isAllowedDomain) {
    return {
      allowed: false,
      error: `Domain not in allowlist. Allowed: ${ALLOWED_DOMAINS.join(', ')}`,
    }
  }
}
```

**Configuration Options**:

- **Production** (default): `SCRAPE_ALLOWLIST_ENABLED=true` - Only newsletter platforms allowed
- **Development**: `SCRAPE_ALLOWLIST_ENABLED=false` - Any public domain allowed for testing

**Security Level**: 🟢 Configurable

- ✅ Strict allowlist by default
- ✅ Suffix matching prevents bypass (e.g., evil-beehiiv.com blocked)
- ✅ Can be disabled for development
- ✅ Combined with DNS resolution + private IP blocking

**Tests Updated**:

- Updated `tests/api/scrape-ssrf.test.ts` to expect "not in allowlist" error message
- All 12 SSRF tests passing

---

## Fix 3: Anthropic API Key Validation

**File**: `app/api/generate-posts/route.ts`

**Problem**: Anthropic client constructed at module load with non-null assertion. If `ANTHROPIC_API_KEY` missing, entire route crashes on import instead of returning 500 with clear error message.

**Fix Applied**:

1. Added module-level validation with clear error message:

```typescript
// Validate API key at module load - fail fast with clear error
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('FATAL: ANTHROPIC_API_KEY environment variable is not set')
  console.error('Set it in .env.local: ANTHROPIC_API_KEY=your-key-here')
}
```

2. Made model name configurable:

```typescript
// Configurable model name via environment variable
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'
```

3. Added runtime validation in POST handler:

```typescript
export async function POST(request: NextRequest) {
  try {
    // Runtime validation: fail fast if API key missing
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error: ANTHROPIC_API_KEY not set. Contact administrator.' },
        { status: 500 }
      )
    }
    // ... rest of handler
  }
}
```

4. Updated model usage to use constant:

```typescript
const message = await anthropic.messages.create({
  model: ANTHROPIC_MODEL, // Changed from hardcoded 'claude-sonnet-4-5'
  max_tokens: 1024,
  // ... rest of config
})
```

**Benefits**:

- ✅ Clear error message when API key missing
- ✅ Returns 500 with helpful message instead of crashing
- ✅ Configurable model name for testing/updates
- ✅ Module fails fast with console errors for debugging

---

## Fix 4: Dynamic Route Params Conventions

**Files**:

- `app/dashboard/newsletters/[id]/preview/page.tsx`
- `app/dashboard/newsletters/[id]/schedule/page.tsx`

**Problem**: Treating `params` as `Promise<{id: string}>` when Next.js App Router provides it as plain object `{id: string}`. This defeats static optimization and breaks type inference.

**Fix Applied**:

**Before** (preview/page.tsx):

```typescript
interface PageProps {
  params: Promise<{
    id: string
  }>
}

export default async function PreviewPage({ params }: PageProps) {
  const { id } = await params  // ❌ Incorrect - treats object as promise
```

**After**:

```typescript
interface PageProps {
  params: {
    id: string
  }
}

export default async function PreviewPage({ params }: PageProps) {
  const { id } = params  // ✅ Correct - direct property access
```

**Same fix applied to schedule/page.tsx**:

```typescript
// Before
export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

// After
export default async function SchedulePage({ params }: { params: { id: string } }) {
  const { id } = params
```

**Benefits**:

- ✅ Enables Next.js static optimization
- ✅ Correct TypeScript inference
- ✅ Follows Next.js App Router conventions
- ✅ Better performance (no unnecessary async)

---

## Fix 5: Re-enabled API Tests

**File**: `tests/api/generate-posts.real.test.ts` (was `.disabled`)

**Problem**: Real API tests were disabled due to Anthropic SDK mocking complexity. This left the critical AI generation endpoint untested.

**Fix Applied**:

1. Fixed Anthropic SDK mock hoisting issue:

```typescript
// Before - hoisting error
let mockMessagesCreate: ReturnType<typeof vi.fn>
vi.mock('@anthropic-ai/sdk', () => {
  mockMessagesCreate = vi.fn(() => Promise.resolve(mockResponse))  // ❌ Error
  return { ... }
})

// After - wrapper function to avoid hoisting
const mockMessagesCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: (...args: any[]) => mockMessagesCreate(...args)  // ✅ Works
      }
    }
  }
})
```

2. Set up default mock response in beforeEach:

```typescript
beforeEach(() => {
  vi.clearAllMocks()

  // Set default mock response for Anthropic
  mockMessagesCreate.mockResolvedValue({
    content: [
      {
        type: 'text',
        text: 'This is a professionally crafted LinkedIn post about AI automation. #AI #Automation',
      },
    ],
  })
})
```

3. Updated model name test to be flexible:

```typescript
// Before - hardcoded expectation
expect(mockMessagesCreate).toHaveBeenCalledWith(
  expect.objectContaining({
    model: 'claude-sonnet-4-5', // ❌ Fails with new configurable model
  })
)

// After - flexible pattern matching
expect(mockMessagesCreate).toHaveBeenCalledWith(
  expect.objectContaining({
    model: expect.stringMatching(/claude-sonnet-4/), // ✅ Matches any version
  })
)
```

4. Renamed file to enable tests:

```bash
mv tests/api/generate-posts.real.test.ts.disabled \
   tests/api/generate-posts.real.test.ts
```

**Test Coverage**:

- ✅ 11 real tests for `/api/generate-posts` endpoint
- ✅ Authentication validation
- ✅ Input validation
- ✅ Newsletter creation
- ✅ AI post generation
- ✅ Parallel execution
- ✅ Error handling (rollback, database errors)
- ✅ Response structure validation

---

## Test Results

### Before Fixes

```
Test Files  2 failed | 6 passed (8)
Tests       2 failed | 98 passed (100)
```

### After All Fixes

```
Test Files  8 passed (8)
Tests       111 passed (111)  ✅ 100%
```

**Test Breakdown**:

- `tests/api/generate-posts.real.test.ts`: 11 tests (NEW - was disabled)
- `tests/api/scrape-ssrf.test.ts`: 12 tests (2 fixed - error message)
- `tests/api/scrape.test.ts`: 12 tests
- `tests/api/generate-posts.test.ts`: 12 tests
- `tests/components/PostPreviewCard.real.test.tsx`: 16 tests
- `tests/components/PostPreviewCard.test.tsx`: 12 tests
- `tests/components/NewsletterEditor.test.tsx`: 16 tests
- `tests/integration/newsletter-flow.test.ts`: 20 tests

**Real Test Coverage**: 39 real tests (35%), 72 placeholder tests (65%)

- Real tests increased from 28 to 39 (+11 tests)
- Coverage improved from 28% to 35%

---

## Security Posture

### Critical Protections Now In Place

**Authentication & Authorization**:

- ✅ OAuth callback redirect validation
- ✅ User authentication required for all sensitive endpoints
- ✅ User ownership validation for newsletter access

**SSRF Protection** (Multi-layered):

- ✅ Domain allowlist with suffix matching
- ✅ DNS resolution to IP addresses
- ✅ Private IP range blocking (localhost, 192.168.x.x, 10.x.x.x, AWS metadata)
- ✅ Redirect prevention (`maxRedirects: 0`)
- ✅ Protocol restriction (HTTP/HTTPS only)

**API Security**:

- ✅ Anthropic API key validation (module load + runtime)
- ✅ Clear error messages without exposing sensitive details
- ✅ Configurable model name for flexibility

**Code Quality**:

- ✅ Next.js conventions followed (dynamic routes)
- ✅ TypeScript type safety restored
- ✅ Performance optimizations enabled

---

## Environment Variables

### Required

```bash
ANTHROPIC_API_KEY=sk-ant-...  # Required for AI generation
```

### Optional (with defaults)

```bash
# AI Model Configuration
ANTHROPIC_MODEL=claude-sonnet-4-20250514  # Default model

# Scraping Configuration
SCRAPE_ALLOWLIST_ENABLED=true  # true (production) or false (development)
```

---

## Remaining Work

While all critical security issues are fixed, there are still improvements to make:

1. **Test Coverage**: Increase from 35% to 80%+ real tests
2. **ESLint Issues**: Fix 9 remaining issues (unused variables, unescaped quotes)
3. **Database Migration**: User needs to run scheduled_time nullable migration
4. **Quality Automation**: Verify pre-commit hooks work correctly

---

## Verification Steps

To verify all fixes are working:

```bash
# 1. Run all tests (should pass 111/111)
npm test

# 2. Check build succeeds
npm run build

# 3. Start dev server
npm run dev

# 4. Test OAuth redirect protection
# Try: /auth/callback?next=//evil.com
# Should redirect to: /dashboard (safe default)

# 5. Test SSRF protection
# Try scraping non-allowlisted domain: https://evil.com
# Should return: 403 with "not in allowlist" message

# 6. Test API key validation
# Remove ANTHROPIC_API_KEY from .env.local
# Try generating posts
# Should return: 500 with "Server configuration error" message
```

---

**Security Review Status**: ✅ All critical and important issues resolved
**Production Readiness**: Ready for deployment after database migration
