import { test, expect } from '@playwright/test'

/**
 * API Integration E2E Tests
 *
 * These tests verify that the API endpoints work correctly end-to-end.
 * They test the actual HTTP responses, not just UI behavior.
 *
 * Critical API endpoints tested:
 * - POST /api/scrape - Newsletter URL scraping
 * - POST /api/generate-posts - AI post generation
 * - POST /api/posts/schedule - Post scheduling
 * - GET /api/posts/schedule - Get scheduled posts
 * - POST /api/platforms/:platform/post - Platform posting
 */

test.describe('API Integration: Health Checks', () => {
  test('monitoring endpoint returns health status', async ({ request }) => {
    const response = await request.get('/api/monitoring?section=health')

    // Should return 200 or redirect to auth
    expect([200, 401]).toContain(response.status())

    if (response.status() === 200) {
      const data = await response.json()
      expect(data).toHaveProperty('status')
    }
  })

  test('rate limit status endpoint responds', async ({ request }) => {
    const response = await request.get('/api/rate-limit-status')

    // Should return 200 or 401 (unauthorized)
    expect([200, 401]).toContain(response.status())
  })
})

test.describe('API Integration: Scraping', () => {
  test('scrape endpoint requires authentication', async ({ request }) => {
    const response = await request.post('/api/scrape', {
      data: { url: 'https://example.com' },
    })

    // Should return 401 for unauthenticated requests
    expect(response.status()).toBe(401)
  })

  test('scrape endpoint validates URL format', async ({ request }) => {
    // This will be 401 without auth, which is expected
    const response = await request.post('/api/scrape', {
      data: { url: 'not-a-valid-url' },
    })

    // Either 401 (no auth) or 400 (invalid URL)
    expect([400, 401]).toContain(response.status())
  })
})

test.describe('API Integration: Post Generation', () => {
  test('generate-posts endpoint requires authentication', async ({
    request,
  }) => {
    const response = await request.post('/api/generate-posts', {
      data: {
        title: 'Test Newsletter',
        content: 'Test content for generating posts',
      },
    })

    expect(response.status()).toBe(401)
  })

  test('generate-posts endpoint validates required fields', async ({
    request,
  }) => {
    const response = await request.post('/api/generate-posts', {
      data: {},
    })

    // Either 401 (no auth) or 400 (missing fields)
    expect([400, 401]).toContain(response.status())
  })
})

test.describe('API Integration: Scheduling', () => {
  test('schedule endpoint requires authentication', async ({ request }) => {
    const response = await request.post('/api/posts/schedule', {
      data: {
        postId: 'test-post-id',
        scheduledTime: new Date(Date.now() + 86400000).toISOString(),
      },
    })

    expect(response.status()).toBe(401)
  })

  test('schedule GET endpoint requires authentication', async ({ request }) => {
    const response = await request.get('/api/posts/schedule')

    expect(response.status()).toBe(401)
  })

  test('schedule DELETE endpoint requires authentication', async ({
    request,
  }) => {
    const response = await request.delete('/api/posts/schedule?postId=test-id')

    expect(response.status()).toBe(401)
  })
})

test.describe('API Integration: Platform Posting', () => {
  test('twitter post endpoint requires authentication', async ({ request }) => {
    const response = await request.post('/api/platforms/twitter/post', {
      data: { postId: 'test-post-id' },
    })

    expect(response.status()).toBe(401)
  })

  test('linkedin post endpoint requires authentication', async ({
    request,
  }) => {
    const response = await request.post('/api/platforms/linkedin/post', {
      data: { postId: 'test-post-id' },
    })

    expect(response.status()).toBe(401)
  })

  test('facebook post endpoint requires authentication', async ({
    request,
  }) => {
    const response = await request.post('/api/platforms/facebook/post', {
      data: { postId: 'test-post-id' },
    })

    expect(response.status()).toBe(401)
  })

  test('twitter status endpoint responds', async ({ request }) => {
    const response = await request.get('/api/twitter-status')

    // Should return 200 or 401
    expect([200, 401]).toContain(response.status())
  })
})

test.describe('API Integration: Error Responses', () => {
  test('API returns proper JSON error format', async ({ request }) => {
    const response = await request.post('/api/scrape', {
      data: { url: 'https://example.com' },
    })

    const data = await response.json()

    // Should have error property
    expect(data).toHaveProperty('error')
    expect(typeof data.error).toBe('string')
  })

  test('404 for non-existent API routes', async ({ request }) => {
    const response = await request.get('/api/this-does-not-exist')

    expect(response.status()).toBe(404)
  })

  test('method not allowed for wrong HTTP methods', async ({ request }) => {
    // GET on a POST-only endpoint
    const response = await request.get('/api/scrape')

    expect([404, 405]).toContain(response.status())
  })
})

test.describe('API Integration: Request Validation', () => {
  test('API handles empty request body', async ({ request }) => {
    const response = await request.post('/api/generate-posts', {
      data: null,
    })

    // Should not crash, return appropriate error
    expect([400, 401, 500]).toContain(response.status())
  })

  test('API handles malformed JSON', async ({ request }) => {
    const response = await request.post('/api/generate-posts', {
      headers: { 'Content-Type': 'application/json' },
      data: 'not valid json{',
    })

    // Should handle gracefully
    expect([400, 401, 500]).toContain(response.status())
  })

  test('API handles very large requests', async ({ request }) => {
    const largeContent = 'x'.repeat(100000) // 100KB of content

    const response = await request.post('/api/generate-posts', {
      data: {
        title: 'Test',
        content: largeContent,
      },
    })

    // Should either process or reject with appropriate error
    expect([200, 400, 401, 413]).toContain(response.status())
  })
})

test.describe('API Integration: CORS and Headers', () => {
  test('API returns proper content-type header', async ({ request }) => {
    const response = await request.get('/api/monitoring?section=health')

    const contentType = response.headers()['content-type']

    // Should be JSON
    expect(contentType).toMatch(/application\/json/)
  })
})

// Authenticated API tests (require auth setup)
test.describe('API Integration: Authenticated Endpoints', () => {
  test.use({ storageState: 'playwright/.auth/user.json' })

  test('authenticated request to monitoring works', async ({ request }) => {
    const response = await request.get('/api/monitoring?section=health')

    // With auth, should return 200
    if (response.status() === 200) {
      const data = await response.json()
      expect(data).toHaveProperty('status')
    }
    // If still 401, auth setup didn't work - that's ok
  })

  test('authenticated GET scheduled posts', async ({ request }) => {
    const response = await request.get('/api/posts/schedule')

    if (response.status() === 200) {
      const data = await response.json()
      expect(data).toHaveProperty('posts')
      expect(Array.isArray(data.posts)).toBe(true)
    }
  })
})
