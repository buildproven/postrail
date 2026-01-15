import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { security, logger } from '@/lib/logger'

/**
 * Server-side logout endpoint for security logging
 *
 * Logs logout events before terminating the session.
 * Client should call this before calling supabase.auth.signOut()
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get user data before logout
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Log logout event
    security.logout(user.id, {
      ip:
        request.headers.get('x-forwarded-for') ??
        request.headers.get('x-real-ip') ??
        undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    })

    // Perform logout
    const { error } = await supabase.auth.signOut()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Logout endpoint error')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
