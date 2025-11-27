/**
 * Structured Logging with Pino
 *
 * Provides JSON-formatted structured logging for production observability.
 * Automatically redacts sensitive fields like passwords, tokens, and emails.
 *
 * Ported from saas-starter-template
 */

import pino from 'pino'

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
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
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
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'

  logger[level](
    {
      type: 'http.response',
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration,
    },
    `${req.method} ${req.url} ${res.statusCode} ${duration}ms`
  )
}

/**
 * Log business events
 */
export const events = {
  newsletterCreated: (newsletterId: string, userId: string) => {
    logger.info(
      {
        type: 'newsletter.created',
        newsletterId,
        userId,
      },
      'Newsletter created'
    )
  },

  postsGenerated: (newsletterId: string, count: number, duration: number) => {
    logger.info(
      {
        type: 'posts.generated',
        newsletterId,
        count,
        duration,
      },
      `Generated ${count} posts in ${duration}ms`
    )
  },

  aiGenerationStarted: (userId: string, requestId: string) => {
    logger.info(
      {
        type: 'ai.generation.started',
        userId,
        requestId,
      },
      'AI generation started'
    )
  },

  aiGenerationCompleted: (userId: string, requestId: string, duration: number) => {
    logger.info(
      {
        type: 'ai.generation.completed',
        userId,
        requestId,
        duration,
      },
      `AI generation completed in ${duration}ms`
    )
  },

  cacheHit: (key: string) => {
    logger.debug({ type: 'cache.hit', key }, `Cache hit: ${key}`)
  },

  cacheMiss: (key: string) => {
    logger.debug({ type: 'cache.miss', key }, `Cache miss: ${key}`)
  },

  deduplicationHit: (requestId: string) => {
    logger.info(
      { type: 'dedup.hit', requestId },
      `Deduplication hit: returning cached result`
    )
  },
}

/**
 * Log errors with context
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
 * Log security events
 */
export const security = {
  rateLimitExceeded: (userId: string, endpoint: string, retryAfter: number) => {
    logger.warn(
      {
        type: 'security.rate_limit',
        userId,
        endpoint,
        retryAfter,
      },
      `Rate limit exceeded for user ${userId}`
    )
  },

  ssrfBlocked: (url: string, reason: string) => {
    logger.error(
      {
        type: 'security.ssrf_blocked',
        url,
        reason,
      },
      `SSRF attempt blocked: ${reason}`
    )
  },

  unauthorizedAccess: (userId: string | undefined, resource: string) => {
    logger.warn(
      {
        type: 'security.unauthorized',
        userId,
        resource,
      },
      `Unauthorized access attempt to ${resource}`
    )
  },
}

export default logger
