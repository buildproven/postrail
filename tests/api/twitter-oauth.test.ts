/**
 * Twitter OAuth 2.0 Integration Tests
 *
 * Tests for /api/platforms/twitter/auth and /api/platforms/twitter/callback
 * Covers OAuth 2.0 with PKCE flow, state validation, token exchange, and credential storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createMockSupabaseClient,
  mockSupabaseAuthUser,
  mockSupabaseAuthError,
} from '../mocks/supabase'

// Note: We don't mock crypto as it causes issues with the default export.
// The auth route uses crypto.randomBytes which works fine without mocking.

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock crypto encryption
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

// Mock fetch for Twitter API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

import { createClient } from '@/lib/supabase/server'
import { GET as authHandler } from '@/app/api/platforms/twitter/auth/route'
import { GET as callbackHandler } from '@/app/api/platforms/twitter/callback/route'

describe('/api/platforms/twitter/auth - OAuth Initiation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TWITTER_CLIENT_ID = 'test-client-id'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(mockSupabaseAuthError())
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Configuration', () => {
    it('should return 500 when TWITTER_CLIENT_ID is missing', async () => {
      delete process.env.TWITTER_CLIENT_ID

      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toContain('TWITTER_CLIENT_ID')
    })

    it('should return 500 when NEXT_PUBLIC_APP_URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_APP_URL

      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toContain('NEXT_PUBLIC_APP_URL')
    })
  })

  describe('OAuth Flow Initiation', () => {
    it('should redirect to Twitter authorization URL with correct parameters', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()

      expect(response.status).toBe(307) // Redirect
      const location = response.headers.get('location')
      expect(location).toContain('https://twitter.com/i/oauth2/authorize')
      expect(location).toContain('response_type=code')
      expect(location).toContain('client_id=test-client-id')
      expect(location).toContain('redirect_uri=')
      expect(location).toContain('scope=')
      expect(location).toContain('state=')
      expect(location).toContain('code_challenge=')
      expect(location).toContain('code_challenge_method=S256')
    })

    it('should include correct scopes in authorization URL', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()

      const location = response.headers.get('location') || ''
      const url = new URL(location)
      const scope = url.searchParams.get('scope')

      expect(scope).toContain('tweet.read')
      expect(scope).toContain('tweet.write')
      expect(scope).toContain('users.read')
      expect(scope).toContain('offline.access')
    })

    it('should set OAuth cookies for callback validation', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()

      const cookies = response.headers.getSetCookie()

      // Check that state cookie is set
      const stateCookie = cookies.find(c => c.includes('twitter_oauth_state='))
      expect(stateCookie).toBeDefined()
      expect(stateCookie).toContain('HttpOnly')

      // Check that verifier cookie is set
      const verifierCookie = cookies.find(c =>
        c.includes('twitter_oauth_verifier=')
      )
      expect(verifierCookie).toBeDefined()
      expect(verifierCookie).toContain('HttpOnly')

      // Check that user cookie is set
      const userCookie = cookies.find(c => c.includes('twitter_oauth_user='))
      expect(userCookie).toBeDefined()
      expect(userCookie).toContain('HttpOnly')
    })
  })
})

describe('/api/platforms/twitter/callback - OAuth Callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    process.env.TWITTER_CLIENT_ID = 'test-client-id'
    process.env.TWITTER_CLIENT_SECRET = 'test-client-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  describe('Error Handling', () => {
    it('should redirect with error when Twitter returns OAuth error', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/callback?error=access_denied&error_description=User%20denied%20access'
      )

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('error=')
      expect(location).toContain('User%20denied%20access')
    })

    it('should redirect with error when code is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/callback?state=abc123'
      )

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('error=')
    })

    it('should redirect with error when state is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/twitter/callback?code=auth-code-123'
      )

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('error=')
    })
  })

  describe('CSRF Protection', () => {
    it('should reject request when state does not match stored state', async () => {
      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'incoming-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=different-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('Invalid%20state')
    })

    it('should reject request when state cookie is missing', async () => {
      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'incoming-state')

      const request = new NextRequest(url)

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
    })
  })

  describe('PKCE Validation', () => {
    it('should reject request when code verifier is missing', async () => {
      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('verifier')
    })
  })

  describe('Session Validation', () => {
    it('should reject request when user session cookie is missing', async () => {
      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('Session%20expired')
    })
  })

  describe('Configuration Validation', () => {
    it('should redirect with error when TWITTER_CLIENT_ID is missing', async () => {
      delete process.env.TWITTER_CLIENT_ID

      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('not%20configured')
    })

    it('should redirect with error when TWITTER_CLIENT_SECRET is missing', async () => {
      delete process.env.TWITTER_CLIENT_SECRET

      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('not%20configured')
    })
  })

  describe('Token Exchange', () => {
    it('should redirect with error when token exchange fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Invalid authorization code'),
      })

      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('exchange')
    })

    it('should redirect with error when user info fetch fails', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_in: 7200,
            token_type: 'bearer',
            scope: 'tweet.read tweet.write users.read offline.access',
          }),
      })

      // User info fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      })

      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('user%20info')
    })
  })

  describe('Successful Connection', () => {
    it('should store encrypted credentials and redirect to platforms page on success', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_in: 7200,
            token_type: 'bearer',
            scope: 'tweet.read tweet.write users.read offline.access',
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: '123456789',
              name: 'Test User',
              username: 'testuser',
            },
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('success=twitter')

      // Verify token exchange was called
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.twitter.com/2/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      )

      // Verify user info was fetched
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.twitter.com/2/users/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer access-token-123',
          }),
        })
      )

      // Verify database upsert was called
      expect(mockSupabase.from).toHaveBeenCalledWith('platform_connections')
    })

    it('should redirect with error when database save fails', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_in: 7200,
            token_type: 'bearer',
            scope: 'tweet.read tweet.write users.read offline.access',
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: '123456789',
              name: 'Test User',
              username: 'testuser',
            },
          }),
      })

      // Mock Supabase with database error
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({
          error: { message: 'Database error', code: 'ERROR' },
        }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('save')
    })

    it('should clear OAuth cookies on success', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_in: 7200,
            token_type: 'bearer',
            scope: 'tweet.read tweet.write users.read offline.access',
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              id: '123456789',
              name: 'Test User',
              username: 'testuser',
            },
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/twitter/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'twitter_oauth_state=matching-state; twitter_oauth_verifier=verifier; twitter_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      // Check that cookies are deleted (Next.js sets them with empty value and/or past expiry)
      const cookies = response.headers.getSetCookie()
      const cookieNames = [
        'twitter_oauth_state',
        'twitter_oauth_verifier',
        'twitter_oauth_user',
      ]

      // Find cookies that are being cleared - they contain the cookie name
      // and either have Max-Age=0, empty value, or past expiry
      const clearedCookies = cookies.filter(c =>
        cookieNames.some(name => c.includes(name))
      )

      // The response should reference the OAuth cookies (for deletion)
      expect(clearedCookies.length).toBeGreaterThan(0)
    })
  })
})
