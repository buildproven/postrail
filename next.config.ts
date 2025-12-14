import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import * as dotenv from 'dotenv'
import { validateEnvironmentOrThrow } from './lib/env-validator'

// Load .env files before validation (Next.js hasn't loaded them yet at config time)
// Use dotenv directly as @next/env has issues with certain key formats
// override: true forces re-reading even if vars exist (they might be empty)
dotenv.config({ path: '.env.local', override: true })
dotenv.config({ path: '.env.production.local', override: true })

// Validate environment variables at build time - fail fast with clear errors
validateEnvironmentOrThrow()

const nextConfig: NextConfig = {
  // Skip static generation for error pages (known Next.js 16 + Sentry issue)
  experimental: {
    staticGenerationRetryCount: 0,
  },
}

const sentryWebpackPluginOptions = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
}

export default process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryWebpackPluginOptions)
  : nextConfig
