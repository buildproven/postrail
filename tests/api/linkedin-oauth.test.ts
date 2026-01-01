/**
 * LinkedIn OAuth 2.0 Integration Tests
 *
 * Tests for /api/platforms/linkedin/auth and /api/platforms/linkedin/callback
 * Covers OAuth 2.0 flow, state validation, token exchange, and credential storage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  createMockSupabaseClient,
  mockSupabaseAuthUser,
  mockSupabaseAuthError,
} from '../mocks/supabase'
import { signValue } from '@/lib/cookie-signer'

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock crypto encryption
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn((text: string) => `encrypted:${text}`),
  decrypt: vi.fn((text: string) => text.replace('encrypted:', '')),
}))

// Helper to create signed OAuth cookies for LinkedIn tests
// LinkedIn uses createOAuthState which adds timestamp to state
function createSignedLinkedInCookies(state: string, userId: string): string {
  // State format in cookie: state.timestamp (then signed)
  const stateWithTimestamp = `${state}.${Date.now()}`
  const signedState = signValue(stateWithTimestamp)
  const signedUserId = signValue(userId)
  return `linkedin_oauth_state=${signedState}; linkedin_oauth_user=${signedUserId}`
}

// Helper for partial cookies
function createPartialSignedLinkedInCookies(options: {
  state?: string
  userId?: string
}): string {
  const parts: string[] = []
  if (options.state !== undefined) {
    const stateWithTimestamp = `${options.state}.${Date.now()}`
    parts.push(`linkedin_oauth_state=${signValue(stateWithTimestamp)}`)
  }
  if (options.userId !== undefined) {
    parts.push(`linkedin_oauth_user=${signValue(options.userId)}`)
  }
  return parts.join('; ')
}

// Mock fetch for LinkedIn API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

import { createClient } from '@/lib/supabase/server'
import { GET as authHandler } from '@/app/api/platforms/linkedin/auth/route'
import { GET as callbackHandler } from '@/app/api/platforms/linkedin/callback/route'

describe('/api/platforms/linkedin/auth - OAuth Initiation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
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
    it('should return 500 when LINKEDIN_CLIENT_ID is missing', async () => {
      delete process.env.LINKEDIN_CLIENT_ID

      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toContain('LINKEDIN_CLIENT_ID')
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
    it('should redirect to LinkedIn authorization URL with correct parameters', async () => {
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.auth.getUser.mockResolvedValue(
        mockSupabaseAuthUser('user-123', 'test@example.com')
      )
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const response = await authHandler()

      expect(response.status).toBe(307) // Redirect
      const location = response.headers.get('location')
      expect(location).toContain(
        'https://www.linkedin.com/oauth/v2/authorization'
      )
      expect(location).toContain('response_type=code')
      expect(location).toContain('client_id=test-client-id')
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

      expect(scope).toContain('openid')
      expect(scope).toContain('profile')
      expect(scope).toContain('w_member_social')
      expect(scope).toContain('w_organization_social')
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
      const stateCookie = cookies.find(c => c.includes('linkedin_oauth_state='))
      expect(stateCookie).toBeDefined()
      expect(stateCookie).toContain('HttpOnly')

      // Check that user cookie is set
      const userCookie = cookies.find(c => c.includes('linkedin_oauth_user='))
      expect(userCookie).toBeDefined()
      expect(userCookie).toContain('HttpOnly')
    })
  })
})

describe('/api/platforms/linkedin/callback - OAuth Callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockReset()
    process.env.LINKEDIN_CLIENT_ID = 'test-client-id'
    process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret'
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  describe('Error Handling', () => {
    it('should redirect with error when LinkedIn returns OAuth error', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/callback?error=access_denied&error_description=User%20denied%20access'
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
        'http://localhost:3000/api/platforms/linkedin/callback?state=abc123'
      )

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('error=')
    })

    it('should redirect with error when state is missing', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/platforms/linkedin/callback?code=auth-code-123'
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
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'incoming-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('different-state', 'user-123'),
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('State%20mismatch')
    })

    it('should reject request when state cookie is missing', async () => {
      const url = new URL(
        'http://localhost:3000/api/platforms/linkedin/callback'
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
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createPartialSignedLinkedInCookies({
            state: 'matching-state',
          }),
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
    it('should redirect with error when LINKEDIN_CLIENT_ID is missing', async () => {
      delete process.env.LINKEDIN_CLIENT_ID

      const url = new URL(
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('not%20configured')
    })

    it('should redirect with error when LINKEDIN_CLIENT_SECRET is missing', async () => {
      delete process.env.LINKEDIN_CLIENT_SECRET

      const url = new URL(
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
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
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
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
            expires_in: 3600,
            scope: 'openid profile w_member_social',
          }),
      })

      // User info fetch fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      })

      const url = new URL(
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
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
            expires_in: 3600,
            scope: 'openid profile w_member_social w_organization_social',
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: 'linkedin-user-123',
            name: 'Test User',
            email: 'test@example.com',
            picture: 'https://linkedin.com/profile.jpg',
          }),
      })

      // Organizations fetch succeeds (empty list is valid)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            elements: [],
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('/dashboard/platforms')
      expect(location).toContain('success=linkedin')

      // Verify token exchange was called
      expect(mockFetch).toHaveBeenCalledTimes(3)
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://www.linkedin.com/oauth/v2/accessToken',
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
        'https://api.linkedin.com/v2/userinfo',
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
            expires_in: 3600,
            scope: 'openid profile w_member_social',
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: 'linkedin-user-123',
            name: 'Test User',
          }),
      })

      // Organizations fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            elements: [],
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
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
        },
      })

      const response = await callbackHandler(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('error=')
      expect(location).toContain('save')
    })

    it('should handle organizations fetch failure gracefully', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-token-123',
            expires_in: 3600,
            scope: 'openid profile w_member_social',
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: 'linkedin-user-123',
            name: 'Test User',
          }),
      })

      // Organizations fetch fails (should still succeed)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Not authorized'),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
        },
      })

      const response = await callbackHandler(request)

      // Should still succeed even if org fetch fails
      expect(response.status).toBe(307)
      const location = response.headers.get('location')
      expect(location).toContain('success=linkedin')
    })

    it('should clear OAuth cookies on success', async () => {
      // Token exchange succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'access-token-123',
            expires_in: 3600,
            scope: 'openid profile w_member_social',
          }),
      })

      // User info fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sub: 'linkedin-user-123',
            name: 'Test User',
          }),
      })

      // Organizations fetch succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            elements: [],
          }),
      })

      // Mock Supabase
      const mockSupabase = createMockSupabaseClient()
      mockSupabase.from = vi.fn(() => ({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      })) as any
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const url = new URL(
        'http://localhost:3000/api/platforms/linkedin/callback'
      )
      url.searchParams.set('code', 'auth-code-123')
      url.searchParams.set('state', 'matching-state')

      const request = new NextRequest(url, {
        headers: {
          cookie: createSignedLinkedInCookies('matching-state', 'user-123'),
        },
      })

      const response = await callbackHandler(request)

      // Check that cookies are deleted
      const cookies = response.headers.getSetCookie()
      const cookieNames = ['linkedin_oauth_state', 'linkedin_oauth_user']

      const clearedCookies = cookies.filter(c =>
        cookieNames.some(name => c.includes(name))
      )

      expect(clearedCookies.length).toBeGreaterThan(0)
    })
  })
})
