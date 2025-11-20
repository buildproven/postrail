/**
 * Mock Anthropic SDK for testing
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { vi } from 'vitest'

export const createMockAnthropicClient = () => {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Generated social media post content here. This is a test post that stays within character limits.',
          },
        ],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      }),
    },
  }
}

export const mockAnthropicSuccess = (text: string) => ({
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text,
    },
  ],
  model: 'claude-sonnet-4-20250514',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
  },
})

export const mockAnthropicError = () => {
  const error: any = new Error('API Error')
  error.status = 500
  error.message = 'Internal server error'
  throw error
}
