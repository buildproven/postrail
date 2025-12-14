/**
 * Zod Validation Schemas
 *
 * Centralized request/response schemas for API validation.
 */

import { z } from 'zod'

// =============================================================================
// COMMON SCHEMAS
// =============================================================================

export const uuidSchema = z.string().uuid()

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const timestampSchema = z.string().datetime()

// =============================================================================
// NEWSLETTER SCHEMAS
// =============================================================================

export const newsletterContentSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(50).max(100000),
  sourceUrl: z.string().url().optional(),
})

export const newsletterSchema = newsletterContentSchema.extend({
  id: uuidSchema,
  userId: uuidSchema,
  status: z.enum(['draft', 'published', 'archived']),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

// =============================================================================
// SOCIAL POST SCHEMAS
// =============================================================================

export const platformSchema = z.enum(['linkedin', 'threads', 'x', 'facebook'])

export const postTypeSchema = z.enum(['pre_cta', 'post_cta'])

export const postStatusSchema = z.enum([
  'draft',
  'scheduled',
  'published',
  'failed',
])

export const socialPostSchema = z.object({
  id: uuidSchema,
  platform: platformSchema,
  postType: postTypeSchema,
  content: z.string().min(1).max(10000),
  characterCount: z.number().int().min(0),
  status: postStatusSchema,
  scheduledTime: timestampSchema.optional().nullable(),
  publishedAt: timestampSchema.optional().nullable(),
  platformPostId: z.string().optional().nullable(),
  errorMessage: z.string().optional().nullable(),
})

// Character limits per platform
export const PLATFORM_CHAR_LIMITS = {
  linkedin: 3000,
  threads: 500,
  x: 280,
  facebook: 63206,
} as const

export const validatePostLength = (
  platform: z.infer<typeof platformSchema>,
  content: string
): boolean => {
  return content.length <= PLATFORM_CHAR_LIMITS[platform]
}

// =============================================================================
// GENERATION SCHEMAS
// =============================================================================

export const generatePostsRequestSchema = z.object({
  content: z.string().min(50, 'Content must be at least 50 characters'),
  title: z.string().min(1).max(500).optional(),
  platforms: z.array(platformSchema).min(1).max(4).default(['linkedin', 'x']),
  postTypes: z.array(postTypeSchema).min(1).max(2).default(['post_cta']),
  tone: z
    .enum(['professional', 'casual', 'enthusiastic'])
    .default('professional'),
})

export const generatePostsResponseSchema = z.object({
  posts: z.array(socialPostSchema),
  tokensUsed: z.number().int(),
  generationId: uuidSchema,
})

// =============================================================================
// SCRAPER SCHEMAS
// =============================================================================

export const scrapeRequestSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .refine(
      url => {
        const parsed = new URL(url)
        return ['http:', 'https:'].includes(parsed.protocol)
      },
      { message: 'URL must use HTTP or HTTPS protocol' }
    ),
})

export const scrapeResponseSchema = z.object({
  title: z.string(),
  content: z.string(),
  excerpt: z.string().optional(),
  author: z.string().optional(),
  publishedDate: z.string().optional(),
  siteName: z.string().optional(),
})

// =============================================================================
// PLATFORM CONNECTION SCHEMAS
// =============================================================================

export const platformConnectionSchema = z.object({
  id: uuidSchema,
  platform: platformSchema,
  platformUserId: z.string(),
  platformUsername: z.string(),
  platformDisplayName: z.string().optional(),
  platformAvatarUrl: z.string().url().optional(),
  pageId: z.string().optional().nullable(),
  pageName: z.string().optional().nullable(),
  isActive: z.boolean(),
  lastUsedAt: timestampSchema.optional().nullable(),
})

export const connectPlatformRequestSchema = z.object({
  platform: platformSchema,
  code: z.string().min(1),
  state: z.string().optional(),
  redirectUri: z.string().url().optional(),
})

// =============================================================================
// BILLING SCHEMAS
// =============================================================================

export const subscriptionTierSchema = z.enum(['trial', 'standard', 'growth'])

export const subscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'cancelled',
  'past_due',
  'expired',
])

export const checkoutRequestSchema = z.object({
  tier: z.enum(['standard', 'growth']),
})

export const subscriptionResponseSchema = z.object({
  tier: subscriptionTierSchema,
  tierName: z.string(),
  status: subscriptionStatusSchema,
  limits: z.object({
    dailyGenerations: z.number(),
    totalGenerations: z.number(),
    platforms: z.number(),
  }),
  features: z.array(z.string()),
  currentPeriodEnd: timestampSchema.optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
})

// =============================================================================
// USER SCHEMAS
// =============================================================================

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: z.string().email(),
  fullName: z.string().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  subscriptionStatus: subscriptionStatusSchema,
  subscriptionTier: subscriptionTierSchema,
  trialEndsAt: timestampSchema.optional(),
  generationsToday: z.number().int(),
  generationsTotal: z.number().int(),
})

// =============================================================================
// API ERROR SCHEMAS
// =============================================================================

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Parse and validate request body with proper error handling
 */
export function parseRequestBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const result = schema.safeParse(body)

  if (!result.success) {
    const firstError = result.error.issues[0]
    const path = firstError.path.join('.')
    const message = path ? `${path}: ${firstError.message}` : firstError.message
    return { success: false, error: message }
  }

  return { success: true, data: result.data }
}

/**
 * Parse query parameters from URLSearchParams
 */
export function parseQueryParams<T extends z.ZodType>(
  schema: T,
  params: URLSearchParams
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  const obj: Record<string, string> = {}
  params.forEach((value, key) => {
    obj[key] = value
  })

  return parseRequestBody(schema, obj)
}

// Export types
export type Platform = z.infer<typeof platformSchema>
export type PostType = z.infer<typeof postTypeSchema>
export type PostStatus = z.infer<typeof postStatusSchema>
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>
export type GeneratePostsRequest = z.infer<typeof generatePostsRequestSchema>
export type ScrapeRequest = z.infer<typeof scrapeRequestSchema>
export type SocialPost = z.infer<typeof socialPostSchema>
