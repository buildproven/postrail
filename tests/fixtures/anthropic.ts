/**
 * Test Fixtures - Anthropic API Mocks
 * Reusable mock factories for Anthropic SDK across all tests
 */

import { vi } from 'vitest'

/**
 * Create mock Anthropic messages.create function
 */
export function createMockMessagesCreate() {
  return vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: 'This is a professionally crafted LinkedIn post about AI automation. #AI #Automation',
      },
    ],
  })
}

/**
 * Create mock Anthropic SDK module
 */
export function createMockAnthropicModule(mockMessagesCreate: ReturnType<typeof vi.fn>) {
  class MockAPIError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'APIError'
    }
  }

  return {
    default: class MockAnthropic {
      messages = {
        create: ((...args: any[]) => mockMessagesCreate(...args)) as any,
      }
    },
    APIError: MockAPIError,
  }
}

/**
 * Create mock response for different post types
 */
export function createMockPostResponse(platform: string, postType: string): string {
  const templates = {
    linkedin: {
      'pre-cta': 'Professional LinkedIn post introducing the topic. #Business #Tech',
      'post-cta': 'Follow-up LinkedIn post with insights and next steps. #Growth',
    },
    twitter: {
      'pre-cta': 'Engaging Twitter thread starter about the topic. #Tech',
      'post-cta': 'Twitter follow-up with key takeaways. #Business',
    },
    facebook: {
      'pre-cta': 'Friendly Facebook post introducing the newsletter topic.',
      'post-cta': 'Facebook post with detailed insights and community engagement.',
    },
    threads: {
      'pre-cta': 'Threads post introducing the topic in a conversational way.',
      'post-cta': 'Threads follow-up with additional context and questions.',
    },
  }

  return (
    templates[platform as keyof typeof templates]?.[
      postType as keyof (typeof templates)['linkedin']
    ] ?? 'Generic post content for testing'
  )
}
