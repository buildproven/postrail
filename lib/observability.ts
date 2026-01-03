/**
 * Structured Observability and Logging
 *
 * Provides structured logging, metrics collection, and monitoring
 * for production readiness and incident response.
 *
 * Security Finding: Minimal observability (ad-hoc console.error)
 * Solution: Structured logging, metrics, alerts, health checks
 */

import crypto from 'crypto'

// Log levels
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// Type-safe metadata values (replaces Record<string, any>)
// Uses unknown for flexibility while still being type-safe (requires checks at usage)
export type ObservabilityMetadata = Record<string, unknown>

// Event types for metrics
export type EventType =
  | 'ai_generation_request'
  | 'ai_generation_success'
  | 'ai_generation_failure'
  | 'ai_generation_rate_limited'
  | 'ai_generation_cache_race'
  | 'scrape_request'
  | 'scrape_success'
  | 'scrape_failure'
  | 'scrape_ssrf_blocked'
  | 'scrape_rate_limited'
  | 'twitter_post_request'
  | 'twitter_post_success'
  | 'twitter_post_failure'
  | 'twitter_post_duplicate'
  | 'monitoring_unauthorized_access'
  | 'monitoring_rate_limited'
  | 'supabase_error'
  | 'anthropic_error'
  | 'twitter_api_error'
  | 'trial_access_denied'
  | 'public_demo_rate_limited'
  | 'public_demo_success'
  | 'public_demo_failure'

// Structured log entry
interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  requestId?: string
  userId?: string
  event?: EventType
  duration?: number
  error?: {
    name: string
    message: string
    stack?: string
  }
  metadata?: ObservabilityMetadata
  source: string
}

// Metrics collection
interface Metric {
  event: EventType
  timestamp: number
  userId?: string
  duration?: number
  metadata?: ObservabilityMetadata
}

// Health check status
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: number
  checks: Record<
    string,
    { status: 'pass' | 'fail'; details?: string; latency?: number }
  >
  metrics: {
    uptime: number
    requestsPerMinute: number
    errorRate: number
    averageResponseTime: number
  }
}

class ObservabilityManager {
  private logs: LogEntry[] = []
  private metrics: Metric[] = []
  private startTime: number = Date.now()

  // Configuration
  private readonly MAX_LOGS = 1000 // Keep last 1000 log entries
  private readonly MAX_METRICS = 5000 // Keep last 5000 metrics
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000 // Cleanup every 5 minutes

  // Request tracking
  private activeRequests = new Map<
    string,
    { startTime: number; type: string }
  >()

  // Cleanup interval reference for graceful shutdown
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Periodic cleanup of old logs and metrics
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      this.CLEANUP_INTERVAL
    )
  }

  /**
   * Stop the cleanup interval (for graceful shutdown or testing)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Generate a unique request ID
   */
  generateRequestId(): string {
    return crypto.randomBytes(8).toString('hex')
  }

  /**
   * Start tracking a request
   */
  startRequest(requestId: string, type: string): void {
    this.activeRequests.set(requestId, {
      startTime: Date.now(),
      type,
    })
  }

  /**
   * End tracking a request and return duration
   */
  endRequest(requestId: string): number | undefined {
    const request = this.activeRequests.get(requestId)
    if (request) {
      this.activeRequests.delete(requestId)
      return Date.now() - request.startTime
    }
    return undefined
  }

  /**
   * Structured logging method
   */
  log(
    level: LogLevel,
    message: string,
    options: {
      requestId?: string
      userId?: string
      event?: EventType
      duration?: number
      error?: Error
      metadata?: ObservabilityMetadata
      source?: string
    } = {}
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      requestId: options.requestId,
      userId: options.userId,
      event: options.event,
      duration: options.duration,
      source: options.source || 'unknown',
      metadata: options.metadata,
    }

    // Format error if provided
    if (options.error) {
      entry.error = {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack,
      }
    }

    // Store log entry
    this.logs.push(entry)

    // Console output with structured format
    const logLevel = level.toUpperCase()
    const timestamp = entry.timestamp
    const requestId = options.requestId ? `[${options.requestId}]` : ''
    const userId = options.userId ? `{${options.userId.substring(0, 8)}}` : ''
    const duration = options.duration ? `(${options.duration}ms)` : ''

    const logMessage = `${timestamp} ${logLevel} ${requestId}${userId}${duration} ${message}`

    // Output to console based on level (using native console for observability layer)
    switch (level) {
      case 'debug':
        console.debug(logMessage, options.metadata || '')
        break
      case 'info':
        console.info(logMessage, options.metadata || '')
        break
      case 'warn':
        console.warn(logMessage, options.metadata || '')
        break
      case 'error':
      case 'fatal':
        console.error(logMessage, entry.error || options.metadata || '')
        break
    }

    // Record metric if event type provided
    if (options.event) {
      this.recordMetric(options.event, {
        userId: options.userId,
        duration: options.duration,
        metadata: options.metadata,
      })
    }
  }

  /**
   * Convenience methods for different log levels
   */
  debug(message: string, options: Parameters<typeof this.log>[2] = {}) {
    this.log('debug', message, {
      ...options,
      source: options.source || 'debug',
    })
  }

  info(message: string, options: Parameters<typeof this.log>[2] = {}) {
    this.log('info', message, { ...options, source: options.source || 'info' })
  }

  warn(message: string, options: Parameters<typeof this.log>[2] = {}) {
    this.log('warn', message, { ...options, source: options.source || 'warn' })
  }

  error(message: string, options: Parameters<typeof this.log>[2] = {}) {
    this.log('error', message, {
      ...options,
      source: options.source || 'error',
    })
  }

  fatal(message: string, options: Parameters<typeof this.log>[2] = {}) {
    this.log('fatal', message, {
      ...options,
      source: options.source || 'fatal',
    })
  }

  /**
   * Record metrics for monitoring
   */
  private recordMetric(
    event: EventType,
    options: {
      userId?: string
      duration?: number
      metadata?: ObservabilityMetadata
    } = {}
  ): void {
    const metric: Metric = {
      event,
      timestamp: Date.now(),
      userId: options.userId,
      duration: options.duration,
      metadata: options.metadata,
    }

    this.metrics.push(metric)
  }

  /**
   * Get recent logs
   */
  getLogs(
    options: {
      level?: LogLevel
      event?: EventType
      userId?: string
      requestId?: string
      limit?: number
      since?: number
    } = {}
  ): LogEntry[] {
    let filtered = this.logs

    // Filter by level
    if (options.level) {
      const levelPriority = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 }

      const minPriority = levelPriority[options.level]

      filtered = filtered.filter(log => levelPriority[log.level] >= minPriority)
    }

    // Filter by event
    if (options.event) {
      filtered = filtered.filter(log => log.event === options.event)
    }

    // Filter by user
    if (options.userId) {
      filtered = filtered.filter(log => log.userId === options.userId)
    }

    // Filter by request ID
    if (options.requestId) {
      filtered = filtered.filter(log => log.requestId === options.requestId)
    }

    // Filter by time
    if (options.since) {
      filtered = filtered.filter(
        log => new Date(log.timestamp).getTime() >= options.since!
      )
    }

    // Sort by timestamp (most recent first)
    filtered.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    // Apply limit
    if (options.limit) {
      filtered = filtered.slice(0, options.limit)
    }

    return filtered
  }

  /**
   * Get metrics summary
   */
  getMetrics(
    options: {
      event?: EventType
      since?: number
      window?: number // Time window in ms
    } = {}
  ): {
    counts: Record<EventType, number>
    averageDurations: Record<EventType, number>
    errorRates: Record<string, number>
    recentEvents: Metric[]
  } {
    const since =
      options.since || Date.now() - (options.window || 60 * 60 * 1000) // Default: last hour
    let filtered = this.metrics.filter(metric => metric.timestamp >= since)

    // Filter by event type
    if (options.event) {
      filtered = filtered.filter(metric => metric.event === options.event)
    }

    // Count events
    const counts = filtered.reduce(
      (acc, metric) => {
        acc[metric.event] = (acc[metric.event] || 0) + 1
        return acc
      },
      {} as Record<EventType, number>
    )

    // Calculate average durations
    const durations = filtered
      .filter(metric => metric.duration !== undefined)
      .reduce(
        (acc, metric) => {
          if (!acc[metric.event]) {
            acc[metric.event] = { total: 0, count: 0 }
          }
          acc[metric.event].total += metric.duration!
          acc[metric.event].count++
          return acc
        },
        {} as Record<EventType, { total: number; count: number }>
      )

    const averageDurations = Object.entries(durations).reduce(
      (acc, [event, data]) => {
        acc[event as EventType] = Math.round(data.total / data.count)
        return acc
      },
      {} as Record<EventType, number>
    )

    // Calculate error rates
    const eventGroups = ['ai_generation', 'scrape', 'twitter_post'] as const
    const errorRateMap = new Map<string, number>()

    for (const group of eventGroups) {
      const totalEvents = Object.entries(counts)
        .filter(([event]) => event.startsWith(group))
        .reduce((sum, [, count]) => sum + count, 0)

      const errorEvents = Object.entries(counts)
        .filter(
          ([event]) =>
            event.startsWith(group) &&
            (event.includes('failure') || event.includes('error'))
        )
        .reduce((sum, [, count]) => sum + count, 0)

      if (totalEvents > 0) {
        errorRateMap.set(
          group,
          Math.round((errorEvents / totalEvents) * 100) / 100
        ) // Round to 2 decimals
      }
    }

    return {
      counts,
      averageDurations,
      errorRates: Object.fromEntries(errorRateMap),
      recentEvents: filtered.slice(-50), // Last 50 events
    }
  }

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const now = Date.now()
    const oneMinuteAgo = now - 60 * 1000
    const recentMetrics = this.metrics.filter(m => m.timestamp >= oneMinuteAgo)

    // Calculate request rate
    const requestsPerMinute = recentMetrics.length

    // Calculate error rate
    const errors = recentMetrics.filter(
      m => m.event.includes('failure') || m.event.includes('error')
    ).length
    const errorRate = requestsPerMinute > 0 ? errors / requestsPerMinute : 0

    // Calculate average response time
    const durationsWithValues = recentMetrics.filter(
      m => m.duration !== undefined
    )
    const averageResponseTime =
      durationsWithValues.length > 0
        ? durationsWithValues.reduce((sum, m) => sum + m.duration!, 0) /
          durationsWithValues.length
        : 0

    // Health checks
    const checks: HealthStatus['checks'] = {
      uptime: {
        status: 'pass',
        details: `${Math.round((now - this.startTime) / 1000)}s`,
      },
      error_rate: {
        status: errorRate > 0.1 ? 'fail' : 'pass', // Fail if >10% error rate
        details: `${(errorRate * 100).toFixed(1)}%`,
      },
      response_time: {
        status: averageResponseTime > 5000 ? 'fail' : 'pass', // Fail if >5s average
        details: `${averageResponseTime.toFixed(0)}ms`,
      },
      memory_usage: {
        status: this.logs.length > this.MAX_LOGS * 0.9 ? 'fail' : 'pass',
        details: `${this.logs.length}/${this.MAX_LOGS} logs`,
      },
    }

    // Determine overall status
    const failedChecks = Object.values(checks).filter(
      check => check.status === 'fail'
    ).length
    const status: HealthStatus['status'] =
      failedChecks === 0
        ? 'healthy'
        : failedChecks <= 1
          ? 'degraded'
          : 'unhealthy'

    return {
      status,
      timestamp: now,
      checks,
      metrics: {
        uptime: now - this.startTime,
        requestsPerMinute,
        errorRate,
        averageResponseTime: Math.round(averageResponseTime),
      },
    }
  }

  /**
   * Clean up old logs and metrics
   */
  private cleanup(): void {
    // Keep only recent logs
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS)
    }

    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS)
    }

    // Clean up old active requests (>1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    for (const [requestId, request] of this.activeRequests.entries()) {
      if (request.startTime < oneHourAgo) {
        this.activeRequests.delete(requestId)
      }
    }

    this.debug('Observability cleanup completed', {
      metadata: {
        logsCount: this.logs.length,
        metricsCount: this.metrics.length,
        activeRequestsCount: this.activeRequests.size,
      },
    })
  }

  /**
   * Get system statistics
   */
  getStats() {
    return {
      uptime: Date.now() - this.startTime,
      totalLogs: this.logs.length,
      totalMetrics: this.metrics.length,
      activeRequests: this.activeRequests.size,
      memoryUsage: {
        logs: this.logs.length,
        metrics: this.metrics.length,
        maxLogs: this.MAX_LOGS,
        maxMetrics: this.MAX_METRICS,
      },
    }
  }
}

// Singleton instance
export const observability = new ObservabilityManager()

// Helper functions for common operations
export const withObservability = {
  /**
   * Wrap an async function with observability
   */
  async trace<T>(
    operation: string,
    fn: (requestId: string) => Promise<T>,
    options: {
      userId?: string
      event?: EventType
      metadata?: ObservabilityMetadata
    } = {}
  ): Promise<T> {
    const requestId = observability.generateRequestId()
    observability.startRequest(requestId, operation)

    const startTime = Date.now()

    observability.info(`Starting ${operation}`, {
      requestId,
      userId: options.userId,
      event: options.event,
      metadata: options.metadata,
    })

    try {
      const result = await fn(requestId)
      const duration =
        observability.endRequest(requestId) || Date.now() - startTime

      observability.info(`Completed ${operation}`, {
        requestId,
        userId: options.userId,
        event: options.event,
        duration,
        metadata: options.metadata,
      })

      return result
    } catch (error) {
      const duration =
        observability.endRequest(requestId) || Date.now() - startTime

      observability.error(`Failed ${operation}`, {
        requestId,
        userId: options.userId,
        event: options.event,
        duration,
        error: error as Error,
        metadata: options.metadata,
      })

      throw error
    }
  },
}

// Export types (EventType already exported at declaration)
export type { LogEntry, Metric, HealthStatus }
