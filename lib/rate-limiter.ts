/**
 * Rate Limiting and Request Deduplication
 *
 * Implements per-user rate limiting for AI generation requests
 * with request deduplication to prevent duplicate API calls.
 *
 * Security Finding: Unbounded AI generation (8 parallel calls, no limits)
 * Solution: Rate limiting + deduplication + queue management
 */

import crypto from 'crypto'

interface RateLimitRecord {
  count: number
  resetTime: number
  lastRequest: number
}

interface PendingRequest {
  requestId: string
  userId: string
  contentHash: string
  timestamp: number
  resolve: (value: any) => void
  reject: (error: any) => void
}

class RateLimiter {
  private userLimits = new Map<string, RateLimitRecord>()
  private pendingRequests = new Map<string, PendingRequest>()
  private completedRequests = new Map<string, { result: any; timestamp: number }>()

  // Rate limiting configuration
  private readonly AI_REQUESTS_PER_MINUTE = 3  // Max 3 AI generation requests per minute per user
  private readonly AI_REQUESTS_PER_HOUR = 10   // Max 10 AI generation requests per hour per user
  private readonly DEDUP_CACHE_TTL = 5 * 60 * 1000  // 5 minutes cache for deduplication
  private readonly CLEANUP_INTERVAL = 60 * 1000     // Cleanup every minute

  constructor() {
    // Periodic cleanup of expired records
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL)
  }

  /**
   * Check if user can make AI generation request
   */
  async checkRateLimit(userId: string): Promise<{ allowed: boolean; retryAfter?: number; reason?: string }> {
    const now = Date.now()
    const userKey = `ai_generation:${userId}`

    let record = this.userLimits.get(userKey)

    if (!record) {
      // First request - allow
      record = {
        count: 1,
        resetTime: now + 60 * 1000, // 1 minute window
        lastRequest: now
      }
      this.userLimits.set(userKey, record)
      return { allowed: true }
    }

    // Check if window has reset
    if (now >= record.resetTime) {
      record.count = 1
      record.resetTime = now + 60 * 1000
      record.lastRequest = now
      this.userLimits.set(userKey, record)
      return { allowed: true }
    }

    // Check minute limit
    if (record.count >= this.AI_REQUESTS_PER_MINUTE) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000)
      return {
        allowed: false,
        retryAfter,
        reason: `Rate limit exceeded: ${this.AI_REQUESTS_PER_MINUTE} requests per minute. Try again in ${retryAfter}s.`
      }
    }

    // Check hourly limit (simplified - just check last hour of requests)
    const hourAgo = now - 60 * 60 * 1000
    if (record.lastRequest > hourAgo && record.count >= this.AI_REQUESTS_PER_HOUR) {
      return {
        allowed: false,
        retryAfter: 3600, // 1 hour
        reason: `Daily limit reached: ${this.AI_REQUESTS_PER_HOUR} requests per hour. Try again later.`
      }
    }

    // Allow request and increment counter
    record.count++
    record.lastRequest = now
    this.userLimits.set(userKey, record)

    return { allowed: true }
  }

  /**
   * Generate content hash for deduplication
   */
  generateContentHash(title: string, content: string, userId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${title}:${content}`)
      .digest('hex')
      .substring(0, 16)
  }

  /**
   * Check if request is duplicate and handle deduplication
   */
  async handleDeduplication(
    userId: string,
    title: string,
    content: string
  ): Promise<{ isDuplicate: boolean; requestId?: string; existingResult?: any }> {

    const contentHash = this.generateContentHash(title, content, userId)
    const requestId = `${userId}:${contentHash}`

    // Check if we already have a completed result
    const existingResult = this.completedRequests.get(requestId)
    if (existingResult) {
      const age = Date.now() - existingResult.timestamp
      if (age < this.DEDUP_CACHE_TTL) {
        console.log(`Returning cached result for request ${requestId}`)
        return {
          isDuplicate: true,
          requestId,
          existingResult: existingResult.result
        }
      } else {
        // Expired, remove
        this.completedRequests.delete(requestId)
      }
    }

    // Check if request is currently pending
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      console.log(`Request ${requestId} is already pending, waiting for result`)

      // Return a promise that resolves when the original request completes
      return new Promise((resolve, reject) => {
        const originalResolve = pendingRequest.resolve
        const originalReject = pendingRequest.reject

        pendingRequest.resolve = (result) => {
          originalResolve(result)
          resolve({ isDuplicate: true, requestId, existingResult: result })
        }

        pendingRequest.reject = (error) => {
          originalReject(error)
          reject(error)
        }
      })
    }

    // New unique request
    return { isDuplicate: false, requestId }
  }

  /**
   * Register a pending request
   */
  registerPendingRequest(requestId: string, userId: string, contentHash: string): {
    promise: Promise<any>
    resolve: (value: any) => void
    reject: (error: any) => void
  } {
    let resolve: (value: any) => void
    let reject: (error: any) => void

    const promise = new Promise<any>((res, rej) => {
      resolve = res
      reject = rej
    })

    const pendingRequest: PendingRequest = {
      requestId,
      userId,
      contentHash,
      timestamp: Date.now(),
      resolve: resolve!,
      reject: reject!
    }

    this.pendingRequests.set(requestId, pendingRequest)

    return { promise, resolve: resolve!, reject: reject! }
  }

  /**
   * Complete a pending request and cache result
   */
  completePendingRequest(requestId: string, result: any) {
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      pendingRequest.resolve(result)
      this.pendingRequests.delete(requestId)

      // Cache the result for deduplication
      this.completedRequests.set(requestId, {
        result,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Fail a pending request
   */
  failPendingRequest(requestId: string, error: any) {
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      pendingRequest.reject(error)
      this.pendingRequests.delete(requestId)
    }
  }

  /**
   * Get current rate limit status for user
   */
  getUserStatus(userId: string): {
    requestsRemaining: number
    resetTime: number
    isLimited: boolean
  } {
    const now = Date.now()
    const userKey = `ai_generation:${userId}`
    const record = this.userLimits.get(userKey)

    if (!record) {
      return {
        requestsRemaining: this.AI_REQUESTS_PER_MINUTE,
        resetTime: now + 60 * 1000,
        isLimited: false
      }
    }

    if (now >= record.resetTime) {
      return {
        requestsRemaining: this.AI_REQUESTS_PER_MINUTE,
        resetTime: now + 60 * 1000,
        isLimited: false
      }
    }

    const remaining = Math.max(0, this.AI_REQUESTS_PER_MINUTE - record.count)
    return {
      requestsRemaining: remaining,
      resetTime: record.resetTime,
      isLimited: remaining === 0
    }
  }

  /**
   * Cleanup expired records
   */
  private cleanup() {
    const now = Date.now()

    // Cleanup expired rate limit records
    for (const [key, record] of this.userLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) { // Keep for extra minute
        this.userLimits.delete(key)
      }
    }

    // Cleanup expired pending requests (timeout after 5 minutes)
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > 5 * 60 * 1000) {
        request.reject(new Error('Request timeout'))
        this.pendingRequests.delete(key)
      }
    }

    // Cleanup expired completed results
    for (const [key, result] of this.completedRequests.entries()) {
      if (now - result.timestamp > this.DEDUP_CACHE_TTL) {
        this.completedRequests.delete(key)
      }
    }
  }

  /**
   * Get system statistics for monitoring
   */
  getStats() {
    return {
      activeUsers: this.userLimits.size,
      pendingRequests: this.pendingRequests.size,
      cachedResults: this.completedRequests.size,
      timestamp: Date.now()
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter()

// Export types for use in API routes
export type RateLimitResult = Awaited<ReturnType<typeof rateLimiter.checkRateLimit>>
export type DeduplicationResult = Awaited<ReturnType<typeof rateLimiter.handleDeduplication>>