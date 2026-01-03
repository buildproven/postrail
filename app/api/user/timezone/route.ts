import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { COMMON_TIMEZONES } from '@/lib/scheduling'
import { logger } from '@/lib/logger'

const timezoneSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required'),
})

/**
 * GET /api/user/timezone
 * Get the user's timezone preference
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', user.id)
      .single()

    if (error) {
      logger.error({ error }, 'Failed to fetch timezone:')
      return NextResponse.json(
        { error: 'Failed to fetch timezone' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      timezone: profile?.timezone || 'America/New_York',
      availableTimezones: COMMON_TIMEZONES,
    })
  } catch (error) {
    logger.error({ error }, 'Get timezone error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/user/timezone
 * Update the user's timezone preference
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = timezoneSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      )
    }

    const { timezone } = result.data

    // Validate timezone is a valid IANA timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone })
    } catch {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({ timezone })
      .eq('id', user.id)

    if (error) {
      logger.error({ error }, 'Failed to update timezone:')
      return NextResponse.json(
        { error: 'Failed to update timezone' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      timezone,
    })
  } catch (error) {
    logger.error({ error }, 'Update timezone error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user/timezone/detect
 * Auto-detect and save timezone from browser
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = timezoneSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      )
    }

    const { timezone } = result.data

    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone })
    } catch {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
    }

    // Check if user already has a timezone set (not default)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('timezone')
      .eq('id', user.id)
      .single()

    // Only auto-set if user hasn't manually set one
    // (or if they have the default)
    if (!profile?.timezone || profile.timezone === 'America/New_York') {
      await supabase
        .from('user_profiles')
        .update({ timezone })
        .eq('id', user.id)

      return NextResponse.json({
        success: true,
        timezone,
        autoDetected: true,
      })
    }

    return NextResponse.json({
      success: true,
      timezone: profile.timezone,
      autoDetected: false,
      message: 'Timezone already set by user',
    })
  } catch (error) {
    logger.error({ error }, 'Detect timezone error:')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
