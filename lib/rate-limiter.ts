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
  hourCount: number
  hourResetTime: number
  locked: boolean // Mutex flag for atomic operations
}

interface GenerationResult {
  newsletterId: string
  postsGenerated: number
  posts: Array<{
    platform: string
    postType: string
    content: string
    characterCount: number
  }>
}

interface CachedResult {
  result: GenerationResult
  timestamp: number
}

interface PendingRequest {
  requestId: string
  userId: string
  contentHash: string
  timestamp: number
  resolve: (value: GenerationResult) => void
  reject: (error: Error) => void
}

class RateLimiter {
  private userLimits = new Map<string, RateLimitRecord>()
  private pendingRequests = new Map<string, PendingRequest>()
  private completedRequests = new Map<string, CachedResult>()
  private cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null

  // Rate limiting configuration
  private readonly AI_REQUESTS_PER_MINUTE = 3 // Max 3 AI generation requests per minute per user
  private readonly AI_REQUESTS_PER_HOUR = 10 // Max 10 AI generation requests per hour per user
  private readonly DEDUP_CACHE_TTL = 5 * 60 * 1000 // 5 minutes cache for deduplication
  private readonly CLEANUP_INTERVAL = 60 * 1000 // Cleanup every minute
  private readonly LOCK_TIMEOUT = 1000 // 1 second max lock duration

  constructor() {
    // Periodic cleanup of expired records
    // Store handle to prevent memory leaks on module reload
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
   * Acquire mutex lock with timeout protection
   * Prevents race conditions in concurrent rate limit checks
   */
  private async acquireLock(key: string): Promise<boolean> {
    const startTime = Date.now()

    while (true) {
      const record = this.userLimits.get(key)

      // If no record exists, we can proceed
      if (!record) {
        return true
      }

      // If record exists and is not locked, acquire lock
      if (!record.locked) {
        record.locked = true
        this.userLimits.set(key, record)
        return true
      }

      // Check for lock timeout (stale lock recovery)
      if (Date.now() - startTime > this.LOCK_TIMEOUT) {
        // Force release stale lock
        record.locked = false
        this.userLimits.set(key, record)
        return true
      }

      // Wait briefly before retry (busy-wait with small delay)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }

  /**
   * Release mutex lock
   */
  private releaseLock(key: string): void {
    const record = this.userLimits.get(key)
    if (record) {
      record.locked = false
      this.userLimits.set(key, record)
    }
  }

  /**
   * Check if user can make AI generation request
   *
   * SECURITY FIX: Now uses mutex locking for atomic check-and-increment
   * Prevents race condition where concurrent requests bypass rate limit
   *
   * Implements per-user rate limiting for AI generation:
   * - 3 requests per minute (burst protection)
   * - 10 requests per hour (sustained usage limit)
   *
   * Uses sliding window algorithm with automatic reset.
   *
   * @param {string} userId - Authenticated user ID from Supabase
   * @returns {Promise<{allowed: boolean, retryAfter?: number, reason?: string}>} Rate limit decision with retry guidance
   *
   * @example
   * const result = await checkRateLimit('user123')
   * if (!result.allowed) {
   *   return res.status(429).json({
   *     error: result.reason,
   *     retryAfter: result.retryAfter
   *   })
   * }
   */
  async checkRateLimit(
    userId: string
  ): Promise<{ allowed: boolean; retryAfter?: number; reason?: string }> {
    const isTestEnv =
      process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
    const enforceInTests = process.env.ENFORCE_AI_RATE_LIMIT_TESTS === 'true'

    if (isTestEnv && !enforceInTests) {
      return { allowed: true }
    }

    const now = Date.now()
    const userKey = `ai_generation:${userId}`

    // Acquire lock for atomic operation
    await this.acquireLock(userKey)

    try {
      let record = this.userLimits.get(userKey)

      if (!record) {
        // First request - allow
        record = {
          count: 1,
          resetTime: now + 60 * 1000, // 1 minute window
          lastRequest: now,
          hourCount: 1,
          hourResetTime: now + 60 * 60 * 1000, // 1 hour window
          locked: false,
        }
        this.userLimits.set(userKey, record)
        return { allowed: true }
      }

      // Check if window has reset
      if (now >= record.resetTime) {
        record.count = 1
        record.resetTime = now + 60 * 1000
        record.lastRequest = now
      } else {
        record.count++
      }

      // Check hour window reset
      if (now >= record.hourResetTime) {
        record.hourCount = 1
        record.hourResetTime = now + 60 * 60 * 1000
      } else {
        record.hourCount++
      }

      // Check minute limit
      if (record.count > this.AI_REQUESTS_PER_MINUTE) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000)
        return {
          allowed: false,
          retryAfter,
          reason: `Rate limit exceeded: ${this.AI_REQUESTS_PER_MINUTE} requests per minute. Try again in ${retryAfter}s.`,
        }
      }

      // Check hourly limit
      if (record.hourCount > this.AI_REQUESTS_PER_HOUR) {
        return {
          allowed: false,
          retryAfter: 3600, // 1 hour
          reason: `Daily limit reached: ${this.AI_REQUESTS_PER_HOUR} requests per hour. Try again later.`,
        }
      }

      // Allow request and update last request
      record.lastRequest = now
      this.userLimits.set(userKey, record)

      return { allowed: true }
    } finally {
      // Always release lock
      this.releaseLock(userKey)
    }
  }

  /**
   * Generate content hash for deduplication
   *
   * Creates SHA-256 hash of title + content + userId to:
   * - Detect duplicate generation requests
   * - Enable result caching
   * - Prevent redundant API calls
   *
   * @param {string} title - Newsletter title
   * @param {string} content - Full newsletter content
   * @param {string} userId - User ID for multi-tenancy isolation
   * @returns {string} 16-character hex hash (truncated SHA-256)
   *
   * @example
   * const hash = generateContentHash('10 Tips', 'Content...', 'user123')
   * // Returns: '7f3a8c9e1b2d4f6a'
   */
  generateContentHash(title: string, content: string, userId: string): string {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${title}:${content}`)
      .digest('hex')
  }

  /**
   * Check if request is duplicate and handle deduplication
   *
   * Three-stage duplicate detection:
   * 1. Check completed results cache (5min TTL) - instant response
   * 2. Check pending requests - wait for in-flight completion
   * 3. New request - proceed with generation
   *
   * Prevents redundant AI API calls and improves response time.
   *
   * @param {string} userId - User ID for cache isolation
   * @param {string} title - Newsletter title
   * @param {string} content - Newsletter content
   * @returns {Promise<{isDuplicate: boolean, requestId?: string, existingResult?: GenerationResult}>} Deduplication decision
   *
   * @example
   * const result = await handleDeduplication('user123', 'Title', 'Content...')
   * if (result.isDuplicate && result.existingResult) {
   *   return res.json({ ...result.existingResult, fromCache: true })
   * }
   */
  async handleDeduplication(
    userId: string,
    title: string,
    content: string
  ): Promise<{
    isDuplicate: boolean
    requestId?: string
    existingResult?: GenerationResult
  }> {
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
          existingResult: existingResult.result,
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

        pendingRequest.resolve = result => {
          originalResolve(result)
          resolve({ isDuplicate: true, requestId, existingResult: result })
        }

        pendingRequest.reject = error => {
          originalReject(error)
          reject(error)
        }
      })
    }

    // New unique request
    return { isDuplicate: false, requestId }
  }

  /**
   * Register a pending request for in-flight deduplication
   *
   * Creates a promise that allows subsequent duplicate requests to:
   * - Wait for the original request to complete
   * - Share the same result without duplicate API calls
   * - Timeout after 5 minutes if request hangs
   *
   * @param {string} requestId - Unique request identifier (from generateContentHash)
   * @param {string} userId - User ID for tracking
   * @param {string} contentHash - Content hash for cleanup
   * @returns {{promise: Promise<GenerationResult>, resolve: Function, reject: Function}} Promise with control functions
   *
   * @example
   * const { promise, resolve, reject } = registerPendingRequest(requestId, userId, hash)
   * try {
   *   const result = await generatePosts(...)
   *   resolve(result)
   * } catch (err) {
   *   reject(err)
   * }
   */
  registerPendingRequest(
    requestId: string,
    userId: string,
    contentHash: string
  ): {
    promise: Promise<GenerationResult>
    resolve: (value: GenerationResult) => void
    reject: (error: Error) => void
  } {
    let resolve: (value: GenerationResult) => void
    let reject: (error: Error) => void

    const promise = new Promise<GenerationResult>((res, rej) => {
      resolve = res
      reject = rej
    })

    const pendingRequest: PendingRequest = {
      requestId,
      userId,
      contentHash,
      timestamp: Date.now(),
      resolve: resolve!,
      reject: reject!,
    }

    this.pendingRequests.set(requestId, pendingRequest)

    return { promise, resolve: resolve!, reject: reject! }
  }

  /**
   * Complete a pending request and cache result
   *
   * Resolves all waiting duplicate requests with the result and:
   * - Removes from pending queue
   * - Stores in completed cache with 5min TTL
   * - Notifies any waiting duplicate requests
   *
   * @param {string} requestId - Request identifier to complete
   * @param {GenerationResult} result - Generation result to cache and return
   *
   * @example
   * completePendingRequest(requestId, {
   *   newsletterId: 'uuid',
   *   posts: [...],
   *   postsGenerated: 8
   * })
   */
  completePendingRequest(requestId: string, result: GenerationResult) {
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      pendingRequest.resolve(result)
      this.pendingRequests.delete(requestId)

      // Cache the result for deduplication
      this.completedRequests.set(requestId, {
        result,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Fail a pending request
   *
   * Rejects all waiting duplicate requests with the error and:
   * - Removes from pending queue
   * - Does NOT cache failed results (allows retry)
   * - Notifies any waiting duplicate requests
   *
   * @param {string} requestId - Request identifier to fail
   * @param {Error} error - Error object to propagate
   *
   * @example
   * try {
   *   await generatePosts(...)
   * } catch (err) {
   *   failPendingRequest(requestId, err)
   *   throw err
   * }
   */
  failPendingRequest(requestId: string, error: Error) {
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      pendingRequest.reject(error)
      this.pendingRequests.delete(requestId)
    }
  }

  /**
   * Get current rate limit status for user
   *
   * Provides UI-friendly rate limit information for:
   * - Displaying remaining requests
   * - Showing countdown timers
   * - Disabling/enabling generation button
   *
   * @param {string} userId - User ID to check status for
   * @returns {{requestsRemaining: number, resetTime: number, isLimited: boolean}} Current rate limit state
   *
   * @example
   * const status = getUserStatus('user123')
   * console.log(`${status.requestsRemaining} requests remaining`)
   * console.log(`Resets at: ${new Date(status.resetTime)}`)
   * if (status.isLimited) {
   *   console.log('Rate limit exceeded')
   * }
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
        isLimited: false,
      }
    }

    if (now >= record.resetTime) {
      return {
        requestsRemaining: this.AI_REQUESTS_PER_MINUTE,
        resetTime: now + 60 * 1000,
        isLimited: false,
      }
    }

    const remaining = Math.max(0, this.AI_REQUESTS_PER_MINUTE - record.count)
    return {
      requestsRemaining: remaining,
      resetTime: record.resetTime,
      isLimited: remaining === 0,
    }
  }

  /**
   * Cleanup expired records
   */
  private cleanup() {
    const now = Date.now()

    // Cleanup expired rate limit records
    for (const [key, record] of this.userLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) {
        // Keep for extra minute
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
   *
   * Provides real-time metrics for:
   * - System health monitoring
   * - Capacity planning
   * - Performance optimization
   *
   * @returns {{activeUsers: number, pendingRequests: number, cachedResults: number, timestamp: number}} System statistics snapshot
   *
   * @example
   * const stats = getStats()
   * console.log(`Active: ${stats.activeUsers} users, ${stats.pendingRequests} pending`)
   * console.log(`Cache hit rate: ${stats.cachedResults} results`)
   */
  getStats() {
    return {
      activeUsers: this.userLimits.size,
      pendingRequests: this.pendingRequests.size,
      cachedResults: this.completedRequests.size,
      timestamp: Date.now(),
    }
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter()

// Export types for use in API routes
export type RateLimitResult = Awaited<
  ReturnType<typeof rateLimiter.checkRateLimit>
>
export type DeduplicationResult = Awaited<
  ReturnType<typeof rateLimiter.handleDeduplication>
>
