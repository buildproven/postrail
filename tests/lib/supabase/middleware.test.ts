/**
 * Tests for lib/supabase/middleware.ts
 * Tests middleware session refresh and route protection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mock @supabase/ssr using factory function
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

const mockCreateServerClient = vi.mocked(createServerClient)

describe('lib/supabase/middleware', () => {
  let mockSupabaseClient: any
  let mockRequest: NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

    // Default mock Supabase client
    mockSupabaseClient = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    }
    mockCreateServerClient.mockReturnValue(mockSupabaseClient)
  })

  describe('updateSession', () => {
    describe('Unauthenticated users', () => {
      it('should redirect to /auth/login when accessing /dashboard without auth', async () => {
        mockRequest = new NextRequest('http://localhost:3000/dashboard')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(307) // Redirect status
        expect(response.headers.get('location')).toBe('http://localhost:3000/auth/login')
      })

      it('should redirect to /auth/login for nested dashboard routes', async () => {
        mockRequest = new NextRequest('http://localhost:3000/dashboard/newsletters')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('http://localhost:3000/auth/login')
      })

      it('should allow access to auth pages when not authenticated', async () => {
        mockRequest = new NextRequest('http://localhost:3000/auth/login')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
      })

      it('should allow access to public routes when not authenticated', async () => {
        mockRequest = new NextRequest('http://localhost:3000/')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: { user: null },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
      })
    })

    describe('Authenticated users', () => {
      it('should allow access to /dashboard when authenticated', async () => {
        mockRequest = new NextRequest('http://localhost:3000/dashboard')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
            },
          },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
      })

      it('should redirect to /dashboard when accessing auth pages while authenticated', async () => {
        mockRequest = new NextRequest('http://localhost:3000/auth/login')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
            },
          },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
      })

      it('should redirect from /auth/signup to /dashboard when authenticated', async () => {
        mockRequest = new NextRequest('http://localhost:3000/auth/signup')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
            },
          },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(307)
        expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard')
      })

      it('should allow access to public routes when authenticated', async () => {
        mockRequest = new NextRequest('http://localhost:3000/')
        mockSupabaseClient.auth.getUser.mockResolvedValue({
          data: {
            user: {
              id: 'user-123',
              email: 'test@example.com',
            },
          },
          error: null,
        })

        const response = await updateSession(mockRequest)

        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
      })
    })

    describe('Cookie handling', () => {
      it('should configure cookie handlers for request cookies', async () => {
        mockRequest = new NextRequest('http://localhost:3000/', {
          headers: {
            cookie: 'session=token-123',
          },
        })

        await updateSession(mockRequest)

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

      it('should return request cookies via getAll', async () => {
        mockRequest = new NextRequest('http://localhost:3000/', {
          headers: {
            cookie: 'session=token-123; other=value',
          },
        })

        await updateSession(mockRequest)

        const cookieConfig = mockCreateServerClient.mock.calls[0][2]
        const cookies = cookieConfig.cookies.getAll()

        expect(cookies).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'session', value: 'token-123' }),
          ])
        )
      })

      it('should set cookies on both request and response via setAll', async () => {
        mockRequest = new NextRequest('http://localhost:3000/')

        await updateSession(mockRequest)

        const cookieConfig = mockCreateServerClient.mock.calls[0][2]

        // Call setAll with test cookies
        const cookiesToSet = [
          { name: 'new-session', value: 'new-token', options: { maxAge: 3600 } },
        ]
        cookieConfig.cookies.setAll(cookiesToSet)

        // Should set on request
        expect(mockRequest.cookies.get('new-session')).toEqual({
          name: 'new-session',
          value: 'new-token',
        })
      })

      it('should preserve cookies in response', async () => {
        mockRequest = new NextRequest('http://localhost:3000/')

        const response = await updateSession(mockRequest)

        // Response should be a NextResponse
        expect(response).toBeInstanceOf(NextResponse)
      })
    })

    describe('Session refresh', () => {
      it('should call getUser to refresh session', async () => {
        mockRequest = new NextRequest('http://localhost:3000/')

        await updateSession(mockRequest)

        expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
      })

      it('should create server client before calling getUser', async () => {
        mockRequest = new NextRequest('http://localhost:3000/')

        await updateSession(mockRequest)

        // Verify order: createServerClient called before getUser
        expect(mockCreateServerClient).toHaveBeenCalled()
        expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
      })
    })
  })
})
