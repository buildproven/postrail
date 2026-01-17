/**
 * L7: Shared Post Types
 *
 * Common type definitions for social posts and newsletters
 */

import type { Platform } from './platform'

/**
 * Post types for newsletter-to-social conversion
 */
export type PostType = 'pre_cta' | 'post_cta'

/**
 * Post status lifecycle
 */
export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'

/**
 * Social post database record
 */
export interface SocialPost {
  id: string
  newsletter_id: string
  platform: Platform
  post_type: PostType
  content: string
  status: PostStatus
  platform_post_id?: string | null
  error_message?: string | null
  scheduled_for?: string | null
  published_at?: string | null
  created_at: string
  updated_at: string
}

/**
 * Newsletter database record
 */
export interface Newsletter {
  id: string
  user_id: string
  title: string | null
  content: string
  url: string | null
  newsletter_date: string | null
  created_at: string
  updated_at: string
}

/**
 * Post generation request
 */
export interface GeneratePostsRequest {
  title?: string
  content: string
  newsletterDate?: string
}
