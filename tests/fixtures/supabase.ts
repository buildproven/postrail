/**
 * Test Fixtures - Supabase Mocks
 * Reusable mock factories for Supabase clients across all tests
 */

import { vi } from 'vitest'

/**
 * Create a mock query builder with full method chain
 */
export function createMockQueryBuilder(overrides?: {
  data?: any
  error?: any
  count?: number | null
}) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: overrides?.data ?? null, error: overrides?.error ?? null }),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({ data: overrides?.data ?? null, error: overrides?.error ?? null }),
  }

  // Add count property for select with count
  if (overrides?.count !== undefined) {
    Object.defineProperty(builder, 'count', {
      value: overrides.count,
      writable: true,
    })
  }

  return builder
}

/**
 * Create a mock Supabase client for server/service operations
 */
export function createMockSupabaseClient(options?: {
  user?: { id: string; email: string } | null
  authError?: any
  queryData?: any
  queryError?: any
  queryCount?: number | null
}) {
  return {
    auth: {
      getUser: vi.fn(() => ({
        data: { user: options?.user ?? { id: 'test-user-id', email: 'test@example.com' } },
        error: options?.authError ?? null,
      })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
    },
    from: vi.fn(() =>
      createMockQueryBuilder({
        data: options?.queryData,
        error: options?.queryError,
        count: options?.queryCount,
      })
    ),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

/**
 * Create mock for server client module
 */
export function createMockServerModule(mockClient: any) {
  return {
    createClient: vi.fn(() => mockClient),
  }
}

/**
 * Create mock for service client module
 */
export function createMockServiceModule(mockClient: any) {
  return {
    createServiceClient: vi.fn(() => mockClient),
  }
}

/**
 * Create authenticated user context for tests
 */
export function createTestUser(overrides?: {
  id?: string
  email?: string
  subscription_tier?: 'trial' | 'standard' | 'growth'
}) {
  return {
    id: overrides?.id ?? 'test-user-id',
    email: overrides?.email ?? 'test@example.com',
    subscription_tier: overrides?.subscription_tier ?? 'trial',
  }
}

/**
 * Create unauthenticated context for tests
 */
export function createUnauthenticatedContext() {
  return {
    user: null,
    error: { message: 'Not authenticated' },
  }
}
