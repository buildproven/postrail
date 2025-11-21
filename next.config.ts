import type { NextConfig } from 'next'
import { validateEnvironmentOrThrow } from './lib/env-validator'

// Validate environment variables at build time - fail fast with clear errors
validateEnvironmentOrThrow()

const nextConfig: NextConfig = {
  /* config options here */
}

export default nextConfig
