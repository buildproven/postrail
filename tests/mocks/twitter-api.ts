/**
 * Mock Twitter API client for testing
 */

import { vi } from 'vitest'

export const createMockTwitterClient = () => {
  return {
    v2: {
      me: vi.fn().mockResolvedValue({
        data: {
          id: '123456789',
          username: 'testuser',
          name: 'Test User',
        },
      }),
      tweet: vi.fn().mockResolvedValue({
        data: {
          id: '1234567890123456789',
          text: 'Test tweet content',
        },
      }),
    },
  }
}

export const mockTwitterAuthSuccess = () => ({
  data: {
    id: '123456789',
    username: 'testuser',
    name: 'Test User',
  },
})

export const mockTwitterAuthError = (statusCode: number = 401) => {
  const error: any = new Error('Unauthorized')
  error.code = statusCode
  error.message = statusCode === 401 ? 'Unauthorized' : 'Forbidden'
  throw error
}

export const mockTwitterTweetSuccess = (text: string) => ({
  data: {
    id: '1234567890123456789',
    text,
  },
})

export const mockTwitterRateLimitError = () => {
  const error: any = new Error('Rate limit exceeded')
  error.code = 429
  error.rateLimit = {
    limit: 500,
    remaining: 0,
    reset: Date.now() + 900000, // 15 minutes
  }
  throw error
}

export const mockTwitterDuplicateError = () => {
  const error: any = new Error('Duplicate content')
  error.code = 403
  error.message = 'Status is a duplicate'
  throw error
}
