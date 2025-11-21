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

interface SSRFValidationResult {
  allowed: boolean
  error?: string
  ip?: string
  port?: number
}

interface RateLimitRecord {
  count: number
  resetTime: number
}

class SSRFProtection {
  private userLimits = new Map<string, RateLimitRecord>()
  private ipLimits = new Map<string, RateLimitRecord>()

  // Rate limiting configuration
  private readonly SCRAPE_REQUESTS_PER_USER_PER_MINUTE = 5    // Per user
  private readonly SCRAPE_REQUESTS_PER_IP_PER_MINUTE = 10     // Per IP
  private readonly CLEANUP_INTERVAL = 60 * 1000              // Cleanup every minute

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
    ...(process.env.SSRF_BLOCKED_DOMAINS?.split(',').map(d => d.trim()) || [])
  ]

  constructor() {
    // Periodic cleanup of expired rate limit records
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL)
  }

  /**
   * Enhanced private IP detection with cloud provider metadata endpoints
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
    if (ip.startsWith('100.64.')) return true  // Carrier-grade NAT
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
   */
  private isAllowedPort(port: number): boolean {
    return this.ALLOWED_PORTS.includes(port)
  }

  /**
   * Check if domain is in blocklist
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
   */
  async checkRateLimit(userId: string, clientIP: string): Promise<{
    allowed: boolean
    retryAfter?: number
    reason?: string
  }> {
    const now = Date.now()

    // Check user rate limit
    const userKey = `scrape_user:${userId}`
    const userRecord = this.checkAndUpdateRateLimit(
      userKey,
      this.userLimits,
      this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE,
      now
    )

    if (!userRecord.allowed) {
      return {
        allowed: false,
        retryAfter: Math.ceil(userRecord.retryAfter! / 1000),
        reason: `User rate limit exceeded: ${this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE} requests per minute`
      }
    }

    // Check IP rate limit
    const ipKey = `scrape_ip:${clientIP}`
    const ipRecord = this.checkAndUpdateRateLimit(
      ipKey,
      this.ipLimits,
      this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE,
      now
    )

    if (!ipRecord.allowed) {
      return {
        allowed: false,
        retryAfter: Math.ceil(ipRecord.retryAfter! / 1000),
        reason: `IP rate limit exceeded: ${this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE} requests per minute`
      }
    }

    return { allowed: true }
  }

  /**
   * Helper method for rate limit checking and updating
   */
  private checkAndUpdateRateLimit(
    key: string,
    limitMap: Map<string, RateLimitRecord>,
    limit: number,
    now: number
  ): { allowed: boolean; retryAfter?: number } {
    let record = limitMap.get(key)

    if (!record) {
      // First request - allow
      limitMap.set(key, {
        count: 1,
        resetTime: now + 60 * 1000, // 1 minute window
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
        retryAfter: record.resetTime - now
      }
    }

    // Increment and allow
    record.count++
    limitMap.set(key, record)
    return { allowed: true }
  }

  /**
   * Comprehensive URL validation with enhanced SSRF protection
   */
  async validateUrl(url: string): Promise<SSRFValidationResult> {
    try {
      const parsedUrl = new URL(url)

      // 1. Protocol validation - only HTTP/HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          allowed: false,
          error: 'Only HTTP/HTTPS URLs are allowed'
        }
      }

      const hostname = parsedUrl.hostname.toLowerCase()

      // 2. Domain blocklist check
      if (this.isDomainBlocked(hostname)) {
        return {
          allowed: false,
          error: 'Domain is blocked'
        }
      }

      // 3. Port validation - only 80/443 allowed
      const port = parsedUrl.port ? parseInt(parsedUrl.port) :
                   (parsedUrl.protocol === 'https:' ? 443 : 80)

      if (!this.isAllowedPort(port)) {
        return {
          allowed: false,
          error: `Port ${port} is not allowed. Only ports 80 and 443 are permitted.`,
          port
        }
      }

      // 4. DNS resolution and IP validation
      const dns = await import('dns').then(m => m.promises)
      let resolvedIPs: string[] = []

      try {
        // Try IPv4 first
        const ipv4Addresses = await dns.resolve4(hostname)
        resolvedIPs = ipv4Addresses
      } catch {
        // If IPv4 fails, try IPv6
        try {
          const ipv6Addresses = await dns.resolve6(hostname)
          resolvedIPs = ipv6Addresses
        } catch {
          return {
            allowed: false,
            error: 'DNS resolution failed'
          }
        }
      }

      // 5. Check all resolved IPs for private ranges
      for (const ip of resolvedIPs) {
        if (this.isPrivateIP(ip)) {
          return {
            allowed: false,
            error: `Domain resolves to private/internal IP address: ${ip}`,
            ip
          }
        }
      }

      // 6. Additional security checks for suspicious patterns
      if (hostname.includes('..') || hostname.includes('%')) {
        return {
          allowed: false,
          error: 'Suspicious hostname pattern detected'
        }
      }

      return {
        allowed: true,
        ip: resolvedIPs[0],
        port
      }

    } catch (error) {
      return {
        allowed: false,
        error: 'Invalid URL format'
      }
    }
  }

  /**
   * Get client IP from request headers with anti-spoofing protection
   */
  getClientIP(request: Request): string {
    const trustProxy = process.env.NEXT_TRUST_PROXY === 'true'

    if (trustProxy) {
      // Only trust x-forwarded-for when explicitly configured
      const xForwardedFor = request.headers.get('x-forwarded-for')
      if (xForwardedFor) {
        // Take the first IP (original client) and validate it
        const ip = xForwardedFor.split(',')[0].trim()
        if (this.isValidIP(ip)) {
          return ip
        }
      }
    }

    // For Next.js, try to get the real IP from the request object
    // In development/testing, this will be 127.0.0.1
    const requestUrl = new URL(request.url)

    // Fallback to localhost for development
    return '127.0.0.1'
  }

  /**
   * Validate IP address format to prevent spoofing
   */
  private isValidIP(ip: string): boolean {
    // Basic IPv4 validation
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

    // Basic IPv6 validation (simplified)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$/

    if (!ip || ip.length === 0) return false
    if (ip === 'localhost' || ip === '127.0.0.1') return false

    return ipv4Regex.test(ip) || ipv6Regex.test(ip)
  }

  /**
   * Clean up expired rate limit records
   */
  private cleanup(): void {
    const now = Date.now()

    // Cleanup expired user limits
    for (const [key, record] of this.userLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) { // Keep for extra minute
        this.userLimits.delete(key)
      }
    }

    // Cleanup expired IP limits
    for (const [key, record] of this.ipLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) { // Keep for extra minute
        this.ipLimits.delete(key)
      }
    }
  }

  /**
   * Get system statistics for monitoring
   */
  getStats() {
    return {
      activeUserLimits: this.userLimits.size,
      activeIPLimits: this.ipLimits.size,
      allowedPorts: this.ALLOWED_PORTS,
      blockedDomains: this.DOMAIN_BLOCKLIST.length,
      rateLimits: {
        userRequestsPerMinute: this.SCRAPE_REQUESTS_PER_USER_PER_MINUTE,
        ipRequestsPerMinute: this.SCRAPE_REQUESTS_PER_IP_PER_MINUTE
      },
      timestamp: Date.now()
    }
  }
}

// Singleton instance
export const ssrfProtection = new SSRFProtection()

// Export types
export type { SSRFValidationResult }