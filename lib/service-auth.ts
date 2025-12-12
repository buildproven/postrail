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
