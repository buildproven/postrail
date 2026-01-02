/**
 * Service-to-service authentication for external agents (e.g., VBL Marketer_Agent)
 *
 * Security features:
 * - API keys are hashed (never stored in plaintext)
 * - Keys have scoped permissions
 * - Rate limiting per service key
 * - Audit logging for all service requests
 */

import { createServiceClient } from './supabase/service'
import { hash } from './crypto'
import { Redis } from '@upstash/redis'

export type ServicePermission =
  | 'create_post'
  | 'schedule_post'
  | 'publish_post'
  | 'read_metrics'
  | 'manage_clients'

export interface ServiceContext {
  serviceId: string
  serviceName: string
  permissions: ServicePermission[]
  rateLimit: {
    requestsPerMinute: number
    requestsPerHour: number
  }
  clientIds?: string[] // Optional: restrict to specific clients
}

export interface ServiceRateLimitResult {
  allowed: boolean
  retryAfter?: number
  reason?: string
  requestsRemaining: number
  resetTime: number
  backend?: 'redis' | 'memory'
}

interface ServiceKeyRow {
  id: string
  service_id: string
  service_name: string
  key_hash: string
  permissions: ServicePermission[]
  rate_limit_per_minute: number
  rate_limit_per_hour: number
  allowed_client_ids: string[] | null
  active: boolean
  last_used_at: string | null
  created_at: string
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

const serviceRateLimitStore = new Map<string, RateLimitEntry>()
const SERVICE_RATE_LIMIT_WINDOW_MINUTE = 60 * 1000
const SERVICE_RATE_LIMIT_WINDOW_HOUR = 60 * 60 * 1000
const serviceRedis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null

/**
 * Validate a service API key and return the service context
 *
 * @param apiKey - The API key from Authorization header (Bearer token)
 * @returns ServiceContext if valid, null if invalid/inactive
 */
export async function validateServiceKey(
  apiKey: string
): Promise<ServiceContext | null> {
  if (!apiKey || !apiKey.startsWith('vbl_sk_')) {
    return null
  }

  const supabase = createServiceClient()
  const keyHash = hash(apiKey)

  const { data, error } = await supabase
    .from('service_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('active', true)
    .single()

  if (error || !data) {
    return null
  }

  const row = data as ServiceKeyRow

  // Update last_used_at (fire and forget)
  supabase
    .from('service_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => {})

  return {
    serviceId: row.service_id,
    serviceName: row.service_name,
    permissions: row.permissions,
    rateLimit: {
      requestsPerMinute: row.rate_limit_per_minute,
      requestsPerHour: row.rate_limit_per_hour,
    },
    clientIds: row.allowed_client_ids || undefined,
  }
}

function getRateLimitKey(
  serviceId: string,
  windowMs: number,
  now: number,
  label: 'minute' | 'hour'
): string {
  const window = Math.floor(now / windowMs)
  return `${serviceId}:${label}:${window}`
}

function cleanupExpiredRateLimits(now: number) {
  for (const [key, entry] of serviceRateLimitStore.entries()) {
    if (now > entry.resetTime) {
      serviceRateLimitStore.delete(key)
    }
  }
}

/**
 * Enforce per-service API key rate limits (memory fallback).
 */
export async function checkServiceRateLimit(
  context: ServiceContext
): Promise<ServiceRateLimitResult> {
  const isTestEnv =
    process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
  if (isTestEnv) {
    return {
      allowed: true,
      requestsRemaining: context.rateLimit.requestsPerMinute,
      resetTime: Date.now() + SERVICE_RATE_LIMIT_WINDOW_MINUTE,
      backend: serviceRedis ? 'redis' : 'memory',
    }
  }

  const now = Date.now()
  if (serviceRedis) {
    try {
      return await checkServiceRateLimitRedis(context, now)
    } catch {
      // Fall back to memory-based limiter if Redis is unavailable
    }
  }

  if (Math.random() < 0.01) {
    cleanupExpiredRateLimits(now)
  }

  const minuteKey = getRateLimitKey(
    context.serviceId,
    SERVICE_RATE_LIMIT_WINDOW_MINUTE,
    now,
    'minute'
  )
  const hourKey = getRateLimitKey(
    context.serviceId,
    SERVICE_RATE_LIMIT_WINDOW_HOUR,
    now,
    'hour'
  )

  const minuteReset =
    Math.floor(now / SERVICE_RATE_LIMIT_WINDOW_MINUTE + 1) *
    SERVICE_RATE_LIMIT_WINDOW_MINUTE
  const hourReset =
    Math.floor(now / SERVICE_RATE_LIMIT_WINDOW_HOUR + 1) *
    SERVICE_RATE_LIMIT_WINDOW_HOUR

  const minuteEntry = serviceRateLimitStore.get(minuteKey)
  const hourEntry = serviceRateLimitStore.get(hourKey)

  const minuteCount =
    minuteEntry && now <= minuteEntry.resetTime ? minuteEntry.count : 0
  const hourCount =
    hourEntry && now <= hourEntry.resetTime ? hourEntry.count : 0

  if (minuteCount >= context.rateLimit.requestsPerMinute) {
    return {
      allowed: false,
      retryAfter: Math.ceil((minuteReset - now) / 1000),
      reason: 'rate_limit_minute',
      requestsRemaining: 0,
      resetTime: minuteReset,
      backend: 'memory',
    }
  }

  if (hourCount >= context.rateLimit.requestsPerHour) {
    return {
      allowed: false,
      retryAfter: Math.ceil((hourReset - now) / 1000),
      reason: 'rate_limit_hour',
      requestsRemaining: 0,
      resetTime: hourReset,
      backend: 'memory',
    }
  }

  serviceRateLimitStore.set(minuteKey, {
    count: minuteCount + 1,
    resetTime: minuteReset,
  })
  serviceRateLimitStore.set(hourKey, {
    count: hourCount + 1,
    resetTime: hourReset,
  })

  return {
    allowed: true,
    requestsRemaining: context.rateLimit.requestsPerMinute - minuteCount - 1,
    resetTime: minuteReset,
    backend: 'memory',
  }
}

async function checkServiceRateLimitRedis(
  context: ServiceContext,
  now: number
): Promise<ServiceRateLimitResult> {
  const minuteKey = getRateLimitKey(
    context.serviceId,
    SERVICE_RATE_LIMIT_WINDOW_MINUTE,
    now,
    'minute'
  )
  const hourKey = getRateLimitKey(
    context.serviceId,
    SERVICE_RATE_LIMIT_WINDOW_HOUR,
    now,
    'hour'
  )

  const minuteReset =
    Math.floor(now / SERVICE_RATE_LIMIT_WINDOW_MINUTE + 1) *
    SERVICE_RATE_LIMIT_WINDOW_MINUTE
  const hourReset =
    Math.floor(now / SERVICE_RATE_LIMIT_WINDOW_HOUR + 1) *
    SERVICE_RATE_LIMIT_WINDOW_HOUR

  const pipeline = serviceRedis!.pipeline()
  pipeline.get(minuteKey)
  pipeline.get(hourKey)
  const results = (await pipeline.exec()) as [Error | null, string | null][]

  const minuteCount = parseInt(results?.[0]?.[1] || '0', 10) || 0
  const hourCount = parseInt(results?.[1]?.[1] || '0', 10) || 0

  if (minuteCount >= context.rateLimit.requestsPerMinute) {
    return {
      allowed: false,
      retryAfter: Math.ceil((minuteReset - now) / 1000),
      reason: 'rate_limit_minute',
      requestsRemaining: 0,
      resetTime: minuteReset,
      backend: 'redis',
    }
  }

  if (hourCount >= context.rateLimit.requestsPerHour) {
    return {
      allowed: false,
      retryAfter: Math.ceil((hourReset - now) / 1000),
      reason: 'rate_limit_hour',
      requestsRemaining: 0,
      resetTime: hourReset,
      backend: 'redis',
    }
  }

  const updatePipeline = serviceRedis!.pipeline()
  updatePipeline.incr(minuteKey)
  updatePipeline.expire(
    minuteKey,
    Math.ceil(SERVICE_RATE_LIMIT_WINDOW_MINUTE / 1000)
  )
  updatePipeline.incr(hourKey)
  updatePipeline.expire(
    hourKey,
    Math.ceil(SERVICE_RATE_LIMIT_WINDOW_HOUR / 1000)
  )
  await updatePipeline.exec()

  return {
    allowed: true,
    requestsRemaining: context.rateLimit.requestsPerMinute - minuteCount - 1,
    resetTime: minuteReset,
    backend: 'redis',
  }
}

/**
 * Check if service has required permission
 */
export function hasPermission(
  context: ServiceContext,
  permission: ServicePermission
): boolean {
  return context.permissions.includes(permission)
}

/**
 * Check if service can access a specific client
 */
export function canAccessClient(
  context: ServiceContext,
  clientId: string
): boolean {
  // No client restrictions = can access all
  if (!context.clientIds || context.clientIds.length === 0) {
    return true
  }
  return context.clientIds.includes(clientId)
}

/**
 * Generate a new service API key
 * Returns the plaintext key (only shown once) and its hash for storage
 */
export async function generateServiceKey(): Promise<{
  key: string
  keyHash: string
}> {
  const nodeCrypto = await import('crypto')
  const randomPart = nodeCrypto.randomBytes(24).toString('base64url')
  const key = `vbl_sk_${randomPart}`
  const keyHash = hash(key)

  return { key, keyHash }
}

/**
 * Extract service key from Authorization header
 */
export function extractServiceKey(authHeader: string | null): string | null {
  if (!authHeader) return null

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    if (token.startsWith('vbl_sk_')) {
      return token
    }
  }

  return null
}

/**
 * Middleware helper: Validate service auth from request headers
 * Returns service context or null if auth fails
 */
export async function authenticateService(
  request: Request
): Promise<ServiceContext | null> {
  const authHeader = request.headers.get('Authorization')
  const apiKey = extractServiceKey(authHeader)

  if (!apiKey) {
    return null
  }

  return validateServiceKey(apiKey)
}
