/**
 * Facebook OAuth 2.0 Integration Tests
 *
 * Tests for /api/platforms/facebook/auth and /api/platforms/facebook/callback
 * Covers OAuth 2.0 flow, state validation, token exchange, page access, and credential storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createMockSupabaseClient,
  mockSupabaseAuthUser,
  mockSupabaseAuthError,
} from '../mocks/supabase'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock crypto encryption
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

// Mock fetch for Facebook API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

import { createClient } from '@/lib/supabase/server'
import { GET as authHandler } from '@/app/api/platforms/facebook/auth/route'
import { GET as callbackHandler } from '@/app/api/platforms/facebook/callback/route'

describe('/api/platforms/facebook/auth - OAuth Initiation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.FACEBOOK_APP_ID = 'test-app-id'
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
    it('should return 500 when FACEBOOK_APP_ID is missing', async () => {
      delete process.env.FACEBOOK_APP_ID

      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toContain('FACEBOOK_APP_ID')
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
    it('should redirect to Facebook authorization URL with correct parameters', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()

      expect(response.status).toBe(307) // Redirect
      const location = response.headers.get('location')
      expect(location).toContain('https://www.facebook.com/v22.0/dialog/oauth')
      expect(location).toContain('response_type=code')
      expect(location).toContain('client_id=test-app-id')
      expect(location).toContain('redirect_uri=')
      expect(location).toContain('scope=')
      expect(location).toContain('state=')
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

      expect(scope).toContain('pages_show_list')
      expect(scope).toContain('pages_manage_posts')
      expect(scope).toContain('public_profile')
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
      const stateCookie = cookies.find(c => c.includes('facebook_oauth_state='))
      expect(stateCookie).toBeDefined()
      expect(stateCookie).toContain('HttpOnly')

      // Check that user cookie is set
      const userCookie = cookies.find(c => c.includes('facebook_oauth_user='))
      expect(userCookie).toBeDefined()
      expect(userCookie).toContain('HttpOnly')
    })
  })
})

describe('/api/platforms/facebook/callback - OAuth Callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    process.env.FACEBOOK_APP_ID = 'test-app-id'
    process.env.FACEBOOK_APP_SECRET = 'test-app-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  describe('Error Handling', () => {
    it('should redirect with error when Facebook returns OAuth error', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/callback?error=access_denied&error_description=User%20denied%20access'
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
        'http://localhost:3000/api/platforms/facebook/callback?state=abc123'
      )

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('error=')
    })

    it('should redirect with error when state is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/facebook/callback?code=auth-code-123'
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
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'incoming-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=different-state; facebook_oauth_user=user-123',
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
        'http://localhost:3000/api/platforms/facebook/callback'
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

  describe('Session Validation', () => {
    it('should reject request when user session cookie is missing', async () => {
      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: 'facebook_oauth_state=matching-state',
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
    it('should redirect with error when FACEBOOK_APP_ID is missing', async () => {
      delete process.env.FACEBOOK_APP_ID

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('not%20configured')
    })

    it('should redirect with error when FACEBOOK_APP_SECRET is missing', async () => {
      delete process.env.FACEBOOK_APP_SECRET

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
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
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
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
            access_token: 'short-lived-token',
            token_type: 'bearer',
            expires_in: 3600,
          }),
      })

      // Long-lived token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'long-lived-token',
            token_type: 'bearer',
            expires_in: 5184000,
          }),
      })

      // User info fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      })

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('user%20info')
    })
  })

  describe('Page Access', () => {
    it('should redirect with error when no pages are found', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'short-lived-token',
            token_type: 'bearer',
            expires_in: 3600,
          }),
      })

      // Long-lived token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'long-lived-token',
            token_type: 'bearer',
            expires_in: 5184000,
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'fb-user-123',
            name: 'Test User',
            email: 'test@example.com',
          }),
      })

      // Pages fetch returns empty list
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
          }),
      })

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('No%20Facebook%20Pages')
    })

    it('should redirect with error when pages fetch fails', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'short-lived-token',
            token_type: 'bearer',
            expires_in: 3600,
          }),
      })

      // Long-lived token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'long-lived-token',
            token_type: 'bearer',
            expires_in: 5184000,
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'fb-user-123',
            name: 'Test User',
          }),
      })

      // Pages fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Not authorized'),
      })

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('No%20Facebook%20Pages')
    })
  })

  describe('Successful Connection', () => {
    it('should store encrypted credentials and redirect to platforms page on success', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'short-lived-token',
            token_type: 'bearer',
            expires_in: 3600,
          }),
      })

      // Long-lived token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'long-lived-token',
            token_type: 'bearer',
            expires_in: 5184000,
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'fb-user-123',
            name: 'Test User',
            email: 'test@example.com',
          }),
      })

      // Pages fetch returns a page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'page-123',
                name: 'Test Page',
                access_token: 'page-access-token',
                category: 'Business',
              },
            ],
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('success=facebook')

      // Verify API calls were made
      expect(mockFetch).toHaveBeenCalledTimes(4)

      // Verify database upsert was called
      expect(mockSupabase.from).toHaveBeenCalledWith('platform_connections')
    })

    it('should redirect with error when database save fails', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'short-lived-token',
            token_type: 'bearer',
            expires_in: 3600,
          }),
      })

      // Long-lived token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'long-lived-token',
            token_type: 'bearer',
            expires_in: 5184000,
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'fb-user-123',
            name: 'Test User',
          }),
      })

      // Pages fetch returns a page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'page-123',
                name: 'Test Page',
                access_token: 'page-access-token',
              },
            ],
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
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('save')
    })

    it('should handle long-lived token exchange failure gracefully', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'short-lived-token',
            token_type: 'bearer',
            expires_in: 3600,
          }),
      })

      // Long-lived token exchange fails (should still work with short-lived token)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Token exchange failed'),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'fb-user-123',
            name: 'Test User',
          }),
      })

      // Pages fetch returns a page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'page-123',
                name: 'Test Page',
                access_token: 'page-access-token',
              },
            ],
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      // Should still succeed with short-lived token
      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('success=facebook')
    })

    it('should clear OAuth cookies on success', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'short-lived-token',
            token_type: 'bearer',
            expires_in: 3600,
          }),
      })

      // Long-lived token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'long-lived-token',
            token_type: 'bearer',
            expires_in: 5184000,
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'fb-user-123',
            name: 'Test User',
          }),
      })

      // Pages fetch returns a page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'page-123',
                name: 'Test Page',
                access_token: 'page-access-token',
              },
            ],
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      // Check that cookies are deleted
      const cookies = response.headers.getSetCookie()
      const cookieNames = ['facebook_oauth_state', 'facebook_oauth_user']

      const clearedCookies = cookies.filter(c =>
        cookieNames.some(name => c.includes(name))
      )

      expect(clearedCookies.length).toBeGreaterThan(0)
    })

    it('should auto-select first page when multiple pages exist', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'short-lived-token',
            token_type: 'bearer',
          }),
      })

      // Long-lived token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'long-lived-token',
            token_type: 'bearer',
            expires_in: 5184000,
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'fb-user-123',
            name: 'Test User',
          }),
      })

      // Pages fetch returns multiple pages
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'page-1',
                name: 'First Page',
                access_token: 'page-1-token',
                category: 'Business',
              },
              {
                id: 'page-2',
                name: 'Second Page',
                access_token: 'page-2-token',
                category: 'Brand',
              },
            ],
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      const upsertMock = vi.fn().mockResolvedValue({ error: null })
      mockSupabase.from = vi.fn(() => ({
        upsert: upsertMock,
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/facebook/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie:
            'facebook_oauth_state=matching-state; facebook_oauth_user=user-123',
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('success=facebook')

      // Verify first page was selected
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          platform_user_id: 'page-1',
          platform_username: 'First Page',
        }),
        expect.anything()
      )
    })
  })
})
