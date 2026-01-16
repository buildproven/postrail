/**
 * Enhanced SSRF Protection
 *
 * Comprehensive Server-Side Request Forgery protection with:
 * - DNS resolution to IP validation
 * - Private IP range blocking
 * - Port filtering (only 80/443 allowed)
 * - Rate limiting per user and per IP
 * - Domain blocklist support
 * - AWS/GCP/Azure metadata endpoint blocking
 *
 * Security Finding: SSRF protection lacks port filtering and rate limiting
 * Solution: Multi-layered protection with strict controls
 */

import { logger } from '@/lib/logger'
import { isIP } from 'net'

interface SSRFValidationResult {
  allowed: boolean
  error?: string
  ip?: string
  port?: number
}

interface RateLimitRecord {
  count: number
  resetTime: number
  locked: boolean // Mutex flag for atomic operations
}

class SSRFProtection {
  private userLimits = new Map<string, RateLimitRecord>()
  private ipLimits = new Map<string, RateLimitRecord>()
  private cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null

  // Rate limiting configuration
  private readonly SCRAPE_REQUESTS_PER_USER_PER_MINUTE = 5 // Per user
  private readonly SCRAPE_REQUESTS_PER_IP_PER_MINUTE = 10 // Per IP
  private readonly CLEANUP_INTERVAL = 60 * 1000 // Cleanup every minute
  private readonly LOCK_TIMEOUT = 1000 // 1 second max lock duration

  // Allowed ports - only standard HTTP/HTTPS
  private readonly ALLOWED_PORTS = [80, 443]

  // Blocked domains/patterns (configurable via environment)
  private readonly DOMAIN_BLOCKLIST = [
    // AWS metadata endpoints
    '169.254.169.254',
    'metadata.google.internal',
    'metadata.goog',
    'metadata.google.com',

    // GCP metadata
    'metadata.google.internal',

    // Azure metadata
    '169.254.169.254',

    // Kubernetes metadata
    '10.96.0.1',
    'kubernetes.default.svc.cluster.local',

    // Docker metadata
    'host.docker.internal',

    // Common internal domains
    'localhost',
    'localhost.localdomain',
    'broadcasthost',

    // Add custom blocked domains from env var
    ...(process.env.SSRF_BLOCKED_DOMAINS?.split(',').map(d => d.trim()) || []),
  ]

  constructor() {
    this.cleanupIntervalHandle = setInterval(
      () => this.cleanup(),
      this.CLEANUP_INTERVAL
    )
  }

  /**
   * Cleanup resources on shutdown/module unload
   * Prevents memory leaks from accumulating interval handles
   */
  destroy() {
    if (this.cleanupIntervalHandle) {
      clearInterval(this.cleanupIntervalHandle)
      this.cleanupIntervalHandle = null
    }
  }

  /**
   * Enhanced private IP detection with cloud provider metadata endpoints
   *
   * Detects private IP ranges including:
   * - IPv4: localhost, RFC1918 (10.x, 192.168.x, 172.16-31.x), link-local (169.254.x)
   * - IPv6: localhost (::1), unique local (fc00:/fd00:), link-local (fe80:)
   * - Cloud metadata: AWS/GCP/Azure metadata endpoints
   * - Special ranges: carrier-grade NAT, documentation ranges
   *
   * @param {string} ip - IP address to validate (IPv4 or IPv6 format)
   * @returns {boolean} True if IP is private/internal, false if public
   *
   * @example
   * isPrivateIP('192.168.1.1') // true
   * isPrivateIP('169.254.169.254') // true (AWS metadata)
   * isPrivateIP('8.8.8.8') // false (public DNS)
   */
  private isPrivateIP(ip: string): boolean {
    // IPv4 private ranges
    if (ip === '127.0.0.1' || ip === 'localhost') return true
    if (ip.startsWith('10.')) return true
    if (ip.startsWith('192.168.')) return true
    if (ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return true
    if (ip.startsWith('169.254.')) return true // Link-local and AWS metadata
    if (ip === '0.0.0.0') return true

    // Additional cloud metadata ranges
    if (ip.startsWith('100.64.')) return true // Carrier-grade NAT
    if (ip.startsWith('203.0.113.')) return true // Documentation range
    if (ip.startsWith('233.252.0.')) return true // Documentation range

    // IPv6 private ranges
    if (ip === '::1') return true
    if (ip.startsWith('fc00:') || ip.startsWith('fd00:')) return true // Unique local
    if (ip.startsWith('fe80:')) return true // Link-local
    if (ip.startsWith('::ffff:')) return true // IPv4-mapped IPv6

    // IPv6 documentation ranges
    if (ip.startsWith('2001:db8:')) return true

    return false
  }

  /**
   * Validate port number against allowed list
   *
   * Only allows standard HTTP/HTTPS ports to prevent:
   * - Internal service scanning (Redis: 6379, Postgres: 5432, etc.)
   * - Bypass via non-standard ports
   *
   * @param {number} port - Port number to validate
   * @returns {boolean} True if port is 80 or 443, false otherwise
   *
   * @example
   * isAllowedPort(443) // true
   * isAllowedPort(8080) // false
   * isAllowedPort(6379) // false (Redis port blocked)
   */
  private isAllowedPort(port: number): boolean {
    return this.ALLOWED_PORTS.includes(port)
  }

  /**
   * Check if domain is in blocklist
   *
   * Blocks known internal/metadata domains including:
   * - Cloud provider metadata (AWS, GCP, Azure, Kubernetes)
   * - Docker internal networking
   * - localhost variants
   * - Custom blocked domains from SSRF_BLOCKED_DOMAINS env var
   *
   * Supports both exact match and subdomain matching.
   *
   * @param {string} hostname - Hostname to validate
   * @returns {boolean} True if domain is blocked, false if allowed
   *
   * @example
   * isDomainBlocked('metadata.google.internal') // true
   * isDomainBlocked('sub.metadata.google.internal') // true (subdomain match)
   * isDomainBlocked('example.com') // false
   */
  private isDomainBlocked(hostname: string): boolean {
    const lowercaseHostname = hostname.toLowerCase()

    return this.DOMAIN_BLOCKLIST.some(blocked => {
      const lowercaseBlocked = blocked.toLowerCase()

      // Exact match
      if (lowercaseHostname === lowercaseBlocked) return true

      // Subdomain match (e.g., *.metadata.google.internal)
      if (lowercaseHostname.endsWith('.' + lowercaseBlocked)) return true

      return false
    })
  }

  /**
   * Rate limiting check for scraping requests
   *
   * Implements dual rate limiting:
   * - Per user: 5 requests/minute (prevent individual abuse)
   * - Per IP: 10 requests/minute (prevent distributed abuse)
   *
   * Uses sliding window with automatic cleanup of expired records.
   *
   * @param {string} userId - Authenticated user ID from Supabase
   * @param {string} clientIP - Client IP address (from request headers or fallback)
   * @returns {Promise<{allowed: boolean, retryAfter?: number, reason?: string}>} Rate limit decision
   *
   * @example
   * const result = await checkRateLimit('user123', '203.0.113.42')
   * if (!result.allowed) {
   *   logger.info(`Rate limited: ${result.reason}, retry after ${result.retryAfter}s`)
   * }
   */
  async checkRateLimit(
    userId: string,
    clientIP: string
  ): Promise<{
    allowed: boolean
    retryAfter?: number
    reason?: string
  }> {
    const isTestEnv =
      process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
    const enforceInTests = process.env.ENFORCE_SSRF_RATE_LIMIT_TESTS === 'true'

    if (isTestEnv && !enforceInTests) {
      return { allowed: true }
    }

    const now = Date.now()

    const userResult = await this.checkSingleRateLimit(
      `scrape_user:${userId}`,
      this.userLimits,
      this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE,
      now,
      'User'
    )

    if (!userResult.allowed) {
      return userResult
    }

    return this.checkSingleRateLimit(
      `scrape_ip:${clientIP}`,
      this.ipLimits,
      this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE,
      now,
      'IP'
    )
  }

  private async checkSingleRateLimit(
    key: string,
    limitMap: Map<string, RateLimitRecord>,
    limit: number,
    now: number,
    type: 'User' | 'IP'
  ): Promise<{
    allowed: boolean
    retryAfter?: number
    reason?: string
  }> {
    const record = await this.checkAndUpdateRateLimit(key, limitMap, limit, now)

    if (!record.allowed) {
      return {
        allowed: false,
        retryAfter: Math.ceil(record.retryAfter! / 1000),
        reason: `${type} rate limit exceeded: ${limit} requests per minute`,
      }
    }

    return { allowed: true }
  }

  /**
   * Non-mutating rate limit status check (does not increment counters)
   */
  getRateLimitStatus(
    userId: string,
    clientIP: string
  ): {
    allowed: boolean
    retryAfter?: number
    reason?: string
  } {
    const now = Date.now()

    const userStatus = this.peekRateLimit(
      `scrape_user:${userId}`,
      this.userLimits,
      this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE,
      now,
      'User'
    )

    if (!userStatus.allowed) {
      return userStatus
    }

    return this.peekRateLimit(
      `scrape_ip:${clientIP}`,
      this.ipLimits,
      this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE,
      now,
      'IP'
    )
  }

  private peekRateLimit(
    key: string,
    limitMap: Map<string, RateLimitRecord>,
    limit: number,
    now: number,
    label: 'User' | 'IP'
  ): { allowed: boolean; retryAfter?: number; reason?: string } {
    const record = limitMap.get(key)

    if (!record || now > record.resetTime) {
      return { allowed: true }
    }

    if (record.count >= limit) {
      return {
        allowed: false,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
        reason: `${label} rate limit exceeded: ${limit} requests per minute`,
      }
    }

    return { allowed: true }
  }

  /**
   * Acquire mutex lock with timeout protection
   * Prevents race conditions in concurrent rate limit checks
   */
  private async acquireLock(
    key: string,
    limitMap: Map<string, RateLimitRecord>
  ): Promise<boolean> {
    const startTime = Date.now()

    while (true) {
      const record = limitMap.get(key)

      // If no record exists, we can proceed
      if (!record) {
        return true
      }

      // If record exists and is not locked, acquire lock
      if (!record.locked) {
        record.locked = true
        limitMap.set(key, record)
        return true
      }

      // Check for lock timeout (stale lock recovery)
      if (Date.now() - startTime > this.LOCK_TIMEOUT) {
        // Force release stale lock
        record.locked = false
        limitMap.set(key, record)
        return true
      }

      // Wait briefly before retry (busy-wait with small delay)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  /**
   * Release mutex lock
   */
  private releaseLock(
    key: string,
    limitMap: Map<string, RateLimitRecord>
  ): void {
    const record = limitMap.get(key)
    if (record) {
      record.locked = false
      limitMap.set(key, record)
    }
  }

  /**
   * Helper method for rate limit checking and updating
   * SECURITY FIX: Now uses mutex locking for atomic check-and-increment
   * Prevents race condition where concurrent requests bypass rate limit
   */
  private async checkAndUpdateRateLimit(
    key: string,
    limitMap: Map<string, RateLimitRecord>,
    limit: number,
    now: number
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    // Acquire lock for atomic operation
    await this.acquireLock(key, limitMap)

    try {
      let record = limitMap.get(key)

      if (!record) {
        // First request - allow
        limitMap.set(key, {
          count: 1,
          resetTime: now + 60 * 1000, // 1 minute window
          locked: false,
        })
        return { allowed: true }
      }

      // Check if window has reset
      if (now >= record.resetTime) {
        record.count = 1
        record.resetTime = now + 60 * 1000
        limitMap.set(key, record)
        return { allowed: true }
      }

      // Check if limit exceeded
      if (record.count >= limit) {
        return {
          allowed: false,
          retryAfter: record.resetTime - now,
        }
      }

      // Increment and allow
      record.count++
      limitMap.set(key, record)
      return { allowed: true }
    } finally {
      // Always release lock
      this.releaseLock(key, limitMap)
    }
  }

  /**
   * Comprehensive URL validation with enhanced SSRF protection
   *
   * Multi-layer validation process:
   * 1. Protocol validation (HTTP/HTTPS only)
   * 2. Domain blocklist check
   * 3. Port validation (only 80/443 allowed)
   * 4. DNS resolution to IP addresses
   * 5. Private IP range detection
   * 6. Suspicious pattern detection (double dots, URL encoding)
   *
   * @param {string} url - URL to validate before fetching
   * @returns {Promise<SSRFValidationResult>} Validation result with allowed status and details
   * @throws Never throws - returns validation result with error details
   *
   * @example
   * const validation = await validateUrl('https://example.com/article')
   * if (!validation.allowed) {
   *   logger.error(`Blocked: ${validation.error}`)
   * }
   *
   * @example
   * // Blocked: resolves to private IP
   * await validateUrl('http://metadata.google.internal')
   * // Returns: {allowed: false, error: 'Domain resolves to private IP...'}
   */
  async validateUrl(url: string): Promise<SSRFValidationResult> {
    try {
      const parsedUrl = new URL(url)

      // 1. Protocol validation - only HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          allowed: false,
          error: 'Only HTTP/HTTPS URLs are allowed',
        }
      }

      const hostname = parsedUrl.hostname.toLowerCase()

      // 2. Domain blocklist check
      if (this.isDomainBlocked(hostname)) {
        return {
          allowed: false,
          error: 'Domain is blocked',
        }
      }

      // 3. Port validation - only 80/443 allowed
      const port = parsedUrl.port
        ? parseInt(parsedUrl.port)
        : parsedUrl.protocol === 'https:'
          ? 443
          : 80

      if (!this.isAllowedPort(port)) {
        return {
          allowed: false,
          error: `Port ${port} is not allowed. Only ports 80 and 443 are permitted.`,
          port,
        }
      }

      // 4. DNS resolution and IP validation
      const dns = await import('dns').then(m => m.promises)
      let resolvedIPs: string[] = []

      try {
        // Try IPv4 first
        const ipv4Addresses = await dns.resolve4(hostname)
        resolvedIPs = ipv4Addresses
      } catch (ipv4Error) {
        // If IPv4 fails, try IPv6
        try {
          const ipv6Addresses = await dns.resolve6(hostname)
          resolvedIPs = ipv6Addresses
        } catch (ipv6Error) {
          // Log DNS resolution failures for security monitoring
          logger.warn({
            type: 'warn',
            msg: 'DNS resolution failed for URL validation',
            hostname,
            ipv4Error:
              ipv4Error instanceof Error
                ? ipv4Error.message
                : String(ipv4Error),
            ipv6Error:
              ipv6Error instanceof Error
                ? ipv6Error.message
                : String(ipv6Error),
          })
          return {
            allowed: false,
            error: 'DNS resolution failed',
          }
        }
      }

      // 5. Check all resolved IPs for private ranges
      for (const ip of resolvedIPs) {
        if (this.isPrivateIP(ip)) {
          return {
            allowed: false,
            error: `Domain resolves to private/internal IP address: ${ip}`,
            ip,
          }
        }
      }

      // 6. Additional security checks for suspicious patterns
      if (hostname.includes('..') || hostname.includes('%')) {
        return {
          allowed: false,
          error: 'Suspicious hostname pattern detected',
        }
      }

      return {
        allowed: true,
        ip: resolvedIPs[0],
        port,
      }
    } catch {
      return {
        allowed: false,
        error: 'Invalid URL format',
      }
    }
  }

  /**
   * Get client IP from request headers with anti-spoofing protection
   *
   * SECURITY FIX: Properly extract client IP from standard headers
   * Previous version always returned 127.0.0.1, breaking IP-based rate limiting
   *
   * Security considerations:
   * - Only trusts x-forwarded-for when NEXT_TRUST_PROXY=true
   * - Validates IP format to prevent header injection
   * - Checks multiple standard headers (x-forwarded-for, x-real-ip, cf-connecting-ip)
   * - Returns error indicator "unknown" if IP cannot be determined
   *
   * @param {Request} request - Next.js request object
   * @returns {string} Client IP address (validated format or "unknown")
   *
   * @example
   * const ip = getClientIP(request)
   * if (ip === 'unknown') {
   *   // Handle missing IP (perhaps use user ID only for rate limiting)
   * }
   * // Production with NEXT_TRUST_PROXY=true: '203.0.113.42'
   * // Development (when running locally): '127.0.0.1'
   */
  getClientIP(request: Request): string {
    const trustProxy = process.env.NEXT_TRUST_PROXY === 'true'

    if (trustProxy) {
      const ip = this.extractIPFromHeaders(request)
      if (ip) return ip
    }

    if (process.env.NODE_ENV === 'development') {
      return '127.0.0.1'
    }

    return 'unknown'
  }

  private extractIPFromHeaders(request: Request): string | null {
    const cfConnectingIp = request.headers.get('cf-connecting-ip')
    if (cfConnectingIp && this.isValidPublicIP(cfConnectingIp.trim())) {
      return cfConnectingIp.trim()
    }

    const xRealIp = request.headers.get('x-real-ip')
    if (xRealIp && this.isValidPublicIP(xRealIp.trim())) {
      return xRealIp.trim()
    }

    const xForwardedFor = request.headers.get('x-forwarded-for')
    if (xForwardedFor) {
      const ips = xForwardedFor.split(',').map(ip => ip.trim())
      for (const ip of ips) {
        if (this.isValidPublicIP(ip)) {
          return ip
        }
      }
    }

    return null
  }

  /**
   * Validate IP address format to prevent spoofing
   * Accepts both IPv4 and IPv6, including localhost for development
   *
   * SECURITY FIX (L11): Improved IPv6 validation to catch compressed formats
   * Previous regex: /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/
   * Issue: Missed valid IPv6 like fe80::1, 2001:db8::1, ::ffff:192.0.2.1
   * Solution: Use Node.js built-in net.isIP() for RFC 4291 compliance
   */
  private isValidIP(ip: string): boolean {
    if (!ip || ip.length === 0) return false

    // Use Node.js built-in IP validation (RFC 4291 compliant)
    // Returns 4 for IPv4, 6 for IPv6, 0 for invalid
    return isIP(ip) !== 0
  }

  /**
   * Validate that IP is public and suitable for rate limiting
   * Rejects private IPs to prevent rate limit bypass via header spoofing
   */
  private isValidPublicIP(ip: string): boolean {
    if (!this.isValidIP(ip)) return false

    // Reject private IPs (could be spoofed in headers)
    if (this.isPrivateIP(ip)) return false

    return true
  }

  /**
   * Clean up expired rate limit records
   */
  private cleanup(): void {
    const now = Date.now()

    // Cleanup expired user limits
    for (const [key, record] of this.userLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) {
        // Keep for extra minute
        this.userLimits.delete(key)
      }
    }

    // Cleanup expired IP limits
    for (const [key, record] of this.ipLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) {
        // Keep for extra minute
        this.ipLimits.delete(key)
      }
    }
  }

  /**
   * Get system statistics for monitoring
   *
   * Provides current state of SSRF protection system for:
   * - Monitoring dashboards
   * - Security audits
   * - Capacity planning
   *
   * @returns {{activeUserLimits: number, activeIPLimits: number, allowedPorts: number[], blockedDomains: number, rateLimits: object, timestamp: number}} Current system statistics
   *
   * @example
   * const stats = getStats()
   * logger.info(`Active rate limits: ${stats.activeUserLimits} users, ${stats.activeIPLimits} IPs`)
   * logger.info(`Blocking ${stats.blockedDomains} domains on ports ${stats.allowedPorts.join(', ')}`)
   */
  getStats() {
    return {
      activeUserLimits: this.userLimits.size,
      activeIPLimits: this.ipLimits.size,
      allowedPorts: this.ALLOWED_PORTS,
      blockedDomains: this.DOMAIN_BLOCKLIST.length,
      rateLimits: {
        userRequestsPerMinute: this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE,
        ipRequestsPerMinute: this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE,
      },
      timestamp: Date.now(),
    }
  }
}

// Singleton instance
export const ssrfProtection = new SSRFProtection()

// Export types
export type { SSRFValidationResult }
