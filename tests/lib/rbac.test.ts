/**
 * RBAC (Role-Based Access Control) Unit Tests
 *
 * Tests role checking, permission validation, and admin authorization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkUserRole,
  getUserRole,
  requireAdmin,
  assignRole,
  revokeRole,
  checkPermission,
  listUsersWithRoles,
  RBAC_PERMISSIONS,
} from '@/lib/rbac'

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock Next.js request
const mockRequest = {
  nextUrl: {
    pathname: '/api/admin/test',
  },
} as any

describe('RBAC - Role Checking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('checkUserRole', () => {
    it('should return true when user has specified role', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { role: 'admin', is_active: true },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await checkUserRole('user-123', 'admin')
      expect(result).toBe(true)
    })

    it('should return false when user does not have role', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116', message: 'Not found' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await checkUserRole('user-123', 'admin')
      expect(result).toBe(false)
    })

    it('should return false when role is inactive', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { role: 'admin', is_active: false },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await checkUserRole('user-123', 'admin')
      expect(result).toBe(false)
    })

    it('should return false on database error', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST500', message: 'Database error' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const { logger } = await import('@/lib/logger')

      const result = await checkUserRole('user-123', 'admin')
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        'RBAC: Role check error:',
        expect.objectContaining({ code: 'PGRST500' })
      )
    })
  })

  describe('getUserRole', () => {
    it('should return user role when active role exists', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await getUserRole('user-123')
      expect(result).toBe('admin')
    })

    it('should return null when no role assigned', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116', message: 'Not found' },
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await getUserRole('user-123')
      expect(result).toBeNull()
    })
  })

  describe('requireAdmin', () => {
    it('should authorize admin users', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'admin-123', email: 'admin@example.com' },
            },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { role: 'admin', is_active: true },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await requireAdmin(mockRequest)
      expect(result.authorized).toBe(true)
      expect(result.userId).toBe('admin-123')
      expect(result.role).toBe('admin')
    })

    it('should reject unauthenticated requests', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Not authenticated' },
          }),
        },
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await requireAdmin(mockRequest)
      expect(result.authorized).toBe(false)
      expect(result.error).toBe('Unauthorized')
      expect(result.status).toBe(401)
    })

    it('should reject non-admin users', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: { id: 'user-123', email: 'user@example.com' },
            },
            error: null,
          }),
        },
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116', message: 'Not found' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const { logger } = await import('@/lib/logger')

      const result = await requireAdmin(mockRequest)
      expect(result.authorized).toBe(false)
      expect(result.error).toBe('Forbidden: Admin access required')
      expect(result.status).toBe(403)
      expect(logger.warn).toHaveBeenCalledWith(
        'RBAC: Unauthorized admin access attempt',
        expect.objectContaining({ userId: 'user-123' })
      )
    })
  })

  describe('assignRole', () => {
    it('should allow admins to assign roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { role: 'admin', is_active: true },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockResolvedValue({
          data: 'role-uuid-123',
          error: null,
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await assignRole('target-user-123', 'admin', 'admin-123')
      expect(result.success).toBe(true)
      expect(result.roleId).toBe('role-uuid-123')
      expect(mockSupabase.rpc).toHaveBeenCalledWith('assign_role', {
        target_user_id: 'target-user-123',
        new_role: 'admin',
        assigner_user_id: 'admin-123',
      })
    })

    it('should prevent non-admins from assigning roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116', message: 'Not found' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await assignRole('target-user-123', 'admin', 'user-123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Only admins can assign roles')
    })
  })

  describe('revokeRole', () => {
    it('should allow admins to revoke roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { role: 'admin', is_active: true },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
        rpc: vi.fn().mockResolvedValue({
          data: true,
          error: null,
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await revokeRole('target-user-123', 'admin-123')
      expect(result.success).toBe(true)
      expect(mockSupabase.rpc).toHaveBeenCalledWith('revoke_role', {
        target_user_id: 'target-user-123',
        revoker_user_id: 'admin-123',
      })
    })

    it('should prevent non-admins from revoking roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116', message: 'Not found' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await revokeRole('target-user-123', 'user-123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Only admins can revoke roles')
    })
  })

  describe('checkPermission', () => {
    it('should grant admin permissions to admin users', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const canViewStats = await checkPermission('admin-123', 'viewSystemStats')
      expect(canViewStats).toBe(true)

      const canManageRoles = await checkPermission('admin-123', 'manageRoles')
      expect(canManageRoles).toBe(true)
    })

    it('should deny admin permissions to regular users', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { role: 'user' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const canViewStats = await checkPermission('user-123', 'viewSystemStats')
      expect(canViewStats).toBe(false)

      const canManageRoles = await checkPermission('user-123', 'manageRoles')
      expect(canManageRoles).toBe(false)
    })

    it('should deny permissions to users without roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { code: 'PGRST116', message: 'Not found' },
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const canViewStats = await checkPermission(
        'no-role-user',
        'viewSystemStats'
      )
      expect(canViewStats).toBe(false)
    })
  })

  describe('listUsersWithRoles', () => {
    it('should allow admins to list users with roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockRoles = [
        {
          id: 'role-1',
          user_id: 'user-1',
          role: 'admin',
          assigned_at: '2025-11-21T00:00:00Z',
          assigned_by: 'admin-123',
          is_active: true,
        },
        {
          id: 'role-2',
          user_id: 'user-2',
          role: 'user',
          assigned_at: '2025-11-21T01:00:00Z',
          assigned_by: 'admin-123',
          is_active: true,
        },
      ]

      const mockSupabase = {
        from: vi
          .fn()
          .mockReturnValueOnce({
            // First call: check if requester is admin
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { role: 'admin', is_active: true },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            // Second call: fetch all roles
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockRoles,
                  error: null,
                }),
              }),
            }),
          }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const result = await listUsersWithRoles('admin-123')
      expect(result).toHaveLength(2)
      expect(result[0].role).toBe('admin')
      expect(result[1].role).toBe('user')
    })

    it('should prevent non-admins from listing roles', async () => {
      const { createClient } = await import('@/lib/supabase/server')
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST116', message: 'Not found' },
                  }),
                }),
              }),
            }),
          }),
        }),
      }
      vi.mocked(createClient).mockResolvedValue(mockSupabase as any)

      const { logger } = await import('@/lib/logger')

      const result = await listUsersWithRoles('user-123')
      expect(result).toEqual([])
      expect(logger.warn).toHaveBeenCalledWith(
        'RBAC: Unauthorized role list access attempt',
        expect.objectContaining({ userId: 'user-123' })
      )
    })
  })

  describe('RBAC_PERMISSIONS', () => {
    it('should have correct admin permissions', () => {
      expect(RBAC_PERMISSIONS.ADMIN.viewSystemStats).toBe(true)
      expect(RBAC_PERMISSIONS.ADMIN.viewAllUsers).toBe(true)
      expect(RBAC_PERMISSIONS.ADMIN.manageRoles).toBe(true)
      expect(RBAC_PERMISSIONS.ADMIN.viewAuditLogs).toBe(true)
      expect(RBAC_PERMISSIONS.ADMIN.manageSystemConfig).toBe(true)
    })

    it('should have correct user permissions', () => {
      expect(RBAC_PERMISSIONS.USER.viewSystemStats).toBe(false)
      expect(RBAC_PERMISSIONS.USER.viewAllUsers).toBe(false)
      expect(RBAC_PERMISSIONS.USER.manageRoles).toBe(false)
      expect(RBAC_PERMISSIONS.USER.viewAuditLogs).toBe(false)
      expect(RBAC_PERMISSIONS.USER.manageSystemConfig).toBe(false)
    })
  })
})
