/**
 * Tests for lib/supabase/server.ts
 * Tests server-side Supabase client creation with cookie handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @supabase/ssr and next/headers using factory functions
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const mockCreateServerClient = vi.mocked(createServerClient)
const mockCookies = vi.mocked(cookies)

describe('lib/supabase/server', () => {
  let mockCookieStore: any

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

    // Mock cookie store
    mockCookieStore = {
      getAll: vi.fn().mockReturnValue([
        { name: 'session', value: 'token-123' },
      ]),
      set: vi.fn(),
    }
    mockCookies.mockResolvedValue(mockCookieStore)
  })

  describe('createClient', () => {
    it('should call createServerClient with environment variables', async () => {
      const mockClient = { from: vi.fn() }
      mockCreateServerClient.mockReturnValue(mockClient)

      await createClient()

      expect(mockCreateServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        })
      )
    })

    it('should configure cookie handlers correctly', async () => {
      const mockClient = { from: vi.fn() }
      mockCreateServerClient.mockReturnValue(mockClient)

      await createClient()

      const cookieConfig = mockCreateServerClient.mock.calls[0][2]

      // Test getAll
      const cookies = cookieConfig.cookies.getAll()
      expect(mockCookieStore.getAll).toHaveBeenCalled()
      expect(cookies).toEqual([{ name: 'session', value: 'token-123' }])
    })

    it('should set cookies via setAll', async () => {
      const mockClient = { from: vi.fn() }
      mockCreateServerClient.mockReturnValue(mockClient)

      await createClient()

      const cookieConfig = mockCreateServerClient.mock.calls[0][2]

      // Test setAll
      const cookiesToSet = [
        { name: 'session', value: 'new-token', options: { maxAge: 3600 } },
      ]
      cookieConfig.cookies.setAll(cookiesToSet)

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'session',
        'new-token',
        { maxAge: 3600 }
      )
    })

    it('should handle setAll errors gracefully (Server Component scenario)', async () => {
      const mockClient = { from: vi.fn() }
      mockCreateServerClient.mockReturnValue(mockClient)

      // Make set throw an error
      mockCookieStore.set.mockImplementation(() => {
        throw new Error('Cannot set cookies from Server Component')
      })

      await createClient()

      const cookieConfig = mockCreateServerClient.mock.calls[0][2]

      // Should not throw when setAll fails
      expect(() => {
        cookieConfig.cookies.setAll([
          { name: 'session', value: 'token', options: {} },
        ])
      }).not.toThrow()
    })

    it('should return Supabase server client', async () => {
      const mockClient = {
        from: vi.fn(),
        auth: { getUser: vi.fn() },
      }
      mockCreateServerClient.mockReturnValue(mockClient)

      const client = await createClient()

      expect(client).toHaveProperty('from')
      expect(client).toHaveProperty('auth')
    })

    it('should await cookies() before creating client', async () => {
      const mockClient = { from: vi.fn() }
      mockCreateServerClient.mockReturnValue(mockClient)

      await createClient()

      expect(mockCookies).toHaveBeenCalled()
    })
  })
})
