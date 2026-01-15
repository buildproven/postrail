/**
 * RBAC (Role-Based Access Control) Utilities
 *
 * Provides secure role checking and authorization for Postrail.
 * Integrates with Supabase auth and user_roles table.
 *
 * Security Design:
 * - Principle of least privilege (users have no role by default)
 * - Defense-in-depth (database RLS + application checks)
 * - Fail-safe defaults (errors deny access)
 * - Audit trail (all checks logged)
 *
 * Usage:
 * ```typescript
 * import { requireAdmin, checkUserRole } from '@/lib/rbac'
 *
 * // In API routes:
 * export async function GET(request: NextRequest) {
 *   const adminCheck = await requireAdmin(request)
 *   if (!adminCheck.authorized) {
 *     return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
 *   }
 * }
 *
 * // For conditional logic:
 * const isAdmin = await checkUserRole(userId, 'admin')
 * ```
 */

import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { logger, security } from '@/lib/logger'
import { z } from 'zod'

/**
 * User role types
 */
export type UserRole = 'admin' | 'user'

// H12 FIX: Zod schemas for validating database casts
const userRoleSchema = z.enum(['admin', 'user'])
const userRoleRecordSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  role: userRoleSchema,
  assigned_at: z.string(),
  assigned_by: z.string().nullable(),
  is_active: z.boolean(),
})

/**
 * Role check result
 */
export interface RoleCheckResult {
  authorized: boolean
  userId?: string
  role?: UserRole
  error?: string
  status?: number
}

/**
 * User role data from database
 */
interface UserRoleRecord {
  id: string
  user_id: string
  role: UserRole
  assigned_at: string
  assigned_by: string | null
  is_active: boolean
}

/**
 * Check if user has specific role
 *
 * @param userId - User ID to check
 * @param role - Role to check for ('admin' | 'user')
 * @returns Promise<boolean> - true if user has role, false otherwise
 *
 * @example
 * ```typescript
 * const isAdmin = await checkUserRole(userId, 'admin')
 * if (isAdmin) {
 *   // Show admin features
 * }
 * ```
 */
export async function checkUserRole(
  userId: string,
  role: UserRole
): Promise<boolean> {
  try {
    const supabase = await createClient()

    // Query user_roles table with RLS enforcement
    const { data, error } = await supabase
      .from('user_roles')
      .select('role, is_active')
      .eq('user_id', userId)
      .eq('role', role)
      .eq('is_active', true)
      .single()

    if (error) {
      // Not found is expected for users without roles
      if (error.code === 'PGRST116') {
        return false
      }
      logger.error({ error: error }, 'RBAC: Role check error')
      return false
    }

    return data?.is_active === true && data?.role === role
  } catch (error) {
    logger.error({ error: error }, 'RBAC: Unexpected error in checkUserRole')
    return false
  }
}

/**
 * Get user's active role
 *
 * @param userId - User ID to check
 * @returns Promise<UserRole | null> - User's role or null if no role assigned
 *
 * @example
 * ```typescript
 * const userRole = await getUserRole(userId)
 * if (userRole === 'admin') {
 *   // User is admin
 * }
 * ```
 */
export async function getUserRole(userId: string): Promise<UserRole | null> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // No role assigned
      }
      logger.error({ error: error }, 'RBAC: Get role error')
      return null
    }

    // H12 FIX: Validate database value before using it
    if (!data?.role) return null
    const validated = userRoleSchema.safeParse(data.role)
    return validated.success ? validated.data : null
  } catch (error) {
    logger.error({ error: error }, 'RBAC: Unexpected error in getUserRole')
    return null
  }
}

/**
 * Require admin role for API route
 *
 * Checks authentication and admin role, returns structured result
 * for consistent error handling.
 *
 * @param request - Next.js request object (optional, for future IP checks)
 * @returns Promise<RoleCheckResult> - Authorization result
 *
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const adminCheck = await requireAdmin(request)
 *   if (!adminCheck.authorized) {
 *     return NextResponse.json(
 *       { error: adminCheck.error },
 *       { status: adminCheck.status }
 *     )
 *   }
 *
 *   // Admin-only logic here
 *   const userId = adminCheck.userId!
 * }
 * ```
 */
export async function requireAdmin(
  request?: NextRequest
): Promise<RoleCheckResult> {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return {
        authorized: false,
        error: 'Unauthorized',
        status: 401,
      }
    }

    // Check admin role
    const isAdmin = await checkUserRole(user.id, 'admin')

    if (!isAdmin) {
      // Log unauthorized admin access attempts for security monitoring
      logger.warn(
        {
          userId: user.id,
          email: user.email,
          timestamp: new Date().toISOString(),
          path: request?.nextUrl?.pathname,
        },
        'RBAC: Unauthorized admin access attempt'
      )

      return {
        authorized: false,
        userId: user.id,
        error: 'Forbidden: Admin access required',
        status: 403,
      }
    }

    // Success
    return {
      authorized: true,
      userId: user.id,
      role: 'admin',
    }
  } catch (error) {
    logger.error({ error: error }, 'RBAC: Unexpected error in requireAdmin')
    return {
      authorized: false,
      error: 'Internal server error',
      status: 500,
    }
  }
}

/**
 * Assign role to user (admin only)
 *
 * @param targetUserId - User ID to assign role to
 * @param role - Role to assign
 * @param assignerUserId - Admin user ID performing assignment
 * @returns Promise<{ success: boolean; error?: string }>
 *
 * @example
 * ```typescript
 * const result = await assignRole(targetUserId, 'admin', adminUserId)
 * if (!result.success) {
 *   logger.error('Failed to assign role:', result.error)
 * }
 * ```
 */
export async function assignRole(
  targetUserId: string,
  role: UserRole,
  assignerUserId: string
): Promise<{ success: boolean; error?: string; roleId?: string }> {
  try {
    // Verify assigner is admin
    const isAssignerAdmin = await checkUserRole(assignerUserId, 'admin')
    if (!isAssignerAdmin) {
      return {
        success: false,
        error: 'Only admins can assign roles',
      }
    }

    const supabase = await createClient()

    // Use database function for atomic role assignment with audit trail
    const { data, error } = await supabase.rpc('assign_role', {
      target_user_id: targetUserId,
      new_role: role,
      assigner_user_id: assignerUserId,
    })

    if (error) {
      logger.error({ error: error }, 'RBAC: Role assignment error')
      return {
        success: false,
        error: error.message || 'Failed to assign role',
      }
    }

    // Log successful role assignment
    logger.info(
      {
        targetUserId,
        role,
        assignerUserId,
        roleId: data,
        timestamp: new Date().toISOString(),
      },
      'RBAC: Role assigned'
    )

    return {
      success: true,
      roleId: data,
    }
  } catch (error) {
    logger.error({ error: error }, 'RBAC: Unexpected error in assignRole')
    return {
      success: false,
      error: 'Internal server error',
    }
  }
}

/**
 * Revoke user's role (admin only)
 *
 * @param targetUserId - User ID to revoke role from
 * @param revokerUserId - Admin user ID performing revocation
 * @returns Promise<{ success: boolean; error?: string }>
 *
 * @example
 * ```typescript
 * const result = await revokeRole(targetUserId, adminUserId)
 * if (!result.success) {
 *   logger.error('Failed to revoke role:', result.error)
 * }
 * ```
 */
export async function revokeRole(
  targetUserId: string,
  revokerUserId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify revoker is admin
    const isRevokerAdmin = await checkUserRole(revokerUserId, 'admin')
    if (!isRevokerAdmin) {
      return {
        success: false,
        error: 'Only admins can revoke roles',
      }
    }

    const supabase = await createClient()

    // Use database function for atomic role revocation
    const { error } = await supabase.rpc('revoke_role', {
      target_user_id: targetUserId,
      revoker_user_id: revokerUserId,
    })

    if (error) {
      logger.error({ error: error }, 'RBAC: Role revocation error')
      return {
        success: false,
        error: error.message || 'Failed to revoke role',
      }
    }

    // Log successful role revocation
    logger.info(
      {
        targetUserId,
        revokerUserId,
        timestamp: new Date().toISOString(),
      },
      'RBAC: Role revoked'
    )

    return {
      success: true,
    }
  } catch (error) {
    logger.error({ error: error }, 'RBAC: Unexpected error in revokeRole')
    return {
      success: false,
      error: 'Internal server error',
    }
  }
}

/**
 * Get all users with roles (admin only)
 *
 * @param adminUserId - Admin user ID requesting list
 * @returns Promise<UserRoleRecord[]> - List of users with roles
 *
 * @example
 * ```typescript
 * const usersWithRoles = await listUsersWithRoles(adminUserId)
 * ```
 */
export async function listUsersWithRoles(
  adminUserId: string
): Promise<UserRoleRecord[]> {
  try {
    // Verify requester is admin
    const isAdmin = await checkUserRole(adminUserId, 'admin')
    if (!isAdmin) {
      logger.warn(
        {
          userId: adminUserId,
        },
        'RBAC: Unauthorized role list access attempt'
      )
      return []
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('is_active', true)
      .order('assigned_at', { ascending: false })

    if (error) {
      logger.error({ error: error }, 'RBAC: List roles error')
      return []
    }

    // H12 FIX: Validate database array before using it
    if (!data || !Array.isArray(data)) return []
    const validated = z.array(userRoleRecordSchema).safeParse(data)
    return validated.success ? validated.data : []
  } catch (error) {
    logger.error(
      { error: error },
      'RBAC: Unexpected error in listUsersWithRoles'
    )
    return []
  }
}

/**
 * RBAC permissions configuration
 *
 * Defines which roles can access which features.
 * Used for fine-grained permission checking beyond role-based access.
 */
export const RBAC_PERMISSIONS = {
  ADMIN: {
    viewSystemStats: true,
    viewAllUsers: true,
    manageRoles: true,
    viewAuditLogs: true,
    manageSystemConfig: true,
  },
  USER: {
    viewSystemStats: false,
    viewAllUsers: false,
    manageRoles: false,
    viewAuditLogs: false,
    manageSystemConfig: false,
  },
} as const

/**
 * Check if user has specific permission
 *
 * @param userId - User ID to check
 * @param permission - Permission key from RBAC_PERMISSIONS
 * @returns Promise<boolean> - true if user has permission
 *
 * @example
 * ```typescript
 * const canViewStats = await checkPermission(userId, 'viewSystemStats')
 * if (canViewStats) {
 *   // Show system statistics
 * }
 * ```
 */
export async function checkPermission(
  userId: string,
  permission: keyof (typeof RBAC_PERMISSIONS)['ADMIN']
): Promise<boolean> {
  try {
    const userRole = await getUserRole(userId)

    if (!userRole) {
      // Log permission denial for users without roles
      security.permissionDenied(userId, permission, undefined, {
        reason: 'no_role',
      })
      return false
    }

    // Check permission based on role (explicit mapping avoids dynamic object indexing)
    const roleKey = userRole.toUpperCase()
    const rolePermissions =
      roleKey === 'ADMIN'
        ? RBAC_PERMISSIONS.ADMIN
        : roleKey === 'USER'
          ? RBAC_PERMISSIONS.USER
          : undefined

    if (!rolePermissions) {
      // Log permission denial for unknown roles
      security.permissionDenied(userId, permission, undefined, {
        reason: 'unknown_role',
        role: userRole,
      })
      return false
    }

    let hasPermission = false
    switch (permission) {
      case 'viewSystemStats':
        hasPermission = rolePermissions.viewSystemStats
        break
      case 'viewAllUsers':
        hasPermission = rolePermissions.viewAllUsers
        break
      case 'manageRoles':
        hasPermission = rolePermissions.manageRoles
        break
      case 'viewAuditLogs':
        hasPermission = rolePermissions.viewAuditLogs
        break
      case 'manageSystemConfig':
        hasPermission = rolePermissions.manageSystemConfig
        break
      default:
        hasPermission = false
    }

    // Log permission denial
    if (!hasPermission) {
      security.permissionDenied(userId, permission, undefined, {
        role: userRole,
      })
    }

    return hasPermission
  } catch (error) {
    logger.error({ error: error }, 'RBAC: Unexpected error in checkPermission')
    return false
  }
}
