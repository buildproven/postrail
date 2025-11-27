import { test, expect } from '@playwright/test'

/**
 * E2E Tests: App Loading and Page Navigation
 *
 * These tests catch issues like:
 * - Pages stuck on "importing"
 * - JavaScript errors preventing page load
 * - Network failures
 * - Broken navigation
 */

test.describe('App Loading', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/')

    // Wait for page to be fully loaded (not stuck on "importing")
    await page.waitForLoadState('networkidle')

    // Should see the homepage content
    await expect(page).toHaveTitle(/Postrail|Newsletter/)

    // Should not have any console errors
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    // Verify no critical errors after 2 seconds
    await page.waitForTimeout(2000)
    expect(errors).toEqual([])
  })

  test('dashboard redirects to login when not authenticated', async ({
    page,
  }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Should redirect to login or show auth page
    const url = page.url()
    expect(url).toMatch(/\/(auth|login)/)
  })

  test('newsletter creation page loads for authenticated users', async ({
    page,
  }) => {
    // This test will need to handle auth - skip for now if not logged in
    // In real setup, would use Playwright's auth storage

    await page.goto('/dashboard/newsletters/new')
    await page.waitForLoadState('networkidle')

    const url = page.url()

    if (url.includes('/auth') || url.includes('/login')) {
      // Not authenticated - expected behavior
      test.skip()
    } else {
      // Should see newsletter creation form
      await expect(
        page.getByRole('heading', { name: /new newsletter|create/i })
      ).toBeVisible()
    }
  })
})

test.describe('Page Load Performance', () => {
  test('homepage loads within 5 seconds', async ({ page }) => {
    const startTime = Date.now()

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const loadTime = Date.now() - startTime

    expect(loadTime).toBeLessThan(5000)
  })

  test('no JavaScript errors during navigation', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    // Navigate through key pages
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for errors
    expect(errors).toEqual([])
  })
})

test.describe('Network Requests', () => {
  test('all critical resources load successfully', async ({ page }) => {
    const failedRequests: string[] = []

    page.on('requestfailed', request => {
      failedRequests.push(`${request.method()} ${request.url()}`)
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should have no failed requests
    expect(failedRequests).toEqual([])
  })
})
