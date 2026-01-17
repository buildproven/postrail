/**
 * Content Sanitization Utility
 *
 * VBL4: OWASP A03 Injection Prevention
 * Sanitizes AI-generated content to prevent XSS and injection attacks
 * Sanitizes user input to prevent prompt injection attacks
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
    } else if (
      value &&
      typeof value === 'object' &&
      value.constructor === Object
    ) {
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

/**
 * VBL4: Prompt Injection Prevention Patterns
 *
 * These patterns attempt to manipulate AI behavior by injecting instructions
 */
const PROMPT_INJECTION_PATTERNS = [
  // Direct instruction injection
  /ignore\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?|commands?)/gi,
  /disregard\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?)/gi,
  /forget\s+(previous|all|above|prior)\s+(instructions?|prompts?|rules?)/gi,

  // Role manipulation
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /act\s+as\s+(a|an)\s+/gi,
  /pretend\s+to\s+be\s+/gi,
  /roleplay\s+as\s+/gi,

  // System prompt leakage attempts
  // VBL4: Split into multiple patterns to avoid ReDoS vulnerability
  /show\s+me\s+your\s+system\s+prompt/gi,
  /show\s+me\s+the\s+system\s+prompt/gi,
  /show\s+your\s+system\s+prompt/gi,
  /show\s+the\s+system\s+prompt/gi,
  /what\s+is\s+your\s+instruction/gi,
  /what\s+are\s+your\s+instruction/gi,
  /what\s+is\s+your\s+rule/gi,
  /what\s+are\s+your\s+rule/gi,
  /what\s+is\s+your\s+prompt/gi,
  /what\s+are\s+your\s+prompt/gi,
  /repeat\s+your\s+instruction/gi,
  /repeat\s+the\s+instruction/gi,
  /repeat\s+your\s+system\s+prompt/gi,
  /repeat\s+the\s+system\s+prompt/gi,

  // Output format manipulation
  /output\s+(in|as)\s+(json|xml|html|code)/gi,
  /format\s+(as|in)\s+(json|xml|html|code)/gi,
  /return\s+(only|just)\s+(json|xml|html|code)/gi,
]

/**
 * Sanitize user input to prevent prompt injection attacks
 *
 * This function:
 * 1. Detects and logs potential injection attempts
 * 2. Escapes special characters that could break prompt structure
 * 3. Removes/neutralizes dangerous instruction patterns
 *
 * @param input - User-provided text that will be used in AI prompts
 * @param context - Context for logging (e.g., 'newsletter_title', 'newsletter_content')
 * @returns Sanitized input safe for use in AI prompts
 */
export function sanitizePromptInput(
  input: string,
  context: string = 'unknown'
): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  // Detect injection patterns before sanitization for logging
  const detectedPatterns: string[] = []
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detectedPatterns.push(pattern.source)
    }
  }

  // Log if injection patterns detected (potential attack or accidental trigger)
  if (detectedPatterns.length > 0) {
    logger.warn({
      type: 'security.prompt_injection_attempt',
      context,
      patternsDetected: detectedPatterns,
      inputLength: input.length,
      inputPreview: input.substring(0, 150),
      msg: 'Potential prompt injection patterns detected in user input',
    })
  }

  // Sanitization strategy:
  // 1. Keep the content readable (don't aggressively strip)
  // 2. Add clear delimiters to separate user content from instructions
  // 3. Escape characters that could break out of prompt structure

  // Replace newlines with explicit markers to prevent multi-line injection
  let sanitized = input.replace(/\n{3,}/g, '\n\n') // Collapse excessive newlines

  // Escape characters that could be used to break prompt structure
  // We preserve most content but escape quote marks that could close strings
  sanitized = sanitized
    .replace(/```/g, "'''") // Escape code blocks
    .replace(/"""/g, "'\"'") // Escape triple quotes

  // For detected injection patterns, prepend warning marker
  // This makes the AI treat them as data, not instructions
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, match => `[USER_TEXT: ${match}]`)
  }

  return sanitized.trim()
}

/**
 * VBL4: Wrap user content with clear delimiters for AI prompts
 *
 * This creates a clear boundary between system instructions and user content,
 * making it harder for injection attacks to escape the content section.
 *
 * @param content - User-provided content
 * @param label - Label for the content (e.g., 'Newsletter Title', 'Newsletter Content')
 * @returns Delimited content safe for AI prompts
 */
export function delimiterWrapUserContent(
  content: string,
  label: string
): string {
  // Use clear XML-style delimiters that are easy for AI to parse
  // and hard for users to escape from
  return `<${label.toLowerCase().replace(/\s+/g, '_')}>
${content}
</${label.toLowerCase().replace(/\s+/g, '_')}>`
}
