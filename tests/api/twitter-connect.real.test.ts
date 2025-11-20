/**
 * Real integration tests for /api/platforms/twitter/connect
 * Tests actual code execution with mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, GET, DELETE } from '@/app/api/platforms/twitter/connect/route'
import { NextRequest } from 'next/server'
import { createMockSupabaseClient, mockSupabaseAuthUser, mockSupabaseAuthError } from '../../mocks/supabase'
import { createMockTwitterClient } from '../../mocks/twitter-api'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock Twitter API
vi.mock('twitter-api-v2', () => ({
  TwitterApi: vi.fn(),
}))

// Mock crypto
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
  hash: vi.fn((text: string) => 'a'.repeat(64)),
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

        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            accessToken: 'test-token',
            accessTokenSecret: 'test-token-secret',
          }),
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(401)
        expect(data.error).toBe('Unauthorized')
      })

      it('should accept authenticated requests', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

        const mockTwitterClient = createMockTwitterClient()
        vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

        mockSupabase.from('platform_connections').upsert.mockResolvedValue({ data: null, error: null })

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            accessToken: 'test-token',
            accessTokenSecret: 'test-token-secret',
          }),
        })

        const response = await POST(request)

        expect(response.status).toBe(200)
      })
    })

    describe('Validation', () => {
      beforeEach(() => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
      })

      it('should require all 4 credentials', async () => {
        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'test-key',
            apiSecret: 'test-secret',
            // Missing accessToken and accessTokenSecret
          }),
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('credentials')
        expect(data.required).toContain('accessToken')
        expect(data.required).toContain('accessTokenSecret')
      })

      it('should reject empty credentials', async () => {
        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: '',
            apiSecret: 'test-secret',
            accessToken: 'test-token',
            accessTokenSecret: 'test-token-secret',
          }),
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('credentials')
      })
    })

    describe('Twitter API Validation', () => {
      beforeEach(() => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)
      })

      it('should validate credentials with Twitter API', async () => {
        const mockTwitterClient = createMockTwitterClient()
        vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))
        mockSupabase.from('platform_connections').upsert.mockResolvedValue({ data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'valid-key',
            apiSecret: 'valid-secret',
            accessToken: 'valid-token',
            accessTokenSecret: 'valid-token-secret',
          }),
        })

        const response = await POST(request)

        expect(mockTwitterClient.v2.me).toHaveBeenCalled()
      })

      it('should handle invalid Twitter credentials', async () => {
        const mockTwitterClient = createMockTwitterClient()
        mockTwitterClient.v2.me.mockRejectedValue(new Error('Unauthorized'))

        vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'invalid-key',
            apiSecret: 'invalid-secret',
            accessToken: 'invalid-token',
            accessTokenSecret: 'invalid-token-secret',
          }),
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('credentials')
      })
    })

    describe('Credential Storage', () => {
      it('should encrypt credentials before storage', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

        const mockTwitterClient = createMockTwitterClient()
        vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

        const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
        mockSupabase.from('platform_connections').upsert = upsertSpy

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'plain-key',
            apiSecret: 'plain-secret',
            accessToken: 'plain-token',
            accessTokenSecret: 'plain-token-secret',
          }),
        })

        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(encrypt).toHaveBeenCalledWith('plain-key')
        expect(encrypt).toHaveBeenCalledWith('plain-secret')
        expect(encrypt).toHaveBeenCalledWith('plain-token')
        expect(encrypt).toHaveBeenCalledWith('plain-token-secret')
      })

      it('should hash credentials for lookup', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

        const mockTwitterClient = createMockTwitterClient()
        vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

        mockSupabase.from('platform_connections').upsert.mockResolvedValue({ data: null, error: null })

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'key',
            apiSecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'token-secret',
          }),
        })

        const response = await POST(request)

        expect(response.status).toBe(200)
        expect(hash).toHaveBeenCalled()
      })

      it('should upsert connection on user_id + platform', async () => {
        const mockSupabase = createMockSupabaseClient()
        mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

        const mockTwitterClient = createMockTwitterClient()
        vi.mocked(TwitterApi).mockImplementation(() => mockTwitterClient as any)

        const upsertSpy = vi.fn().mockResolvedValue({ data: null, error: null })
        mockSupabase.from('platform_connections').upsert = upsertSpy

        vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

        const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
          method: 'POST',
          body: JSON.stringify({
            apiKey: 'key',
            apiSecret: 'secret',
            accessToken: 'token',
            accessTokenSecret: 'token-secret',
          }),
        })

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
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: {
          platform_username: 'testuser',
          platform_user_id: '123456',
          connected_at: new Date().toISOString(),
          is_active: true,
        },
        error: null,
      })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
        method: 'GET',
      })

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.connected).toBe(true)
      expect(data.username).toBe('testuser')
    })

    it('should return not connected if no connection exists', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      mockSupabase.from('platform_connections').select.mockReturnThis()
      mockSupabase.from('platform_connections').eq.mockReturnThis()
      mockSupabase.from('platform_connections').single.mockResolvedValue({
        data: null,
        error: { message: 'Not found', code: 'PGRST116' },
      })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
        method: 'GET',
      })

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.connected).toBe(false)
    })
  })

  describe('DELETE - Disconnect Twitter', () => {
    it('should delete connection for authenticated user', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthUser('user-123', 'test@example.com'))

      const deleteSpy = vi.fn().mockReturnThis()
      mockSupabase.from('platform_connections').delete = deleteSpy
      mockSupabase.from('platform_connections').eq.mockResolvedValue({ data: null, error: null })

      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
        method: 'DELETE',
      })

      const response = await DELETE()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(deleteSpy).toHaveBeenCalled()
    })

    it('should reject unauthenticated delete requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const request = new NextRequest('http://localhost:3000/api/platforms/twitter/connect', {
        method: 'DELETE',
      })

      const response = await DELETE()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })
})
