/**
 * Environment Variable Validator
 *
 * Validates required environment variables at startup and fails fast
 * with clear error messages if any are missing or malformed.
 *
 * This prevents runtime failures and provides immediate feedback
 * during development and deployment.
 */

interface EnvConfig {
  name: string
  required: boolean
  validator?: (value: string) => { valid: boolean; message?: string }
  description: string
}

const ENV_CONFIGS: EnvConfig[] = [
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    required: true,
    validator: (value: string) => {
      if (!value.startsWith('https://')) {
        return { valid: false, message: 'Must be a valid HTTPS URL' }
      }
      if (!value.includes('supabase')) {
        return { valid: false, message: 'Must be a valid Supabase URL' }
      }
      return { valid: true }
    },
    description: 'Supabase project URL (found in your Supabase dashboard)',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    required: true,
    validator: (value: string) => {
      if (value.length < 100) {
        return {
          valid: false,
          message: 'Appears to be too short for a valid Supabase anon key',
        }
      }
      return { valid: true }
    },
    description: 'Supabase anonymous key (found in your Supabase dashboard)',
  },
  {
    name: 'ANTHROPIC_API_KEY',
    required: true,
    validator: (value: string) => {
      if (!value.startsWith('sk-ant-')) {
        return { valid: false, message: 'Must start with "sk-ant-"' }
      }
      if (value.length < 50) {
        return {
          valid: false,
          message: 'Appears to be too short for a valid Anthropic API key',
        }
      }
      return { valid: true }
    },
    description:
      'Anthropic Claude API key (get from https://console.anthropic.com/)',
  },
  {
    name: 'ENCRYPTION_KEY',
    required: true,
    validator: (value: string) => {
      // Must be exactly 64 hex characters (32 bytes) for AES-256
      if (!/^[0-9a-fA-F]{64}$/.test(value)) {
        return {
          valid: false,
          message:
            "Must be exactly 64 hexadecimal characters (32 bytes) for AES-256. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
        }
      }
      return { valid: true }
    },
    description:
      'AES-256 encryption key (64 hex chars). Generate with crypto.randomBytes(32).toString("hex")',
  },
  {
    name: 'RATE_LIMIT_MODE',
    required: false,
    validator: (value: string) => {
      if (!['memory', 'redis', 'disabled'].includes(value)) {
        return {
          valid: false,
          message: 'Must be one of: memory, redis, disabled',
        }
      }
      return { valid: true }
    },
    description:
      'Rate limiting mode: "redis" (distributed), "memory" (per-instance), or "disabled" (development only)',
  },
  {
    name: 'ENABLE_STATUS_ENDPOINTS',
    required: false,
    validator: (value: string) => {
      if (!['true', 'false'].includes(value.toLowerCase())) {
        return { valid: false, message: 'Must be "true" or "false"' }
      }
      return { valid: true }
    },
    description:
      'Enable self-service rate limit and SSRF status endpoints (default: false, must be explicitly enabled)',
  },
  {
    name: 'ENABLE_MONITORING_ENDPOINT',
    required: false,
    validator: (value: string) => {
      if (!['true', 'false'].includes(value.toLowerCase())) {
        return { valid: false, message: 'Must be "true" or "false"' }
      }
      return { valid: true }
    },
    description:
      'Enable admin monitoring endpoint with system metrics and logs (default: false, admin-only)',
  },
]

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export function validateEnvironment(): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  console.log('🔍 Validating environment variables...')

  for (const config of ENV_CONFIGS) {
    const value = process.env[config.name]

    if (config.required && !value) {
      errors.push(`❌ ${config.name} is required but not set`)
      errors.push(`   📝 ${config.description}`)
      continue
    }

    if (value && config.validator) {
      const validation = config.validator(value)
      if (!validation.valid) {
        errors.push(`❌ ${config.name} is invalid: ${validation.message}`)
        errors.push(`   📝 ${config.description}`)
      }
    }

    if (value) {
      console.log(`✅ ${config.name}: OK`)
    }
  }

  // Additional checks for development vs production
  const nodeEnv = process.env.NODE_ENV
  if (nodeEnv === 'production') {
    // In production, all required vars must be present
    if (errors.length > 0) {
      errors.unshift('🚨 PRODUCTION ENVIRONMENT VALIDATION FAILED')
    }
  } else {
    // In development, provide helpful guidance
    if (errors.length > 0) {
      errors.unshift('🔧 DEVELOPMENT ENVIRONMENT SETUP NEEDED')
      errors.push('')
      errors.push('💡 Quick setup:')
      errors.push('   1. Copy .env.local.example to .env.local (if it exists)')
      errors.push('   2. Fill in the missing environment variables')
      errors.push('   3. Restart the development server')
    }
  }

  const result = {
    valid: errors.length === 0,
    errors,
    warnings,
  }

  if (result.valid) {
    console.log('✅ Environment validation passed')
  } else {
    console.error('❌ Environment validation failed')
    result.errors.forEach(error => console.error(error))
  }

  return result
}

/**
 * Validates environment and throws if invalid
 * Use this in next.config.ts or other startup files
 */
export function validateEnvironmentOrThrow(): void {
  const result = validateEnvironment()

  if (!result.valid) {
    console.error('\n💥 STARTUP FAILED: Environment validation errors detected')
    console.error('Fix the above environment variable issues and restart.\n')
    process.exit(1)
  }
}

/**
 * Non-throwing version for runtime checks
 * Returns true if valid, false if invalid
 */
export function isEnvironmentValid(): boolean {
  const result = validateEnvironment()
  return result.valid
}
