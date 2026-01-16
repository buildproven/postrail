import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { clearSystemLimitsCache } from '@/lib/trial-guard'
import { classifyError } from '@/lib/error-classification'
import { requireAdmin } from '@/lib/rbac'

/**
 * POST /api/admin/clear-cache
 *
 * L12 FIX: Clear system limits cache when settings are updated
 * This endpoint should be called after updating system_limits in the database
 *
 * Requires admin role for authorization
 *
 * Future: Could be triggered automatically via database trigger/webhook
 * Future: Could be extended to clear other caches as needed
 *
 * @returns {Promise<NextResponse>} Success message
 * @throws {NextResponse} 401 - Unauthorized
 * @throws {NextResponse} 403 - Not an admin
 */
export async function POST(request: NextRequest) {
  try {
    // Use RBAC to verify admin access
    const adminCheck = await requireAdmin(request)
    if (!adminCheck.authorized) {
      return NextResponse.json(
        { error: adminCheck.error },
        { status: adminCheck.status ?? 403 }
      )
    }

    clearSystemLimitsCache()

    logger.info(
      { userId: adminCheck.userId },
      'System limits cache cleared via admin endpoint'
    )

    return NextResponse.json({
      success: true,
      message: 'System limits cache cleared successfully',
      clearedAt: new Date().toISOString(),
    })
  } catch (error) {
    // CRITICAL FIX: Classify error to provide actionable feedback
    const errorMessage = error instanceof Error ? error.message : String(error)
    const classified = classifyError(errorMessage)

    logger.error(
      {
        error: error instanceof Error ? error : new Error(errorMessage),
        classified,
      },
      'Failed to clear system limits cache'
    )

    // Distinguish between auth and other errors
    if (
      errorMessage.toLowerCase().includes('auth') ||
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('401')
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(
      {
        error: classified.userMessage,
        retryable: classified.retryable,
        suggestedAction: classified.suggestedAction,
      },
      { status: 500 }
    )
  }
}
