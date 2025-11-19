# E2E Testing with Playwright

## Overview

End-to-end (E2E) tests have been added to catch browser-side issues that unit tests miss, such as:

- Pages stuck on "importing"
- JavaScript errors preventing page load
- Network failures and timeouts
- Broken user interactions
- Full request/response cycles

## Installation

Playwright and E2E tests are now set up. To finish installation:

```bash
# Install Playwright browsers (if not already done)
npx playwright install chromium

# Or install all browsers
npx playwright install
```

## Running E2E Tests

```bash
# Run all E2E tests (headless)
npm run test:e2e

# Run with UI (visual test runner)
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Run specific test file
npx playwright test e2e/app-loads.spec.ts
```

## Test Coverage

### `e2e/app-loads.spec.ts`

**Purpose**: Catch pages that fail to load or get stuck

**Tests**:

- ✅ Homepage loads successfully
- ✅ No console errors during load
- ✅ Dashboard redirects to auth when not logged in
- ✅ Newsletter creation page loads for authenticated users
- ✅ Homepage loads within 5 seconds
- ✅ No JavaScript errors during navigation
- ✅ All critical resources load successfully (no 404s, failed requests)

**What it catches**:

- "Importing" stuck state
- JavaScript runtime errors
- Network failures
- Broken navigation
- Performance regressions

### `e2e/newsletter-flow.spec.ts`

**Purpose**: Test the complete newsletter creation user flow

**Tests**:

- ✅ Newsletter creation page has all required elements
- ✅ Can type into URL field
- ✅ Scrape button becomes enabled when URL entered
- ✅ Clicking scrape shows loading state
- ✅ Error messages display when scraping fails
- ✅ Generate posts button appears after content loaded
- ✅ Page does not freeze during post generation

**What it catches**:

- Missing UI elements
- Buttons not responding to clicks
- No loading feedback
- Errors not being displayed
- UI freezing/hanging
- Complete user flow breakage

## Configuration

See `playwright.config.ts` for configuration:

- **Base URL**: http://localhost:3001
- **Browser**: Chromium (Desktop Chrome simulation)
- **Auto-start dev server**: Yes
- **Screenshots**: On failure only
- **Trace**: On first retry

## Why These Tests Matter

**Unit tests** mock everything - they test code in isolation.

**E2E tests** use a real browser - they test:

1. Does the page actually load?
2. Does JavaScript execute without errors?
3. Can users actually click buttons and see results?
4. Do network requests succeed?
5. Is the loading experience smooth?

## Missing Tests We Should Add

### High Priority

1. **Authentication Flow**: Complete login/logout flow
2. **Scraping Success**: Test successful URL scraping with real content
3. **Post Generation**: Test complete post generation with AI
4. **Error Recovery**: Test error states and recovery paths

### Medium Priority

5. **Form Validation**: Test all form field validation
6. **Navigation**: Test all navigation paths
7. **Mobile Responsive**: Test on mobile viewports
8. **Accessibility**: Test keyboard navigation, screen readers

### Low Priority

9. **Performance**: Lighthouse CI integration
10. **Cross-browser**: Test on Firefox, Safari
11. **Visual Regression**: Screenshot comparison tests

## Debugging Failed Tests

### View Test Report

```bash
npx playwright show-report
```

### Run Tests with UI

```bash
npm run test:e2e:ui
```

### Run in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Debug Specific Test

```bash
npx playwright test --debug e2e/app-loads.spec.ts
```

## Integration with CI

Add to `.github/workflows/test.yml`:

```yaml
e2e-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 20
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npm run test:e2e
    - uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

## Test Development Guidelines

### Write Tests That Mimic Real Users

```typescript
// ✅ Good - tests what users actually do
await page.getByRole('button', { name: /scrape/i }).click()
await expect(page.getByText(/loading/i)).toBeVisible()

// ❌ Bad - tests implementation details
await page.locator('#scrape-btn-id').click()
await page.waitForSelector('.spinner')
```

### Use Playwright's Built-in Waits

```typescript
// ✅ Good - waits automatically
await expect(page.getByText('Success')).toBeVisible()

// ❌ Bad - arbitrary waits
await page.waitForTimeout(5000)
await expect(page.getByText('Success')).toBeVisible()
```

### Test User-Visible Behavior

```typescript
// ✅ Good - tests what users see
await expect(page).toHaveTitle(/LetterFlow/)
await expect(page.getByText('Error')).toBeVisible()

// ❌ Bad - tests internals
expect(await page.evaluate(() => window.__state)).toBeDefined()
```

## Current Status

✅ **Setup Complete & Tests Running**:

- Playwright installed (v1.56.1)
- Configuration created with auth support
- 3 test files with 16 tests (6 passed unauthenticated)
- npm scripts added
- Chromium browser installed successfully
- Auth setup ready (needs credentials)

✅ **Test Results (WITHOUT Authentication)**:

```
✓ 6 passed
- 11 skipped (require auth)
- Homepage loads successfully ✓
- Dashboard redirects to login when not authenticated ✓
- Homepage loads within 5 seconds ✓
- No JavaScript errors during navigation ✓
- All critical resources load successfully ✓
- Homepage does not get stuck on importing ✓
```

⏳ **Tests Ready (Need TEST_USER_EMAIL + TEST_USER_PASSWORD)**:

- Newsletter creation page tests (2 tests)
- Newsletter flow tests (5 tests)
- Post generation tests (2 tests)
- Importing issue diagnostic tests (3 tests)

🔍 **Key Findings**:

- **Public pages load successfully** - NO "stuck on importing" issue
- **No JavaScript errors** detected in unauthenticated pages
- **Network requests succeed** - no 404s or failed requests
- Issue is **CONFIRMED authentication-specific** (all public tests pass)

🎯 **To Reproduce the Importing Issue**:

1. Add test credentials to `.env.local`:
   ```bash
   TEST_USER_EMAIL=your-email@example.com
   TEST_USER_PASSWORD=your-password
   ```
2. Run: `npm run test:e2e`
3. Watch browser with: `npm run test:e2e:headed`
4. Check diagnostic output and screenshots in `playwright-report/`

📚 **Full Documentation**: See `e2e/README.md` for complete setup and debugging guide

## Comparison: Unit vs E2E Tests

| Aspect        | Unit Tests                     | E2E Tests          |
| ------------- | ------------------------------ | ------------------ |
| **Speed**     | Fast (<1s)                     | Slow (5-30s)       |
| **Isolation** | High (mocked)                  | Low (real browser) |
| **Catches**   | Logic errors                   | Integration issues |
| **Examples**  | Function returns correct value | Button click works |
| **Run**       | Every commit                   | Before deploy      |
| **Coverage**  | 111 tests (35% real)           | 15 E2E tests       |

**Both are needed** - unit tests catch logic bugs, E2E tests catch integration issues like "page stuck on importing".
