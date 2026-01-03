import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

// Allowlist of safe redirect paths within our app
const ALLOWED_REDIRECTS = [
  '/dashboard',
  '/dashboard/newsletters',
  '/dashboard/newsletters/new',
  '/dashboard/platforms',
  '/dashboard/settings',
]

function isValidRedirect(path: string): boolean {
  // Must start with / (relative path)
  if (!path.startsWith('/')) return false

  // Prevent protocol-relative URLs (//evil.com)
  if (path.startsWith('//')) return false

  // Must be in allowlist or start with allowed prefix
  return ALLOWED_REDIRECTS.some(
    allowed => path === allowed || path.startsWith(`${allowed}/`)
  )
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/dashboard'

  // Validate redirect target - prevent open redirect vulnerability
  const next = isValidRedirect(requestedNext) ? requestedNext : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }

    // OAuth exchange failed - log detailed error and redirect with reason
    logger.error(
      {
        error: error,
        code: code?.substring(0, 10) + '...', // Log partial code for debugging
        message: error.message,
        status: error.status,
      },
      'OAuth code exchange failed'
    )

    // Provide user-friendly error reason in URL
    const errorReason = encodeURIComponent(
      error.message || 'Authentication failed'
    )
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error?reason=${errorReason}`
    )
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
