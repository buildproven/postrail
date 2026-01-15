/**
 * Structured Logging with Pino + Sentry Breadcrumbs
 *
 * Provides JSON-formatted structured logging for production observability.
 * Automatically redacts sensitive fields like passwords, tokens, and emails.
 * Adds Sentry breadcrumbs for error context when Sentry is configured.
 *
 * Ported from saas-starter-template
 */

import pino from 'pino'
import * as Sentry from '@sentry/nextjs'

/**
 * Add a Sentry breadcrumb for error context
 */
function addBreadcrumb(
  category: string,
  message: string,
  level: Sentry.SeverityLevel = 'info',
  data?: Record<string, unknown>
) {
  if (
    typeof window !== 'undefined' ||
    process.env.SENTRY_DSN ||
    process.env.NEXT_PUBLIC_SENTRY_DSN
  ) {
    Sentry.addBreadcrumb({
      category,
      message,
      level,
      data,
      timestamp: Date.now() / 1000,
    })
  }
}

// Determine if we're in development
const isDevelopment = process.env.NODE_ENV === 'development'

// Create logger instance
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

  // Pretty print in development, JSON in production
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      }
    : undefined,

  // Formatters
  formatters: {
    level: label => ({ level: label }),
    bindings: bindings => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
    }),
  },

  // Serialize errors properly
  serializers: {
    error: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },

  // Redact sensitive fields
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'req.body.secret',
      'email',
      'apiKey',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    remove: true,
  },

  // Base fields included in all logs
  base: {
    env: process.env.NODE_ENV,
    app: 'postrail',
  },
})

/**
 * Create a child logger with additional context
 */
export function createContextLogger(context: Record<string, unknown>) {
  return logger.child(context)
}

/**
 * Log HTTP request
 */
export function logRequest(req: {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  userId?: string
}) {
  logger.info(
    {
      type: 'http.request',
      method: req.method,
      url: req.url,
      userId: req.userId,
      userAgent: req.headers['user-agent'],
      ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'],
    },
    `${req.method} ${req.url}`
  )
}

/**
 * Log HTTP response
 */
export function logResponse(
  req: { method: string; url: string },
  res: { statusCode: number },
  duration: number
) {
  const logData = {
    type: 'http.response',
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration,
  }
  const message = `${req.method} ${req.url} ${res.statusCode} ${duration}ms`

  if (res.statusCode >= 500) {
    logger.error(logData, message)
  } else if (res.statusCode >= 400) {
    logger.warn(logData, message)
  } else {
    logger.info(logData, message)
  }
}

/**
 * Log business events with Sentry breadcrumbs
 */
export const events = {
  newsletterCreated: (newsletterId: string, userId: string) => {
    const message = 'Newsletter created'
    logger.info({ type: 'newsletter.created', newsletterId, userId }, message)
    addBreadcrumb('newsletter', message, 'info', { newsletterId, userId })
  },

  postsGenerated: (newsletterId: string, count: number, duration: number) => {
    const message = `Generated ${count} posts in ${duration}ms`
    logger.info(
      { type: 'posts.generated', newsletterId, count, duration },
      message
    )
    addBreadcrumb('generation', message, 'info', {
      newsletterId,
      count,
      duration,
    })
  },

  aiGenerationStarted: (userId: string, requestId: string) => {
    const message = 'AI generation started'
    logger.info({ type: 'ai.generation.started', userId, requestId }, message)
    addBreadcrumb('ai', message, 'info', { requestId })
  },

  aiGenerationCompleted: (
    userId: string,
    requestId: string,
    duration: number
  ) => {
    const message = `AI generation completed in ${duration}ms`
    logger.info(
      { type: 'ai.generation.completed', userId, requestId, duration },
      message
    )
    addBreadcrumb('ai', message, 'info', { requestId, duration })
  },

  cacheHit: (key: string) => {
    logger.debug({ type: 'cache.hit', key }, `Cache hit: ${key}`)
    addBreadcrumb('cache', `Cache hit: ${key}`, 'debug', { key })
  },

  cacheMiss: (key: string) => {
    logger.debug({ type: 'cache.miss', key }, `Cache miss: ${key}`)
    addBreadcrumb('cache', `Cache miss: ${key}`, 'debug', { key })
  },

  deduplicationHit: (requestId: string) => {
    const message = 'Deduplication hit: returning cached result'
    logger.info({ type: 'dedup.hit', requestId }, message)
    addBreadcrumb('dedup', message, 'info', { requestId })
  },
}

/**
 * Log errors with context and Sentry breadcrumb
 */
export function logError(error: Error, context?: Record<string, unknown>) {
  logger.error(
    {
      type: 'error',
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    },
    error.message
  )
  addBreadcrumb('error', error.message, 'error', {
    name: error.name,
    ...context,
  })
}

/**
 * Log performance metrics
 */
export function logPerformance(
  operation: string,
  duration: number,
  context?: Record<string, unknown>
) {
  logger.info(
    {
      type: 'performance',
      operation,
      duration,
      ...context,
    },
    `${operation} took ${duration}ms`
  )
}

/**
 * Log security events with Sentry breadcrumbs
 */
export const security = {
  rateLimitExceeded: (userId: string, endpoint: string, retryAfter: number) => {
    const message = `Rate limit exceeded for user ${userId}`
    logger.warn(
      { type: 'security.rate_limit', userId, endpoint, retryAfter },
      message
    )
    addBreadcrumb('security', message, 'warning', {
      userId,
      endpoint,
      retryAfter,
    })
  },

  ssrfBlocked: (url: string, reason: string) => {
    const message = `SSRF attempt blocked: ${reason}`
    logger.error({ type: 'security.ssrf_blocked', url, reason }, message)
    addBreadcrumb('security', message, 'error', { url, reason })
  },

  unauthorizedAccess: (userId: string | undefined, resource: string) => {
    const message = `Unauthorized access attempt to ${resource}`
    logger.warn({ type: 'security.unauthorized', userId, resource }, message)
    addBreadcrumb('security', message, 'warning', { userId, resource })
  },

  // Authentication events
  loginSuccess: (
    userId: string,
    email: string,
    method: string,
    context?: { ip?: string; userAgent?: string }
  ) => {
    const message = `User logged in via ${method}`
    logger.info(
      { type: 'auth.login.success', userId, email, method, ...context },
      message
    )
    addBreadcrumb('auth', message, 'info', { userId, email, method })
  },

  loginFailure: (
    email: string | undefined,
    reason: string,
    context?: { ip?: string; userAgent?: string }
  ) => {
    const message = `Login failed: ${reason}`
    logger.warn(
      { type: 'auth.login.failure', email, reason, ...context },
      message
    )
    addBreadcrumb('auth', message, 'warning', { email, reason })
  },

  logout: (userId: string, context?: { ip?: string; userAgent?: string }) => {
    const message = 'User logged out'
    logger.info({ type: 'auth.logout', userId, ...context }, message)
    addBreadcrumb('auth', message, 'info', { userId })
  },

  // Authorization events
  permissionDenied: (
    userId: string,
    permission: string,
    resource?: string,
    context?: Record<string, unknown>
  ) => {
    const message = `Permission denied: ${permission}`
    logger.warn(
      {
        type: 'authz.permission_denied',
        userId,
        permission,
        resource,
        ...context,
      },
      message
    )
    addBreadcrumb('authz', message, 'warning', { userId, permission, resource })
  },

  featureAccessDenied: (
    userId: string,
    feature: string,
    tier: string,
    reason: string
  ) => {
    const message = `Feature access denied: ${feature} (${reason})`
    logger.warn(
      { type: 'authz.feature_denied', userId, feature, tier, reason },
      message
    )
    addBreadcrumb('authz', message, 'warning', {
      userId,
      feature,
      tier,
      reason,
    })
  },

  trialAccessDenied: (
    userId: string,
    reason: 'daily_limit' | 'total_limit' | 'trial_expired',
    context?: { daily?: number; total?: number }
  ) => {
    const message = `Trial access denied: ${reason}`
    logger.warn(
      { type: 'authz.trial_denied', userId, reason, ...context },
      message
    )
    addBreadcrumb('authz', message, 'warning', { userId, reason })
  },

  // Billing events
  subscriptionCreated: (
    userId: string,
    tier: string,
    customerId: string,
    context?: Record<string, unknown>
  ) => {
    const message = `Subscription created: ${tier}`
    logger.info(
      {
        type: 'billing.subscription.created',
        userId,
        tier,
        customerId,
        ...context,
      },
      message
    )
    addBreadcrumb('billing', message, 'info', { userId, tier, customerId })
  },

  subscriptionUpdated: (
    userId: string,
    fromTier: string,
    toTier: string,
    customerId: string
  ) => {
    const message = `Subscription updated: ${fromTier} → ${toTier}`
    logger.info(
      {
        type: 'billing.subscription.updated',
        userId,
        fromTier,
        toTier,
        customerId,
      },
      message
    )
    addBreadcrumb('billing', message, 'info', { userId, fromTier, toTier })
  },

  subscriptionCancelled: (
    userId: string,
    tier: string,
    customerId: string,
    reason?: string
  ) => {
    const message = `Subscription cancelled: ${tier}`
    logger.info(
      {
        type: 'billing.subscription.cancelled',
        userId,
        tier,
        customerId,
        reason,
      },
      message
    )
    addBreadcrumb('billing', message, 'info', {
      userId,
      tier,
      customerId,
      reason,
    })
  },

  paymentFailed: (
    userId: string,
    customerId: string,
    amount: number,
    reason?: string
  ) => {
    const message = `Payment failed: $${(amount / 100).toFixed(2)}`
    logger.warn(
      { type: 'billing.payment.failed', userId, customerId, amount, reason },
      message
    )
    addBreadcrumb('billing', message, 'warning', {
      userId,
      customerId,
      amount,
      reason,
    })
  },

  paymentSucceeded: (
    userId: string,
    customerId: string,
    amount: number,
    invoiceId?: string
  ) => {
    const message = `Payment succeeded: $${(amount / 100).toFixed(2)}`
    logger.info(
      {
        type: 'billing.payment.succeeded',
        userId,
        customerId,
        amount,
        invoiceId,
      },
      message
    )
    addBreadcrumb('billing', message, 'info', { userId, customerId, amount })
  },

  // Platform credential events
  platformConnected: (
    userId: string,
    platform: string,
    platformUserId: string,
    platformUsername?: string
  ) => {
    const message = `Platform connected: ${platform}`
    logger.info(
      {
        type: 'platform.connected',
        userId,
        platform,
        platformUserId,
        platformUsername,
      },
      message
    )
    addBreadcrumb('platform', message, 'info', {
      userId,
      platform,
      platformUserId,
    })
  },

  platformDisconnected: (
    userId: string,
    platform: string,
    platformUserId: string
  ) => {
    const message = `Platform disconnected: ${platform}`
    logger.info(
      { type: 'platform.disconnected', userId, platform, platformUserId },
      message
    )
    addBreadcrumb('platform', message, 'info', { userId, platform })
  },

  platformAuthFailed: (
    userId: string | undefined,
    platform: string,
    reason: string,
    context?: Record<string, unknown>
  ) => {
    const message = `Platform auth failed: ${platform} (${reason})`
    logger.warn(
      { type: 'platform.auth_failed', userId, platform, reason, ...context },
      message
    )
    addBreadcrumb('platform', message, 'warning', { userId, platform, reason })
  },

  // Service authentication events
  serviceKeyInvalid: (
    service: string,
    reason: 'missing' | 'invalid' | 'inactive',
    context?: Record<string, unknown>
  ) => {
    const message = `Service key ${reason}: ${service}`
    logger.warn(
      { type: 'service.auth.invalid', service, reason, ...context },
      message
    )
    addBreadcrumb('service', message, 'warning', { service, reason })
  },

  serviceRateLimited: (
    service: string,
    limit: number,
    context?: Record<string, unknown>
  ) => {
    const message = `Service rate limited: ${service}`
    logger.warn(
      { type: 'service.rate_limited', service, limit, ...context },
      message
    )
    addBreadcrumb('service', message, 'warning', { service, limit })
  },
}

export default logger
