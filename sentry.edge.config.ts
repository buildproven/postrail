import * as Sentry from '@sentry/nextjs'

/**
 * Edge runtime Sentry configuration (middleware, edge routes).
 * Enabled when SENTRY_DSN is present.
 */
const SENTRY_DSN = process.env.SENTRY_DSN

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.2,
    debug: false,
  })
}
