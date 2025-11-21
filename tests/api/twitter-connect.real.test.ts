/**
 * Real integration tests for /api/platforms/twitter/connect
 * Tests actual code execution with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET, DELETE } from '@/app/api/platforms/twitter/connect/route'
import { NextRequest } from 'next/server'
import {
  createMockSupabaseClient,
  mockSupabaseAuthUser,
  mockSupabaseAuthError,
} from '../mocks/supabase'
import { createMockTwitterClient } from '../mocks/twitter-api'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Create a factory to hold the mock instance
let mockTwitterClientInstance: any = null

// Mock Twitter API
vi.mock('twitter-api-v2', () => {
  // Create a mock constructor function
  function MockTwitterApi(this: any) {
    console.log(
      '[MOCK] TwitterApi constructor called, instance:',
      mockTwitterClientInstance ? 'SET' : 'NULL'
    )
    // Return the mock instance
    if (mockTwitterClientInstance) {
      return mockTwitterClientInstance
    }
    // Fallback: return empty object with minimal structure
    return { v2: { me: vi.fn() } }
  }

  return {
    TwitterApi: MockTwitterApi,
  }
})

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
  hash: vi.fn(() => 'a'.repeat(64)),
}))

import { createClient } from '@/lib/supabase/server'
import { TwitterApi } from 'twitter-api-v2'
import { encrypt, hash } from '@/lib/crypto'

describe('/api/platforms/twitter/connect - Real Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST - Connect Twitter', () => {
    describe('Authentication', () => {
      it('should reject unauthenticated requests', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'test-key',
              apiSecret: 'test-secret',
              accessToken: 'test-token',
              accessTokenSecret: 'test-token-secret',
            }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(401)
        expect(data.error).toBe('Unauthorized')
      })

      it('should accept authenticated requests', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(
          mockSupabaseAuthUser('user-123', 'test@example.com')
        )

        // Set the mock instance that TwitterApi constructor will return
        mockTwitterClientInstance = createMockTwitterClient()

        mockSupabase
          .from('platform_connections')
          .upsert.mockResolvedValue({ data: null, error: null })

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'test-key',
              apiSecret: 'test-secret',
              accessToken: 'test-token',
              accessTokenSecret: 'test-token-secret',
            }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        if (response.status !== 200) {
          console.log('ERROR - Expected 200, got:', response.status, data)
          console.log(
            'Was TwitterApi called?',
            vi.mocked(TwitterApi).mock.calls.length
          )
          console.log(
            'Was me() called?',
            mockTwitterClientInstance?.v2?.me?.mock?.calls?.length ||
              'mock not set'
          )
        }

        expect(response.status).toBe(200)
      })
    })

    describe('Validation', () => {
      beforeEach(() => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(
          mockSupabaseAuthUser('user-123', 'test@example.com')
        )
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
      })

      it('should require all 4 credentials', async () => {
        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'test-key',
              apiSecret: 'test-secret',
              // Missing accessToken and accessTokenSecret
            }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('credentials')
        expect(data.required).toContain('accessToken')
        expect(data.required).toContain('accessTokenSecret')
      })

      it('should reject empty credentials', async () => {
        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: '',
              apiSecret: 'test-secret',
              accessToken: 'test-token',
              accessTokenSecret: 'test-token-secret',
            }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('credentials')
      })
    })

    describe('Twitter API Validation', () => {
      beforeEach(() => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(
          mockSupabaseAuthUser('user-123', 'test@example.com')
        )
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
      })

      it('should validate credentials with Twitter API', async () => {
        mockTwitterClientInstance = createMockTwitterClient()

        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(
          mockSupabaseAuthUser('user-123', 'test@example.com')
        )
        mockSupabase
          .from('platform_connections')
          .upsert.mockResolvedValue({ data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'valid-key',
              apiSecret: 'valid-secret',
              accessToken: 'valid-token',
              accessTokenSecret: 'valid-token-secret',
            }),
          }
        )

        await POST(request)

        expect(mockTwitterClientInstance.v2.me).toHaveBeenCalled()
      })

      it('should handle invalid Twitter credentials', async () => {
        mockTwitterClientInstance = createMockTwitterClient()
        mockTwitterClientInstance.v2.me.mockRejectedValue(
          new Error('Unauthorized')
        )

        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'invalid-key',
              apiSecret: 'invalid-secret',
              accessToken: 'invalid-token',
              accessTokenSecret: 'invalid-token-secret',
            }),
          }
        )

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('credentials')
      })
    })

    describe('Credential Storage', () => {
      it('should encrypt credentials before storage', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(
          mockSupabaseAuthUser('user-123', 'test@example.com')
        )

        mockTwitterClientInstance = createMockTwitterClient()

        const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
        mockSupabase.from('platform_connections').upsert = upsertSpy

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'plain-key',
              apiSecret: 'plain-secret',
              accessToken: 'plain-token',
              accessTokenSecret: 'plain-token-secret',
            }),
          }
        )

        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(encrypt).toHaveBeenCalledWith('plain-key')
        expect(encrypt).toHaveBeenCalledWith('plain-secret')
        expect(encrypt).toHaveBeenCalledWith('plain-token')
        expect(encrypt).toHaveBeenCalledWith('plain-token-secret')
      })

      it('should hash credentials for lookup', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(
          mockSupabaseAuthUser('user-123', 'test@example.com')
        )

        mockTwitterClientInstance = createMockTwitterClient()

        mockSupabase
          .from('platform_connections')
          .upsert.mockResolvedValue({ data: null, error: null })

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'key',
              apiSecret: 'secret',
              accessToken: 'token',
              accessTokenSecret: 'token-secret',
            }),
          }
        )

        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(hash).toHaveBeenCalled()
      })

      it('should upsert connection on user_id + platform', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(
          mockSupabaseAuthUser('user-123', 'test@example.com')
        )

        mockTwitterClientInstance = createMockTwitterClient()

        const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
        // Override from() to return object with our spy
        mockSupabase.from = vi.fn(() => ({
          upsert: upsertSpy,
        })) as any

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest(
          'http://localhost:3000/api/platforms/twitter/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              apiKey: 'key',
              apiSecret: 'secret',
              accessToken: 'token',
              accessTokenSecret: 'token-secret',
            }),
          }
        )

        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(upsertSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            user_id: 'user-123',
            platform: 'twitter',
          }),
          expect.objectContaining({
            onConflict: 'user_id,platform',
          })
        )
      })
    })
  })

  describe('GET - Check Connection Status', () => {
    it('should return connected status for authenticated user', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            platform_username: 'testuser',
            platform_user_id: '123456',
            connected_at: new Date().toISOString(),
            is_active: true,
          },
          error: null,
        }),
      }
      mockSupabase.from = vi.fn(() => mockChain) as any

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.connected).toBe(true)
      expect(data.username).toBe('testuser')
    })

    it('should return not connected if no connection exists', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.connected).toBe(false)
    })
  })

  describe('DELETE - Disconnect Twitter', () => {
    it('should delete connection for authenticated user', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )

      const eq2Spy = vi.fn().mockResolvedValue({ data: null, error: null })
      const eq1Spy = vi.fn(() => ({ eq: eq2Spy }))
      const deleteSpy = vi.fn(() => ({ eq: eq1Spy }))

      mockSupabase.from = vi.fn(() => ({
        delete: deleteSpy,
      })) as any

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await DELETE()
      const data = await response.json()

      if (response.status !== 200) {
        console.log('DELETE ERROR:', response.status, data)
      }

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(deleteSpy).toHaveBeenCalled()
      expect(eq1Spy).toHaveBeenCalled()
      expect(eq2Spy).toHaveBeenCalled()
    })

    it('should reject unauthenticated delete requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await DELETE()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })
})
