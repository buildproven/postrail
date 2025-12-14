/**
 * Mock Supabase client for testing
 */

import { vi } from 'vitest'

export const createMockSupabaseClient = () => {
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
  }

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: mockUser },
        error: null,
      }),
    },
    from: vi.fn((_table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    })),
  }

  return mockSupabase
}

export const mockSupabaseAuthUser = (userId: string, email: string) => ({
  data: {
    user: {
      id: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      created_at: new Date().toISOString(),
    },
  },
  error: null,
})

export const mockSupabaseAuthError = () => ({
  data: { user: null },
  error: { message: 'Unauthorized', status: 401 },
})

export const mockSupabaseInsertSuccess = (data: any) => ({
  data,
  error: null,
})

export const mockSupabaseInsertError = (message: string) => ({
  data: null,
  error: { message, code: 'ERROR' },
})

export const mockSupabaseSelectSuccess = (data: any) => ({
  data,
  error: null,
})

export const mockSupabaseSelectEmpty = () => ({
  data: null,
  error: null,
})
