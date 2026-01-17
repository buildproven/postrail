/**
 * L7: Shared Types Directory
 *
 * Central location for common type definitions used across the application.
 * Import from `@/types` instead of individual files.
 *
 * Benefits:
 * - Single source of truth for shared types
 * - Prevents type duplication
 * - Easier refactoring (change once, update everywhere)
 * - Better IDE autocomplete
 * - Clear type dependencies
 *
 * Usage:
 * ```typescript
 * import type { Platform, PostStatus, SubscriptionTier } from '@/types'
 * ```
 */

// Platform types
export type { Platform, PlatformConnectionMetadata } from './platform'
export { PLATFORM_CHAR_LIMITS, PLATFORM_NAMES } from './platform'

// Post and newsletter types
export type {
  PostType,
  PostStatus,
  SocialPost,
  Newsletter,
  GeneratePostsRequest,
} from './post'

// Subscription and billing types
export type {
  SubscriptionTier,
  SubscriptionStatus,
  TierConfig,
  UserSubscription,
  CheckoutOptions,
} from './subscription'

// Rate limiting types
export interface RateLimitResult {
  allowed: boolean
  requestsRemaining: number
  resetTime: number
  retryAfter?: number
  reason?: string
}

// Error types
export type ErrorCategory = 'retryable' | 'permanent' | 'user_action_required'

export interface ClassifiedError {
  category: ErrorCategory
  message: string
  userMessage: string
  shouldRetry: boolean
  retryAfter?: number
  metadata?: Record<string, unknown>
}

// User types
export type UserRole = 'admin' | 'user'

export interface UserProfile {
  user_id: string
  subscription_status: import('./subscription').SubscriptionTier
  stripe_customer_id?: string | null
  subscription_expires_at?: string | null
  trial_posts_generated?: number
  trial_started_at?: string | null
  ai_tone?: Record<string, unknown> | null
  timezone?: string | null
  created_at: string
  updated_at: string
}
