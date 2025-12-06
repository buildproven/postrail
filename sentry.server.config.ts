import * as Sentry from '@sentry/nextjs'

/**
 * Server-side Sentry configuration (API routes, server components, server actions).
 * Enabled when SENTRY_DSN is present.
 */
const SENTRY_DSN = process.env.SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.2,
    debug: false,
    ignoreErrors: ['OAuthCallbackError'],
    beforeSend(event, _hint) {
      const userAgent = event.request?.headers?.['user-agent']
      if (userAgent && /bot|crawler|spider/i.test(userAgent)) {
        return null
      }
      return event
    },
  })
}
