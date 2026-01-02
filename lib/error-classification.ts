/**
 * Error Classification System
 *
 * Classifies errors as retryable (transient) vs permanent to help users
 * understand what actions they can take.
 *
 * Retryable errors: Temporary issues that may succeed if retried
 * Permanent errors: Require user action or configuration changes
 */

export type ErrorCategory = 'retryable' | 'permanent' | 'user_action_required'

export interface ClassifiedError {
  category: ErrorCategory
  userMessage: string
  technicalDetails: string
  retryable: boolean
  suggestedAction: string
  retryDelay?: number // milliseconds
}

/**
 * Classify an error based on its message and type
 */
export function classifyError(error: Error | string): ClassifiedError {
  const errorMessage = typeof error === 'string' ? error : error.message
  const errorLower = errorMessage.toLowerCase()

  // Network & API errors (retryable)
  if (
    errorLower.includes('econnrefused') ||
    errorLower.includes('enotfound') ||
    errorLower.includes('timeout') ||
    errorLower.includes('network') ||
    errorLower.includes('fetch failed')
  ) {
    return {
      category: 'retryable',
      retryable: true,
      userMessage: 'Network connection issue - please try again',
      technicalDetails: errorMessage,
      suggestedAction: 'Check your internet connection and retry',
      retryDelay: 5000, // 5 seconds
    }
  }

  // Rate limiting (retryable with delay)
  if (
    errorLower.includes('rate limit') ||
    errorLower.includes('too many requests') ||
    errorLower.includes('429')
  ) {
    return {
      category: 'retryable',
      retryable: true,
      userMessage: 'Rate limit reached - please wait before retrying',
      technicalDetails: errorMessage,
      suggestedAction: 'Wait 1-2 minutes before trying again',
      retryDelay: 60000, // 1 minute
    }
  }

  // Authentication errors (permanent - user action required)
  if (
    errorLower.includes('unauthorized') ||
    errorLower.includes('401') ||
    errorLower.includes('forbidden') ||
    errorLower.includes('403') ||
    errorLower.includes('invalid token') ||
    errorLower.includes('expired token')
  ) {
    return {
      category: 'user_action_required',
      retryable: false,
      userMessage: 'Authentication failed - please reconnect your account',
      technicalDetails: errorMessage,
      suggestedAction:
        'Go to Settings → Connections and reconnect this platform',
    }
  }

  // Validation errors (permanent - user must fix input)
  if (
    errorLower.includes('validation') ||
    errorLower.includes('invalid') ||
    errorLower.includes('400') ||
    errorLower.includes('bad request')
  ) {
    return {
      category: 'permanent',
      retryable: false,
      userMessage: 'Invalid input - please check your data',
      technicalDetails: errorMessage,
      suggestedAction: 'Review and correct the highlighted fields',
    }
  }

  // Service unavailable (retryable)
  if (
    errorLower.includes('503') ||
    errorLower.includes('service unavailable') ||
    errorLower.includes('temporarily unavailable')
  ) {
    return {
      category: 'retryable',
      retryable: true,
      userMessage: 'Service temporarily unavailable',
      technicalDetails: errorMessage,
      suggestedAction:
        'The service is experiencing issues. Please try again in a few minutes.',
      retryDelay: 120000, // 2 minutes
    }
  }

  // Database errors (retryable)
  if (
    errorLower.includes('database') ||
    errorLower.includes('postgres') ||
    errorLower.includes('deadlock') ||
    errorLower.includes('connection pool')
  ) {
    return {
      category: 'retryable',
      retryable: true,
      userMessage: 'Database connection issue - please try again',
      technicalDetails: errorMessage,
      suggestedAction: 'Retry in a few seconds',
      retryDelay: 3000, // 3 seconds
    }
  }

  // AI/LLM specific errors
  if (
    errorLower.includes('overloaded') ||
    errorLower.includes('overloaded_error')
  ) {
    return {
      category: 'retryable',
      retryable: true,
      userMessage: 'AI service is currently overloaded',
      technicalDetails: errorMessage,
      suggestedAction: 'Please wait a moment and try again',
      retryDelay: 10000, // 10 seconds
    }
  }

  // Configuration errors (permanent)
  if (
    errorLower.includes('not configured') ||
    errorLower.includes('missing api key') ||
    errorLower.includes('invalid api key')
  ) {
    return {
      category: 'permanent',
      retryable: false,
      userMessage: 'Service configuration error',
      technicalDetails: errorMessage,
      suggestedAction: 'Contact support - service configuration issue',
    }
  }

  // Default: Unknown error (retryable with caution)
  return {
    category: 'retryable',
    retryable: true,
    userMessage: 'An unexpected error occurred',
    technicalDetails: errorMessage,
    suggestedAction:
      'Please try again. If the problem persists, contact support.',
    retryDelay: 5000,
  }
}

/**
 * Helper to create user-friendly error responses
 */
export function formatErrorResponse(error: Error | string) {
  const classified = classifyError(error)

  return {
    error: classified.userMessage,
    retryable: classified.retryable,
    suggestedAction: classified.suggestedAction,
    ...(classified.retryDelay && {
      retryAfter: Math.ceil(classified.retryDelay / 1000),
    }),
    // Only include technical details in development
    ...(process.env.NODE_ENV === 'development' && {
      technicalDetails: classified.technicalDetails,
    }),
  }
}
