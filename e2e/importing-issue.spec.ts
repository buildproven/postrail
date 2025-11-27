import { test, expect } from '@playwright/test'

/**
 * E2E Tests: "Stuck on Importing" Issue Investigation
 *
 * These tests specifically target the issue where pages get stuck
 * showing "importing" with no progress.
 *
 * Tests will run in headed mode to visually observe the behavior.
 */

test.describe('Importing Issue Investigation', () => {
  test('homepage does not get stuck on importing', async ({ page }) => {
    // Track page state changes
    const pageStates: string[] = []

    page.on('domcontentloaded', () => {
      pageStates.push('domcontentloaded')
    })

    page.on('load', () => {
      pageStates.push('load')
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Check if page shows "importing" text
    const importingText = page.getByText(/importing/i)
    const isImporting = await importingText.isVisible().catch(() => false)

    if (isImporting) {
      console.log(
        '⚠️ Page is showing "importing" - waiting to see if it resolves...'
      )

      // Wait up to 10 seconds to see if it resolves
      await page
        .waitForLoadState('networkidle', { timeout: 10000 })
        .catch(async err => {
          // Take screenshot of stuck state
          await page.screenshot({
            path: 'playwright-report/stuck-importing-homepage.png',
            fullPage: true,
          })
          console.log('❌ Page stuck on importing for 10+ seconds')
          throw new Error('Page stuck on importing: ' + (err as Error).message)
        })

      // If we get here, it resolved
      console.log('✅ "Importing" state resolved')
    } else {
      console.log('✅ No "importing" state detected')
    }

    // Verify page loaded successfully
    await expect(page).toHaveTitle(/Postrail|Newsletter/)

    console.log('Page states observed:', pageStates)
  })

  test('newsletter creation page does not get stuck on importing', async ({
    page,
  }) => {
    const pageStates: string[] = []

    page.on('domcontentloaded', () => {
      pageStates.push('domcontentloaded')
    })

    page.on('load', () => {
      pageStates.push('load')
    })

    // Track console errors
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Track failed network requests
    const failedRequests: string[] = []
    page.on('requestfailed', request => {
      failedRequests.push(
        `${request.method()} ${request.url()} - ${request.failure()?.errorText}`
      )
    })

    await page.goto('/dashboard/newsletters/new', {
      waitUntil: 'domcontentloaded',
    })

    // If redirected to auth, skip test
    if (page.url().includes('/auth') || page.url().includes('/login')) {
      test.skip()
      return
    }

    // Check if page shows "importing" text
    const importingText = page.getByText(/importing/i)
    const isImporting = await importingText.isVisible().catch(() => false)

    if (isImporting) {
      console.log('⚠️ Newsletter creation page is showing "importing"')

      // Take screenshot immediately
      await page.screenshot({
        path: 'playwright-report/importing-state-start.png',
        fullPage: true,
      })

      // Wait to see if it resolves
      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 })
        console.log('✅ "Importing" state resolved after waiting')

        // Take screenshot of resolved state
        await page.screenshot({
          path: 'playwright-report/importing-state-resolved.png',
          fullPage: true,
        })
      } catch {
        // Still stuck - gather diagnostic info
        console.log('❌ Page STUCK on importing after 15 seconds')

        // Take screenshot of stuck state
        await page.screenshot({
          path: 'playwright-report/stuck-importing-newsletter.png',
          fullPage: true,
        })

        // Log diagnostic info
        console.log('Console Errors:', consoleErrors)
        console.log('Failed Requests:', failedRequests)
        console.log('Page States:', pageStates)
        console.log('Current URL:', page.url())

        // Get page content for analysis
        const pageContent = await page.content()
        console.log('Page HTML length:', pageContent.length)
        console.log('Has React root:', pageContent.includes('__next'))

        throw new Error(
          'Page stuck on importing for 15+ seconds. Check screenshots in playwright-report/'
        )
      }
    } else {
      console.log(
        '✅ No "importing" state detected on newsletter creation page'
      )
    }

    // Log any errors or failed requests even if test passes
    if (consoleErrors.length > 0) {
      console.log('Console Errors detected:', consoleErrors)
    }
    if (failedRequests.length > 0) {
      console.log('Failed Requests detected:', failedRequests)
    }

    console.log('Page states observed:', pageStates)
  })

  test('scraping a URL does not cause infinite importing state', async ({
    page,
  }) => {
    // Track console messages
    const consoleMessages: Array<{ type: string; text: string }> = []
    page.on('console', msg => {
      consoleMessages.push({ type: msg.type(), text: msg.text() })
    })

    await page.goto('/dashboard/newsletters/new')

    // If redirected to auth, skip test
    if (page.url().includes('/auth')) {
      test.skip()
      return
    }

    // Fill in a URL to scrape
    const urlInput = page.getByPlaceholder(/url|link|newsletter/i)
    await urlInput.fill('https://www.aisecondact.com/p/test')

    // Click the import/scrape button
    const importButton = page.getByRole('button', {
      name: /import|scrape|fetch/i,
    })
    await importButton.click()

    console.log('Clicked scrape button, monitoring for stuck state...')

    // Monitor for "importing" state
    const importingText = page.getByText(/importing|loading|fetching/i)

    try {
      // Wait for importing text to appear
      await importingText.waitFor({ state: 'visible', timeout: 2000 })
      console.log('✅ Loading state appeared')

      // Now wait for it to disappear (operation complete)
      await importingText.waitFor({ state: 'hidden', timeout: 30000 })
      console.log('✅ Loading state resolved - operation completed')
    } catch {
      // Take screenshot if stuck
      await page.screenshot({
        path: 'playwright-report/stuck-during-scrape.png',
        fullPage: true,
      })

      console.log('❌ Scraping got stuck')
      console.log('Console messages:', consoleMessages.slice(-20)) // Last 20 messages

      throw new Error('Scraping operation stuck in loading state')
    }

    console.log('All console messages:', consoleMessages)
  })
})
