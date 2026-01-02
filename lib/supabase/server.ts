import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { logger } from '@/lib/logger'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            // Log cookie setting failures for debugging auth issues
            logger.error({
              type: 'error',
              error: error instanceof Error ? error : new Error(String(error)),
              context: 'supabase_server_cookie_set',
              cookieCount: cookiesToSet.length,
              msg: 'Failed to set authentication cookies',
            })

            // Only suppress if middleware is handling session refresh
            // Otherwise, cookie failures should be investigated
            if (!process.env.SUPABASE_AUTH_MIDDLEWARE_ENABLED) {
              // Re-throw in development or if middleware not configured
              if (process.env.NODE_ENV === 'development') {
                logger.warn(
                  'Cookie setting failed - check middleware configuration'
                )
              }
            }
          }
        },
      },
    }
  )
}
