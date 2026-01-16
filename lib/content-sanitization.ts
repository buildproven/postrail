/**
 * Content Sanitization Utility
 *
 * VBL4: OWASP A03 Injection Prevention
 * Sanitizes AI-generated content to prevent XSS and injection attacks
 */

import DOMPurify from 'isomorphic-dompurify'
import { logger } from './logger'

/**
 * Dangerous patterns that should be detected and logged
 */
const DANGEROUS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi, // Event handlers like onclick=
  /javascript:/gi,
  /data:text\/html/gi,
  /<iframe/gi,
  /<object/gi,
  /<embed/gi,
]

/**
 * Sanitize AI-generated content to prevent XSS and injection attacks
 *
 * @param content - The raw content from AI generation
 * @param context - Context for logging (e.g., 'post_generation', 'variant_generation')
 * @returns Sanitized content safe for storage and display
 */
export function sanitizeAIContent(
  content: string,
  context: string = 'unknown'
): string {
  if (!content || typeof content !== 'string') {
    return ''
  }

  // Detect dangerous patterns before sanitization for logging
  const detectedPatterns: string[] = []
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(content)) {
      detectedPatterns.push(pattern.source)
    }
  }

  // Log if dangerous patterns detected (potential AI hallucination or attack)
  if (detectedPatterns.length > 0) {
    logger.warn({
      type: 'security.content_sanitization',
      context,
      patternsDetected: detectedPatterns,
      contentLength: content.length,
      contentPreview: content.substring(0, 100),
      msg: 'Dangerous patterns detected in AI-generated content - sanitizing',
    })
  }

  // Sanitize with DOMPurify
  const sanitized = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [], // Strip all HTML tags - social media posts are plain text
    ALLOWED_ATTR: [], // No attributes allowed
    KEEP_CONTENT: true, // Keep text content
  })

  // Additional validation: ensure no script-like content remains
  if (
    sanitized.toLowerCase().includes('<script') ||
    // eslint-disable-next-line no-script-url -- Checking for XSS patterns
    sanitized.toLowerCase().includes('javascript:')
  ) {
    logger.error({
      type: 'security.sanitization_failure',
      context,
      msg: 'Content still contains dangerous patterns after sanitization',
    })
    // Return empty string as fail-safe
    return ''
  }

  return sanitized.trim()
}

/**
 * Sanitize metadata object (for variant metadata, etc.)
 *
 * @param metadata - Object containing user-generated or AI-generated content
 * @returns Sanitized metadata object
 */
export function sanitizeMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeAIContent(value, 'metadata')
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item =>
        typeof item === 'string' ? sanitizeAIContent(item, 'metadata') : item
      )
    } else if (value && typeof value === 'object' && value.constructor === Object) {
      // Only recurse for plain objects, not Date, RegExp, etc.
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>)
    } else {
      // Preserve Date, number, boolean, null, etc.
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Validate that content doesn't exceed platform limits after sanitization
 *
 * @param content - Sanitized content
 * @param platform - Social media platform
 * @returns Object with isValid flag and sanitized content
 */
export function validateContentLength(
  content: string,
  platform: 'twitter' | 'linkedin' | 'facebook' | 'threads'
): { isValid: boolean; content: string; reason?: string } {
  const PLATFORM_LIMITS = {
    twitter: 280,
    threads: 500,
    linkedin: 3000,
    facebook: 63206,
  }

  const limit = PLATFORM_LIMITS[platform]
  const length = content.length

  if (length > limit) {
    return {
      isValid: false,
      content,
      reason: `Content exceeds ${platform} limit of ${limit} characters (${length} chars)`,
    }
  }

  return { isValid: true, content }
}
