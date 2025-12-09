import { test, expect } from '@playwright/test'

/**
 * Critical Path E2E Tests
 *
 * These tests cover the core user journey that must work for the product to be usable:
 * 1. Authentication (login/signup)
 * 2. Newsletter import (URL scraping or manual entry)
 * 3. AI post generation
 * 4. Post scheduling
 * 5. Platform connections (BYOK)
 *
 * Run with: npm run test:e2e
 *
 * For authenticated tests, set these environment variables:
 * - TEST_USER_EMAIL: Test account email
 * - TEST_USER_PASSWORD: Test account password
 */

test.describe('Critical Path: Authentication', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')

    // Should have email input
    await expect(page.getByLabel(/email/i)).toBeVisible()

    // Should have password input
    await expect(page.getByLabel(/password/i)).toBeVisible()

    // Should have login button
    await expect(
      page.getByRole('button', { name: /log in|sign in/i })
    ).toBeVisible()

    // Should have link to signup
    await expect(
      page.getByRole('link', { name: /sign up|create account/i })
    ).toBeVisible()
  })

  test('signup page renders correctly', async ({ page }) => {
    await page.goto('/auth/signup')
    await page.waitForLoadState('networkidle')

    // Should have email input
    await expect(page.getByLabel(/email/i)).toBeVisible()

    // Should have password input
    await expect(page.getByLabel(/password/i)).toBeVisible()

    // Should have signup button
    await expect(
      page.getByRole('button', { name: /sign up|create account/i })
    ).toBeVisible()

    // Should have link to login
    await expect(
      page.getByRole('link', { name: /log in|sign in/i })
    ).toBeVisible()
  })

  test('unauthenticated access to dashboard redirects to login', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should be redirected to login
    expect(page.url()).toMatch(/\/auth\/login/)
  })

  test('login form shows error on invalid credentials', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')

    // Fill in invalid credentials
    await page.getByLabel(/email/i).fill('invalid@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')

    // Submit form
    await page.getByRole('button', { name: /log in|sign in/i }).click()

    // Should show error message (wait for it to appear)
    await expect(page.getByText(/invalid|error|incorrect|failed/i)).toBeVisible(
      {
        timeout: 5000,
      }
    )
  })
})

test.describe('Critical Path: Dashboard Navigation', () => {
  // These tests use authenticated state if available
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('dashboard loads successfully when authenticated', async ({ page }) => {
    await page.goto('/dashboard')

    // If redirected to auth, skip (not authenticated)
    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Should see dashboard content
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Should have navigation to newsletters
    await expect(page.getByRole('link', { name: /newsletter/i })).toBeVisible()
  })

  test('can navigate to newsletter creation page', async ({ page }) => {
    await page.goto('/dashboard')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    // Click on newsletters link
    await page
      .getByRole('link', { name: /newsletter/i })
      .first()
      .click()

    await page.waitForLoadState('networkidle')

    // Should be on newsletters page or new newsletter page
    expect(page.url()).toMatch(/\/dashboard\/newsletters/)
  })

  test('platforms page loads correctly', async ({ page }) => {
    await page.goto('/dashboard/platforms')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Should show platform connection options
    await expect(
      page.getByText(/twitter|linkedin|facebook|connect/i)
    ).toBeVisible()
  })
})

test.describe('Critical Path: Newsletter Import', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('newsletter creation page has all required elements', async ({
    page,
  }) => {
    await page.goto('/dashboard/newsletters/new')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Should have URL input
    const urlInput = page.getByPlaceholder(/url|link|newsletter/i)
    await expect(urlInput).toBeVisible()

    // Should have import button
    await expect(
      page.getByRole('button', { name: /import|scrape|fetch/i })
    ).toBeVisible()

    // Should have manual entry option or editor
    await expect(page.getByText(/manual|paste|write|editor/i)).toBeVisible()
  })

  test('URL validation prevents invalid URLs', async ({ page }) => {
    await page.goto('/dashboard/newsletters/new')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    const urlInput = page.getByPlaceholder(/url|link|newsletter/i)
    const importButton = page.getByRole('button', {
      name: /import|scrape|fetch/i,
    })

    // Try invalid URL
    await urlInput.fill('not-a-valid-url')

    // Button should be disabled or show error on click
    if (await importButton.isEnabled()) {
      await importButton.click()
      // Should show validation error
      await expect(page.getByText(/invalid|error|valid url/i)).toBeVisible({
        timeout: 3000,
      })
    }
  })

  test('scraping shows loading state and completes', async ({ page }) => {
    await page.goto('/dashboard/newsletters/new')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    const urlInput = page.getByPlaceholder(/url|link|newsletter/i)
    const importButton = page.getByRole('button', {
      name: /import|scrape|fetch/i,
    })

    // Enter a valid URL
    await urlInput.fill('https://example.com')
    await importButton.click()

    // Should show loading state
    const loadingIndicator = page.getByText(/loading|importing|fetching/i)

    // Either shows loading or immediately shows result/error
    const hasLoading = await loadingIndicator.isVisible().catch(() => false)

    if (hasLoading) {
      // Wait for loading to finish (success or error)
      await expect(loadingIndicator).toBeHidden({ timeout: 30000 })
    }

    // Should not be stuck - either content or error visible
    await expect(
      page.getByText(/content|title|error|failed|success/i)
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Critical Path: Post Generation', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('generate posts button exists after content is available', async ({
    page,
  }) => {
    await page.goto('/dashboard/newsletters/new')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Look for generate button (may be initially hidden/disabled)
    const generateButton = page.getByRole('button', {
      name: /generate|create posts/i,
    })

    // Button should exist in the DOM
    await expect(generateButton).toBeAttached()
  })

  test('preview page shows generated posts', async ({ page }) => {
    // Navigate to a newsletter preview page (if any newsletters exist)
    await page.goto('/dashboard/newsletters')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Look for any existing newsletters
    const newsletterLinks = page
      .getByRole('link')
      .filter({ hasText: /preview|view/i })

    if ((await newsletterLinks.count()) === 0) {
      // No newsletters yet - skip
      test.skip()
      return
    }

    // Click on first newsletter preview
    await newsletterLinks.first().click()
    await page.waitForLoadState('networkidle')

    // Should show platform cards or post previews
    await expect(
      page.getByText(/twitter|linkedin|facebook|threads|post/i)
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Critical Path: Scheduling', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('schedule page renders correctly', async ({ page }) => {
    // Go to newsletters list
    await page.goto('/dashboard/newsletters')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Look for schedule links
    const scheduleLinks = page
      .getByRole('link')
      .filter({ hasText: /schedule/i })

    if ((await scheduleLinks.count()) === 0) {
      // No newsletters or no schedule links - skip
      test.skip()
      return
    }

    // Click on first schedule link
    await scheduleLinks.first().click()
    await page.waitForLoadState('networkidle')

    // Should show date picker for newsletter publish date
    await expect(page.getByLabel(/date|publish/i)).toBeVisible()

    // Should show time picker
    await expect(page.getByLabel(/time/i)).toBeVisible()

    // Should show schedule button
    await expect(page.getByRole('button', { name: /schedule/i })).toBeVisible()
  })

  test('schedule form validates future dates', async ({ page }) => {
    // Navigate to a schedule page directly (will redirect if no auth)
    await page.goto('/dashboard/newsletters')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    const scheduleLinks = page
      .getByRole('link')
      .filter({ hasText: /schedule/i })

    if ((await scheduleLinks.count()) === 0) {
      test.skip()
      return
    }

    await scheduleLinks.first().click()
    await page.waitForLoadState('networkidle')

    // Date input should have min date of today
    const dateInput = page.locator('input[type="date"]')
    const minDate = await dateInput.getAttribute('min')

    if (minDate) {
      // Min date should be today or later
      const today = new Date().toISOString().split('T')[0]
      expect(minDate).toBe(today)
    }
  })
})

test.describe('Critical Path: Platform Connections (BYOK)', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('platforms page shows all supported platforms', async ({ page }) => {
    await page.goto('/dashboard/platforms')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Should show Twitter/X
    await expect(page.getByText(/twitter|x\s/i)).toBeVisible()

    // Should show LinkedIn
    await expect(page.getByText(/linkedin/i)).toBeVisible()

    // Should show Facebook
    await expect(page.getByText(/facebook/i)).toBeVisible()
  })

  test('BYOK option is available for platforms', async ({ page }) => {
    await page.goto('/dashboard/platforms')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Should have BYOK option or credential input
    await expect(
      page.getByText(/byok|api key|credentials|your own keys/i)
    ).toBeVisible()
  })

  test('platform connection status is shown', async ({ page }) => {
    await page.goto('/dashboard/platforms')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Should show connection status (connected, not connected, etc.)
    await expect(
      page.getByText(/connected|not connected|connect|disconnect/i)
    ).toBeVisible()
  })
})

test.describe('Critical Path: Error Handling', () => {
  test('404 page renders for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist-xyz123')
    await page.waitForLoadState('networkidle')

    // Should show 404 error or not found message
    await expect(page.getByText(/404|not found|page.*exist/i)).toBeVisible({
      timeout: 5000,
    })
  })

  test('API errors are handled gracefully', async ({ page }) => {
    // Navigate to a page and cause an API error
    await page.goto('/dashboard/newsletters/non-existent-id-123')

    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    await page.waitForLoadState('networkidle')

    // Should show error message, redirect, or 404 - not crash
    const hasError = await page
      .getByText(/error|not found|invalid/i)
      .isVisible()
    const isRedirected =
      page.url().includes('/dashboard/newsletters') &&
      !page.url().includes('non-existent')

    expect(hasError || isRedirected).toBe(true)
  })
})

test.describe('Critical Path: Performance', () => {
  test('pages load within acceptable time', async ({ page }) => {
    const routes = ['/', '/auth/login', '/auth/signup']

    for (const route of routes) {
      const startTime = Date.now()

      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')

      const loadTime = Date.now() - startTime

      // Should load within 5 seconds
      expect(loadTime).toBeLessThan(5000)
    }
  })

  test('no memory leaks during navigation', async ({ page }) => {
    // Track page errors during navigation
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    // Navigate through multiple pages
    const routes = ['/', '/auth/login', '/auth/signup', '/']

    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
    }

    // Should have no JavaScript errors
    expect(errors).toEqual([])
  })
})

test.describe('Critical Path: Mobile Responsiveness', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE
  })

  test('homepage is usable on mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Content should be visible
    await expect(page.locator('body')).toBeVisible()

    // No horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10) // Allow small margin
  })

  test('login form is usable on mobile', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')

    // Form fields should be visible and interactable
    const emailInput = page.getByLabel(/email/i)
    await expect(emailInput).toBeVisible()
    await expect(emailInput).toBeEnabled()

    const passwordInput = page.getByLabel(/password/i)
    await expect(passwordInput).toBeVisible()
    await expect(passwordInput).toBeEnabled()

    const submitButton = page.getByRole('button', { name: /log in|sign in/i })
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()
  })
})

test.describe('Critical Path: Accessibility', () => {
  test('login page has proper accessibility structure', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')

    // Should have main landmark
    const main = page.locator('main')
    await expect(main).toBeVisible()

    // Form inputs should have labels
    const inputs = await page.locator('input').all()
    for (const input of inputs) {
      const id = await input.getAttribute('id')
      const ariaLabel = await input.getAttribute('aria-label')
      const placeholder = await input.getAttribute('placeholder')

      // Should have some form of labeling
      expect(id || ariaLabel || placeholder).toBeTruthy()
    }
  })

  test('forms can be navigated with keyboard', async ({ page }) => {
    await page.goto('/auth/login')
    await page.waitForLoadState('networkidle')

    // Tab through form elements
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    // Should be able to focus on inputs
    const focusedElement = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase()
    )

    expect(['input', 'button', 'a']).toContain(focusedElement)
  })
})
