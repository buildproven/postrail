/**
 * Tests for lib/supabase/client.ts
 * Tests browser-side Supabase client creation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/ssr using factory function
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/client'
import { createBrowserClient } from '@supabase/ssr'

const mockCreateBrowserClient = vi.mocked(createBrowserClient)

describe('lib/supabase/client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set up environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  describe('createClient', () => {
    it('should call createBrowserClient with environment variables', () => {
      const mockClient = { from: vi.fn() }
      mockCreateBrowserClient.mockReturnValue(mockClient)

      const result = createClient()

      expect(mockCreateBrowserClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key'
      )
      expect(result).toBe(mockClient)
    })

    it('should return Supabase browser client', () => {
      const mockClient = {
        from: vi.fn(),
        auth: { signIn: vi.fn() },
      }
      mockCreateBrowserClient.mockReturnValue(mockClient)

      const client = createClient()

      expect(client).toHaveProperty('from')
      expect(client).toHaveProperty('auth')
    })

    it('should create new client on each call', () => {
      const mockClient1 = { id: 'client-1' }
      const mockClient2 = { id: 'client-2' }
      mockCreateBrowserClient
        .mockReturnValueOnce(mockClient1)
        .mockReturnValueOnce(mockClient2)

      const client1 = createClient()
      const client2 = createClient()

      expect(mockCreateBrowserClient).toHaveBeenCalledTimes(2)
      expect(client1).toBe(mockClient1)
      expect(client2).toBe(mockClient2)
    })
  })
})
