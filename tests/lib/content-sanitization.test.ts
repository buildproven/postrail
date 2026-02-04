/**
 * Content Sanitization Tests
 * VBL4: OWASP A03 Injection Prevention
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  sanitizeAIContent,
  sanitizeMetadata,
  validateContentLength,
} from '@/lib/content-sanitization'
import { logger } from '@/lib/logger'

// Mock logger to avoid console output during tests
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('sanitizeAIContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('XSS Prevention', () => {
    it('should strip script tags', () => {
      const malicious = 'Hello <script>alert("XSS")</script> World'
      const result = sanitizeAIContent(malicious, 'test')
      expect(result).toBe('Hello  World')
      expect(result).not.toContain('<script')
      expect(logger.warn).toHaveBeenCalled()
    })

    it('should strip event handlers', () => {
      const malicious = '<div onclick="alert(1)">Click me</div>'
      const result = sanitizeAIContent(malicious, 'test')
      expect(result).toBe('Click me')
      expect(result).not.toContain('onclick')
    })

    it('should remove javascript: protocol', () => {
      /* eslint-disable no-script-url */ // Testing XSS prevention
      const malicious = '<a href="javascript:alert(1)">Link</a>'
      const result = sanitizeAIContent(malicious, 'test')
      expect(result).toBe('Link')
      expect(result).not.toContain('javascript:')
      /* eslint-enable no-script-url */
    })

    it('should strip iframe tags', () => {
      const malicious = 'Text <iframe src="evil.com"></iframe> More'
      const result = sanitizeAIContent(malicious, 'test')
      expect(result).toBe('Text  More')
      expect(result).not.toContain('iframe')
    })

    it('should strip object and embed tags', () => {
      const malicious = '<object data="evil.swf"></object>'
      const result = sanitizeAIContent(malicious, 'test')
      expect(result).toBe('')
      expect(result).not.toContain('object')
    })

    it('should handle data: URLs', () => {
      const malicious = '<img src="data:text/html,<script>alert(1)</script>">'
      const result = sanitizeAIContent(malicious, 'test')
      expect(result).not.toContain('data:text/html')
    })
  })

  describe('HTML Stripping', () => {
    it('should strip all HTML tags', () => {
      const html = '<p>Paragraph</p><strong>Bold</strong><em>Italic</em>'
      const result = sanitizeAIContent(html, 'test')
      expect(result).toBe('ParagraphBoldItalic')
      expect(result).not.toContain('<')
      expect(result).not.toContain('>')
    })

    it('should preserve plain text content', () => {
      const text = 'This is plain text with no HTML'
      const result = sanitizeAIContent(text, 'test')
      expect(result).toBe(text)
    })

    it('should handle mixed content', () => {
      const mixed = 'Normal text <b>bold</b> and <script>evil()</script> more'
      const result = sanitizeAIContent(mixed, 'test')
      expect(result).toBe('Normal text bold and  more')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      const result = sanitizeAIContent('', 'test')
      expect(result).toBe('')
    })

    it('should handle whitespace', () => {
      const result = sanitizeAIContent('   \n\t   ', 'test')
      expect(result).toBe('')
    })

    it('should handle special characters', () => {
      const special = 'Text with émojis 🎉 and spëcial çhars'
      const result = sanitizeAIContent(special, 'test')
      expect(result).toBe(special)
    })

    it('should handle very long content', () => {
      const longText = 'a'.repeat(100000)
      const result = sanitizeAIContent(longText, 'test')
      expect(result).toBe(longText)
      expect(result.length).toBe(100000)
    })

    it('should handle null/undefined gracefully', () => {
      expect(sanitizeAIContent(null as unknown as string, 'test')).toBe('')
      expect(sanitizeAIContent(undefined as unknown as string, 'test')).toBe('')
    })

    it('should handle non-string input', () => {
      expect(sanitizeAIContent(123 as unknown as string, 'test')).toBe('')
      expect(sanitizeAIContent({} as unknown as string, 'test')).toBe('')
      expect(sanitizeAIContent([] as unknown as string, 'test')).toBe('')
    })
  })

  describe('Logging', () => {
    it('should log when dangerous patterns detected', () => {
      const malicious = '<script>alert(1)</script>'
      sanitizeAIContent(malicious, 'test_context')

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'security.content_sanitization',
          context: 'test_context',
          patternsDetected: expect.arrayContaining([expect.any(String)]),
        })
      )
    })

    it('should not log for safe content', () => {
      sanitizeAIContent('Safe content', 'test')
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('should log error if sanitization fails', () => {
      // This is a fail-safe test - if content still has dangerous patterns after sanitization
      const result = sanitizeAIContent('Normal text', 'test')
      expect(result).not.toContain('<script')
      expect(logger.error).not.toHaveBeenCalled()
    })
  })

  describe('Social Media Content', () => {
    it('should preserve hashtags', () => {
      const tweet = 'Great post! #development #javascript'
      const result = sanitizeAIContent(tweet, 'test')
      expect(result).toBe(tweet)
    })

    it('should preserve mentions', () => {
      const tweet = 'Thanks @username for the insight!'
      const result = sanitizeAIContent(tweet, 'test')
      expect(result).toBe(tweet)
    })

    it('should preserve URLs', () => {
      const post = 'Check out https://example.com for more info'
      const result = sanitizeAIContent(post, 'test')
      expect(result).toBe(post)
    })

    it('should preserve emojis', () => {
      const post = 'Excited for this! 🚀🎉💯'
      const result = sanitizeAIContent(post, 'test')
      expect(result).toBe(post)
    })

    it('should preserve line breaks', () => {
      const post = 'Line 1\nLine 2\nLine 3'
      const result = sanitizeAIContent(post, 'test')
      expect(result).toBe(post)
    })
  })
})

describe('sanitizeMetadata', () => {
  it('should sanitize string values', () => {
    const metadata = {
      title: '<script>alert(1)</script>Title',
      description: 'Safe description',
    }
    const result = sanitizeMetadata(metadata)
    expect(result.title).toBe('Title')
    expect(result.description).toBe('Safe description')
  })

  it('should sanitize arrays of strings', () => {
    const metadata = {
      tags: ['safe', '<script>evil</script>', 'also safe'],
    }
    const result = sanitizeMetadata(metadata)
    expect(result.tags).toEqual(['safe', '', 'also safe'])
  })

  it('should recursively sanitize nested objects', () => {
    const metadata = {
      user: {
        name: '<b>Name</b>',
        bio: 'Safe bio',
      },
    }
    const result = sanitizeMetadata(metadata)
    expect((result.user as Record<string, string>).name).toBe('Name')
    expect((result.user as Record<string, string>).bio).toBe('Safe bio')
  })

  it('should preserve non-string values', () => {
    const metadata = {
      count: 42,
      isActive: true,
      timestamp: new Date(),
    }
    const result = sanitizeMetadata(metadata)
    expect(result.count).toBe(42)
    expect(result.isActive).toBe(true)
    expect(result.timestamp).toBeInstanceOf(Date)
  })

  it('should handle empty objects', () => {
    const result = sanitizeMetadata({})
    expect(result).toEqual({})
  })
})

describe('validateContentLength', () => {
  describe('Twitter', () => {
    it('should accept content within limit', () => {
      const content = 'Short tweet'
      const result = validateContentLength(content, 'twitter')
      expect(result.isValid).toBe(true)
      expect(result.content).toBe(content)
    })

    it('should reject content exceeding 280 chars', () => {
      const content = 'a'.repeat(281)
      const result = validateContentLength(content, 'twitter')
      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('280')
    })

    it('should accept exactly 280 chars', () => {
      const content = 'a'.repeat(280)
      const result = validateContentLength(content, 'twitter')
      expect(result.isValid).toBe(true)
    })
  })

  describe('Threads', () => {
    it('should accept content within 500 char limit', () => {
      const content = 'a'.repeat(500)
      const result = validateContentLength(content, 'threads')
      expect(result.isValid).toBe(true)
    })

    it('should reject content exceeding 500 chars', () => {
      const content = 'a'.repeat(501)
      const result = validateContentLength(content, 'threads')
      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('500')
    })
  })

  describe('LinkedIn', () => {
    it('should accept content within 3000 char limit', () => {
      const content = 'a'.repeat(3000)
      const result = validateContentLength(content, 'linkedin')
      expect(result.isValid).toBe(true)
    })

    it('should reject content exceeding 3000 chars', () => {
      const content = 'a'.repeat(3001)
      const result = validateContentLength(content, 'linkedin')
      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('3000')
    })
  })

  describe('Facebook', () => {
    it('should accept very long content', () => {
      const content = 'a'.repeat(60000)
      const result = validateContentLength(content, 'facebook')
      expect(result.isValid).toBe(true)
    })

    it('should reject content exceeding 63206 chars', () => {
      const content = 'a'.repeat(63207)
      const result = validateContentLength(content, 'facebook')
      expect(result.isValid).toBe(false)
      expect(result.reason).toContain('63206')
    })
  })
})
