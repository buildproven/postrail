/**
 * API Versioning Strategy
 *
 * VBL7: Implements version negotiation and backwards compatibility
 *
 * Versioning Strategy:
 * - URL-based versioning: /api/v1/*, /api/v2/*
 * - Accept header versioning: Accept: application/vnd.postrail.v1+json
 * - Default to latest stable version if no version specified
 * - Deprecation warnings in response headers
 *
 * Supported Versions:
 * - v1: Current stable API (default)
 * - v2: Future version (not yet implemented)
 *
 * Migration Path:
 * 1. New features added to v1 with opt-in flags
 * 2. Breaking changes go to v2
 * 3. v1 deprecated with sunset date
 * 4. v1 removed after sunset + grace period
 */

import { NextRequest } from 'next/server'
import { logger } from '@/lib/logger'

/**
 * Supported API versions
 */
export type ApiVersion = 'v1' | 'v2'

export const CURRENT_VERSION: ApiVersion = 'v1'
export const LATEST_VERSION: ApiVersion = 'v1'

/**
 * Version deprecation information
 */
export interface VersionDeprecation {
  version: ApiVersion
  deprecated: boolean
  sunset?: string // ISO 8601 date when version will be removed
  message?: string
  alternativeVersion: ApiVersion
}

/**
 * Version deprecation registry
 * VBL7: Track which versions are deprecated and when they'll be removed
 */
export const VERSION_DEPRECATIONS: Record<ApiVersion, VersionDeprecation> = {
  v1: {
    version: 'v1',
    deprecated: false,
    alternativeVersion: 'v1', // Current stable
  },
  v2: {
    version: 'v2',
    deprecated: false,
    alternativeVersion: 'v2', // Future version
    message: 'v2 API not yet available',
  },
}

/**
 * VBL7: Extract API version from request
 *
 * Supports multiple version detection methods:
 * 1. URL path: /api/v1/posts
 * 2. Accept header: application/vnd.postrail.v1+json
 * 3. Custom header: X-API-Version: v1
 * 4. Query parameter: ?api-version=v1
 *
 * Falls back to latest stable version if not specified.
 *
 * @param request - Next.js request object
 * @returns Detected API version and source
 */
export function getApiVersion(request: NextRequest): {
  version: ApiVersion
  source: 'url' | 'header' | 'query' | 'default'
  deprecated: boolean
  deprecation?: VersionDeprecation
} {
  // 1. Check URL path: /api/v1/*, /api/v2/*
  const urlMatch = request.nextUrl.pathname.match(/\/api\/(v\d+)\//)
  if (urlMatch) {
    const version = urlMatch[1] as ApiVersion
    if (isValidVersion(version)) {
      const deprecation = VERSION_DEPRECATIONS[version]
      return {
        version,
        source: 'url',
        deprecated: deprecation.deprecated,
        deprecation: deprecation.deprecated ? deprecation : undefined,
      }
    }
  }

  // 2. Check Accept header: application/vnd.postrail.v1+json
  const acceptHeader = request.headers.get('accept')
  if (acceptHeader) {
    const headerMatch = acceptHeader.match(
      /application\/vnd\.postrail\.(v\d+)\+json/
    )
    if (headerMatch) {
      const version = headerMatch[1] as ApiVersion
      if (isValidVersion(version)) {
        const deprecation = VERSION_DEPRECATIONS[version]
        return {
          version,
          source: 'header',
          deprecated: deprecation.deprecated,
          deprecation: deprecation.deprecated ? deprecation : undefined,
        }
      }
    }
  }

  // 3. Check custom header: X-API-Version
  const versionHeader = request.headers.get('x-api-version')
  if (versionHeader && isValidVersion(versionHeader as ApiVersion)) {
    const version = versionHeader as ApiVersion
    const deprecation = VERSION_DEPRECATIONS[version]
    return {
      version,
      source: 'header',
      deprecated: deprecation.deprecated,
      deprecation: deprecation.deprecated ? deprecation : undefined,
    }
  }

  // 4. Check query parameter: ?api-version=v1
  const queryVersion = request.nextUrl.searchParams.get('api-version')
  if (queryVersion && isValidVersion(queryVersion as ApiVersion)) {
    const version = queryVersion as ApiVersion
    const deprecation = VERSION_DEPRECATIONS[version]
    return {
      version,
      source: 'query',
      deprecated: deprecation.deprecated,
      deprecation: deprecation.deprecated ? deprecation : undefined,
    }
  }

  // 5. Default to latest stable version
  const deprecation = VERSION_DEPRECATIONS[LATEST_VERSION]
  return {
    version: LATEST_VERSION,
    source: 'default',
    deprecated: deprecation.deprecated,
    deprecation: deprecation.deprecated ? deprecation : undefined,
  }
}

/**
 * Check if a version string is valid
 */
function isValidVersion(version: string): version is ApiVersion {
  return version === 'v1' || version === 'v2'
}

/**
 * VBL7: Create deprecation headers for API responses
 *
 * Adds standard deprecation headers to warn clients about
 * deprecated API versions.
 *
 * Headers:
 * - Deprecation: true (RFC 8594)
 * - Sunset: 2026-12-31 (RFC 8594)
 * - Link: <https://docs.postrail.com/api/migration>; rel="deprecation"
 * - Warning: 299 - "API version v1 is deprecated"
 *
 * @param deprecation - Version deprecation information
 * @returns Headers object with deprecation warnings
 */
export function createDeprecationHeaders(
  deprecation: VersionDeprecation
): Record<string, string> {
  const headers: Record<string, string> = {}

  if (deprecation.deprecated) {
    // RFC 8594: Deprecation header
    headers['Deprecation'] = 'true'

    // RFC 8594: Sunset header (when API will be removed)
    if (deprecation.sunset) {
      headers['Sunset'] = deprecation.sunset
    }

    // Link to migration guide
    headers['Link'] =
      '<https://docs.postrail.com/api/migration>; rel="deprecation"'

    // HTTP Warning header (299 = Miscellaneous Persistent Warning)
    const warningMessage =
      deprecation.message ||
      `API version ${deprecation.version} is deprecated. Please migrate to ${deprecation.alternativeVersion}.`

    headers['Warning'] = `299 - "${warningMessage}"`

    // Log deprecation usage for monitoring
    logger.warn({
      type: 'api.version.deprecated_usage',
      version: deprecation.version,
      sunset: deprecation.sunset,
      alternative: deprecation.alternativeVersion,
      msg: 'Deprecated API version used',
    })
  }

  // Always include current API version in response
  headers['X-API-Version'] = deprecation.version

  return headers
}

/**
 * VBL7: Middleware helper to enforce version compatibility
 *
 * Can be used in API routes to enforce minimum/maximum version requirements
 *
 * Example:
 * ```typescript
 * const versionCheck = requireApiVersion(request, { min: 'v1', max: 'v1' })
 * if (!versionCheck.compatible) {
 *   return NextResponse.json(
 *     { error: versionCheck.error },
 *     { status: 400 }
 *   )
 * }
 * ```
 */
export function requireApiVersion(
  request: NextRequest,
  requirements: {
    min?: ApiVersion
    max?: ApiVersion
    exact?: ApiVersion
  }
): {
  compatible: boolean
  version: ApiVersion
  error?: string
  deprecation?: VersionDeprecation
} {
  const detected = getApiVersion(request)
  const { version } = detected

  // Check exact version requirement
  if (requirements.exact && version !== requirements.exact) {
    return {
      compatible: false,
      version,
      error: `This endpoint requires API version ${requirements.exact}. You are using ${version}.`,
      deprecation: detected.deprecation,
    }
  }

  // For min/max checks, convert version to number for comparison
  const versionNum = parseInt(version.substring(1))
  const minNum = requirements.min ? parseInt(requirements.min.substring(1)) : 1
  const maxNum = requirements.max ? parseInt(requirements.max.substring(1)) : 99

  if (versionNum < minNum || versionNum > maxNum) {
    const range =
      requirements.min && requirements.max
        ? `${requirements.min} to ${requirements.max}`
        : requirements.min
          ? `${requirements.min} or higher`
          : `${requirements.max} or lower`

    return {
      compatible: false,
      version,
      error: `This endpoint requires API version ${range}. You are using ${version}.`,
      deprecation: detected.deprecation,
    }
  }

  return {
    compatible: true,
    version,
    deprecation: detected.deprecation,
  }
}
