# E2E Testing with Authentication

## Quick Start

### 1. Run Tests WITHOUT Authentication (Public Pages Only)

```bash
npm run test:e2e
```

This will test:

- ✅ Homepage loading
- ✅ Auth redirects
- ✅ Public page performance
- ⏭️ Skip all authenticated tests

### 2. Run Tests WITH Authentication (Full Coverage)

**Step 1: Add credentials to `.env.local`:**

```bash
# E2E Test Credentials
TEST_USER_EMAIL=your-email@example.com
TEST_USER_PASSWORD=your-password
```

**Step 2: Run tests:**

```bash
npm run test:e2e
```

This will test:

- ✅ All public pages
- ✅ Newsletter creation flow
- ✅ Scraping functionality
- ✅ Post generation
- ✅ Full authenticated user journey

## Investigating the "Stuck on Importing" Issue

We've created specific diagnostic tests in `importing-issue.spec.ts`:

```bash
# Run importing issue tests in headed mode (watch the browser)
npx playwright test importing-issue.spec.ts --headed

# Run with debugging
npx playwright test importing-issue.spec.ts --debug
```

These tests will:

1. Monitor for "importing" text appearing on pages
2. Track page load states (domcontentloaded, load, networkidle)
3. Capture console errors and failed network requests
4. Take screenshots if pages get stuck
5. Log detailed diagnostic information

**Test Output Locations:**

- Screenshots: `playwright-report/stuck-importing-*.png`
- Full report: `npx playwright show-report`
- Console output: Real-time in terminal

## Test Files

### `app-loads.spec.ts`

Basic page loading and navigation tests (no auth required)

### `newsletter-flow.spec.ts`

Full newsletter creation workflow (requires auth)

### `importing-issue.spec.ts`

Diagnostic tests specifically for the "stuck on importing" problem:

- Monitors page load states
- Captures stuck states with screenshots
- Logs console errors and failed requests
- Tests scraping flow with real URLs

### `auth.setup.ts`

Authentication setup that runs before authenticated tests

## Authentication Flow

1. `auth.setup.ts` runs first (if credentials provided)
2. Logs in with TEST_USER_EMAIL/TEST_USER_PASSWORD
3. Saves session to `playwright/.auth/user.json`
4. Authenticated tests reuse this session (no re-login)

## Debugging Tips

### View Test Report

```bash
npx playwright show-report
```

### Run Tests in UI Mode (Interactive)

```bash
npm run test:e2e:ui
```

### Run Tests in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Debug Specific Test

```bash
npx playwright test --debug importing-issue.spec.ts
```

### Run Only Authenticated Tests

```bash
npx playwright test --project=chromium-authenticated
```

## Current Status

**Working Tests (No Auth Required):**

- ✅ Homepage loads successfully
- ✅ Dashboard redirects to login when not authenticated
- ✅ Homepage loads within 5 seconds
- ✅ No JavaScript errors during navigation
- ✅ All critical resources load successfully

**Pending Tests (Require Auth Credentials):**

- ⏭️ Newsletter creation page tests
- ⏭️ Newsletter flow tests (scraping, post generation)
- ⏭️ Importing issue diagnostic tests

**Key Finding:**
Public pages load successfully with NO importing issues in E2E tests. This suggests the "stuck on importing" problem is:

1. **Authentication-specific** - Only happens on protected routes
2. **Data-dependent** - Only with certain newsletter URLs
3. **Environment-specific** - Browser cache, session, or cookies

## Next Steps

1. **Add test credentials** to `.env.local` (see Quick Start #2)
2. **Run authenticated tests** to reproduce the importing issue
3. **Check screenshots** in `playwright-report/` if tests fail
4. **Review console output** for diagnostic information
5. **Fix identified issues** based on test results

## Security Note

**NEVER commit credentials!**

- `.env.local` is gitignored
- `playwright/.auth/*.json` is gitignored
- Test reports are gitignored

Use a dedicated test account, not your production account.
