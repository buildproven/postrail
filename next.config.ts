import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import { validateEnvironmentOrThrow } from './lib/env-validator'

// Validate environment variables at build time - fail fast with clear errors
validateEnvironmentOrThrow()

const nextConfig: NextConfig = {
  /* config options here */
}

const sentryWebpackPluginOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
}

export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig
