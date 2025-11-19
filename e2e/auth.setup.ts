import { test as setup } from '@playwright/test'

const authFile = 'playwright/.auth/user.json'

/**
 * Authentication Setup for E2E Tests
 *
 * This setup runs before tests to authenticate and save session state.
 * Tests can then reuse this authentication without re-logging in.
 *
 * To use authenticated state in tests:
 * test.use({ storageState: authFile })
 *
 * Configuration:
 * Set these environment variables to enable authenticated tests:
 * - TEST_USER_EMAIL: Your test account email
 * - TEST_USER_PASSWORD: Your test account password
 *
 * Example in .env.local:
 * TEST_USER_EMAIL=test@example.com
 * TEST_USER_PASSWORD=yourpassword
 */

setup('authenticate', async ({ page }) => {
  const testEmail = process.env.TEST_USER_EMAIL
  const testPassword = process.env.TEST_USER_PASSWORD

  if (!testEmail || !testPassword) {
    console.log(
      '⚠️  Authentication skipped: TEST_USER_EMAIL or TEST_USER_PASSWORD not set'
    )
    console.log('   Set these environment variables to run authenticated tests')
    setup.skip()
    return
  }

  console.log(`🔐 Authenticating as: ${testEmail}`)

  // Navigate to login page
  await page.goto('/auth/login')

  // Fill in email and password
  await page.getByLabel(/email/i).fill(testEmail)
  await page.getByLabel(/password/i).fill(testPassword)

  // Click login button
  await page.getByRole('button', { name: /log in/i }).click()

  // Wait for redirect to dashboard (successful login)
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 10000 })
    console.log('✅ Authentication successful')

    // Save authentication state
    await page.context().storageState({ path: authFile })
  } catch (error) {
    console.error('❌ Authentication failed - could not reach dashboard')
    console.error('   Check credentials or login flow')
    throw error
  }
})
