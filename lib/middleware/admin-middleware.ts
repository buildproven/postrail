/**
 * Admin Middleware
 *
 * Optional middleware for protecting entire route groups with admin authentication.
 * Can be used in middleware.ts or individual route handlers.
 *
 * Usage in middleware.ts:
 * ```typescript
 * import { adminMiddleware } from '@/lib/middleware/admin-middleware'
 *
 * export async function middleware(request: NextRequest) {
 *   // Protect /api/admin/* routes
 *   if (request.nextUrl.pathname.startsWith('/api/admin')) {
 *     return adminMiddleware(request)
 *   }
 * }
 * ```
 *
 * Usage in individual routes:
 * ```typescript
 * import { requireAdmin } from '@/lib/rbac'
 *
 * export async function GET(request: NextRequest) {
 *   const adminCheck = await requireAdmin(request)
 *   if (!adminCheck.authorized) {
 *     return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status })
 *   }
 *   // Admin logic here
 * }
 * ```
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

/**
 * Middleware to protect admin routes
 *
 * Checks authentication and admin role, returns 401/403 if unauthorized.
 * Place this in middleware.ts to protect entire route groups.
 *
 * @param request - Next.js request object
 * @returns NextResponse - Continue or error response
 *
 * @example
 * ```typescript
 * // middleware.ts
 * export async function middleware(request: NextRequest) {
 *   if (request.nextUrl.pathname.startsWith('/api/admin')) {
 *     return adminMiddleware(request)
 *   }
 *   return NextResponse.next()
 * }
 * ```
 */
export async function adminMiddleware(
  request: NextRequest
): Promise<NextResponse> {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role via database query
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role, is_active')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .eq('is_active', true)
      .single()

    if (roleError || !roleData) {
      // Log unauthorized admin access attempt
      logger.warn('Admin middleware: Unauthorized access attempt', {
        userId: user.id,
        email: user.email,
        path: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      })

      return NextResponse.json(
        { error: 'Forbidden: Admin access required' },
        { status: 403 }
      )
    }

    // Success - continue to route handler
    return NextResponse.next()
  } catch (error) {
    logger.error({ error: error }, 'Admin middleware error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Middleware configuration matcher for admin routes
 *
 * Use this in middleware.ts config to apply middleware only to admin routes.
 *
 * @example
 * ```typescript
 * // middleware.ts
 * export const config = {
 *   matcher: [
 *     '/api/admin/:path*',
 *     '/dashboard/admin/:path*'
 *   ]
 * }
 * ```
 */
export const ADMIN_ROUTE_MATCHERS = [
  '/api/admin/:path*',
  '/dashboard/admin/:path*',
]
