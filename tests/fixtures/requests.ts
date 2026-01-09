/**
 * Test Fixtures - HTTP Requests
 * Reusable utilities for creating test requests
 */

import { NextRequest } from 'next/server'

/**
 * Create a mock NextRequest for API route testing
 */
export function createMockRequest(options: {
  url?: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: any
  headers?: Record<string, string>
}): NextRequest {
  const {
    url = 'http://localhost:3000/api/test',
    method = 'POST',
    body,
    headers = {},
  } = options

  const requestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  } as any

  if (body) {
    requestInit.body = JSON.stringify(body)
  }

  return new NextRequest(url, requestInit as any)
}

/**
 * Create authenticated request with mock session
 */
export function createAuthenticatedRequest(options: {
  userId?: string
  body?: any
  headers?: Record<string, string>
}) {
  return createMockRequest({
    body: options.body,
    headers: {
      ...options.headers,
      'x-test-user-id': options.userId ?? 'test-user-id',
    },
  })
}

/**
 * Create Stripe webhook request with signature
 */
export function createStripeWebhookRequest(options: {
  event: any
  signature?: string
}): NextRequest {
  return createMockRequest({
    url: 'http://localhost:3000/api/webhooks/stripe',
    method: 'POST',
    body: options.event,
    headers: {
      'stripe-signature': options.signature ?? 'test-signature',
    },
  })
}
