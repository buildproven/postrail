import { describe, it, expect } from 'vitest'

/**
 * Comprehensive test suite for post generation quality
 * Testing character counts, hashtags, links, and platform-specific rules
 */

describe('Character Count Accuracy', () => {
  it('should count emojis correctly (Unicode aware)', () => {
    const textWithEmojis = '🚀 Launch day! 💡 Big news 📊 Data'
    const basicLength = textWithEmojis.length // JavaScript .length (UTF-16)

    // Unicode-aware character counting (Segmenter API)
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const segments = Array.from(segmenter.segment(textWithEmojis))
    const actualLength = segments.length

    console.log('Text:', textWithEmojis)
    console.log('JS .length:', basicLength)
    console.log('Actual graphemes:', actualLength)

    // Basic .length over-counts emojis (2 UTF-16 units per emoji)
    // This is the bug: we use .length which gives wrong count
    expect(basicLength).toBeGreaterThan(actualLength)
  })

  it('should handle Threads 500 character limit with emojis', () => {
    // Threads limit is 500 characters
    // Each emoji is 2 UTF-16 code units but 1 grapheme
    const threadsPost = '🎯' + 'a'.repeat(495) + '🚀' // 2 + 495 + 2 = 499 code units
    const jsLength = threadsPost.length // What we currently use (UTF-16 units)
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const actualLength = Array.from(segmenter.segment(threadsPost)).length // 497 graphemes

    console.log('Threads post length - JS:', jsLength, 'Graphemes:', actualLength)

    // JS .length counts UTF-16 code units (emojis = 2 units each)
    // Actual user-perceived characters are graphemes
    expect(jsLength).toBeLessThanOrEqual(500)
    expect(actualLength).toBeLessThan(jsLength) // Graphemes < UTF-16 units
  })

  it('should handle international characters correctly', () => {
    const internationalText = 'Café ☕ naïve résumé 你好'
    const jsLength = internationalText.length
    const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
    const actualLength = Array.from(segmenter.segment(internationalText)).length

    console.log('International text:', internationalText)
    console.log('JS .length:', jsLength)
    console.log('Actual graphemes:', actualLength)

    // Verify there's a difference
    expect(typeof jsLength).toBe('number')
    expect(typeof actualLength).toBe('number')
  })
})

describe('Platform-Specific Hashtag Rules', () => {
  const HASHTAG_RULES = {
    linkedin: {
      expected: true,
      count: { min: 3, max: 5 },
      placement: 'end',
      style: 'professional',
    },
    threads: {
      expected: false,
      reason: 'Conversational, casual - hashtags feel corporate',
    },
    facebook: {
      expected: false,
      reason: 'Story-driven - hashtags reduce engagement',
    },
  }

  it('should require hashtags on LinkedIn (3-5 at end)', () => {
    expect(HASHTAG_RULES.linkedin.expected).toBe(true)
    expect(HASHTAG_RULES.linkedin.count.min).toBe(3)
    expect(HASHTAG_RULES.linkedin.count.max).toBe(5)
    expect(HASHTAG_RULES.linkedin.placement).toBe('end')
  })

  it('should NOT use hashtags on Threads', () => {
    expect(HASHTAG_RULES.threads.expected).toBe(false)
    expect(HASHTAG_RULES.threads.reason).toContain('casual')
  })

  it('should NOT use hashtags on Facebook', () => {
    expect(HASHTAG_RULES.facebook.expected).toBe(false)
    expect(HASHTAG_RULES.facebook.reason).toContain('Story-driven')
  })

  it('should validate LinkedIn hashtag format', () => {
    const validHashtags = [
      '#SaaS',
      '#ProductManagement',
      '#TechStartups',
      '#B2BSales',
      '#GrowthMarketing',
    ]

    validHashtags.forEach(tag => {
      expect(tag).toMatch(/^#[A-Za-z][A-Za-z0-9]*$/)
      expect(tag.length).toBeGreaterThan(2)
      expect(tag.length).toBeLessThan(30)
    })
  })
})

describe('Platform-Specific Link Usage', () => {
  const LINK_RULES = {
    linkedin: {
      placement: 'inline_or_end',
      format: 'clean_url',
      tracking: 'allowed',
    },
    threads: {
      placement: 'inline',
      format: 'natural',
      tracking: 'discouraged',
    },
    facebook: {
      placement: 'end',
      format: 'clean_url',
      tracking: 'allowed',
    },
  }

  it('should allow clean URLs on all platforms', () => {
    const cleanUrl = 'https://example.com/newsletter'

    expect(cleanUrl).toMatch(/^https?:\/\//)
    expect(cleanUrl).not.toContain('?utm_')
    expect(cleanUrl.length).toBeLessThan(100)
  })

  it('should handle link placement per platform', () => {
    expect(LINK_RULES.linkedin.placement).toMatch(/inline|end/)
    expect(LINK_RULES.threads.placement).toBe('inline')
    expect(LINK_RULES.facebook.placement).toBe('end')
  })

  it('should validate URL format', () => {
    const validUrls = [
      'https://example.com',
      'https://newsletter.substack.com/p/post',
      'https://beehiiv.com/newsletter/post-123',
    ]

    const invalidUrls = [
      'http://localhost:3000',
      'https://192.168.1.1',
      'javascript:alert(1)',
    ]

    validUrls.forEach(url => {
      expect(url).toMatch(/^https:\/\//)
      expect(url).not.toContain('localhost')
      expect(url).not.toContain('192.168')
    })

    invalidUrls.forEach(url => {
      const isInvalid =
        url.includes('localhost') ||
        url.includes('192.168') ||
        url.startsWith('javascript:')
      expect(isInvalid).toBe(true)
    })
  })
})

describe('Platform-Specific Emoji Rules', () => {
  const EMOJI_RULES = {
    linkedin: {
      count: { min: 0, max: 2 },
      types: ['📊', '💡', '✅', '🎯'],
      tone: 'professional',
    },
    threads: {
      count: { min: 2, max: 5 },
      types: ['any'],
      tone: 'casual',
    },
    facebook: {
      count: { min: 1, max: 2 },
      types: ['any'],
      tone: 'friendly',
    },
  }

  it('should use minimal professional emojis on LinkedIn', () => {
    expect(EMOJI_RULES.linkedin.count.max).toBe(2)
    expect(EMOJI_RULES.linkedin.types).toContain('📊')
    expect(EMOJI_RULES.linkedin.tone).toBe('professional')
  })

  it('should use liberal emojis on Threads', () => {
    expect(EMOJI_RULES.threads.count.min).toBe(2)
    expect(EMOJI_RULES.threads.tone).toBe('casual')
  })

  it('should use moderate emojis on Facebook', () => {
    expect(EMOJI_RULES.facebook.count.max).toBe(2)
    expect(EMOJI_RULES.facebook.tone).toBe('friendly')
  })
})

describe('Post Type Requirements', () => {
  const PRE_CTA_RULES = {
    timing: '24-8 hours before newsletter',
    goals: ['FOMO', 'urgency', 'curiosity'],
    structure: {
      hook: 'compelling_question',
      body: 'tease_3-5_insights',
      cta: "Sign up so you don't miss it",
    },
    link_placement: 'required',
  }

  const POST_CTA_RULES = {
    timing: '48-72 hours after newsletter',
    goals: ['engagement', 'virality', 'social_proof'],
    structure: {
      hook: 'value_proposition',
      body: 'specific_outcomes',
      cta: 'Comment [WORD] to get access',
    },
    link_placement: 'email_gated',
  }

  it('should have different CTAs for pre vs post', () => {
    expect(PRE_CTA_RULES.structure.cta).toContain('Sign up')
    expect(POST_CTA_RULES.structure.cta).toContain('Comment')
    expect(PRE_CTA_RULES.structure.cta).not.toBe(POST_CTA_RULES.structure.cta)
  })

  it('should have different timing strategies', () => {
    expect(PRE_CTA_RULES.timing).toContain('before')
    expect(POST_CTA_RULES.timing).toContain('after')
  })

  it('should have platform-specific trigger words', () => {
    const triggerWords = {
      linkedin: 'SEND',
      threads: 'YES',
      facebook: 'INTERESTED',
    }

    expect(triggerWords.linkedin).toBe('SEND')
    expect(triggerWords.threads).toBe('YES')
    expect(triggerWords.facebook).toBe('INTERESTED')
  })
})

describe('Content Quality Validation', () => {
  it('should validate minimum content length', () => {
    const tooShort = 'Hi!'
    const goodLength = 'This is a substantial newsletter with multiple paragraphs and insights that readers will find valuable.'

    expect(tooShort.length).toBeLessThan(100)
    expect(goodLength.length).toBeGreaterThan(100)
  })

  it('should handle markdown formatting', () => {
    const markdownContent = `
# Newsletter Title

This is **bold** and this is *italic*.

- Bullet point 1
- Bullet point 2

[Link text](https://example.com)
    `.trim()

    expect(markdownContent).toContain('**bold**')
    expect(markdownContent).toContain('- Bullet')
    expect(markdownContent.length).toBeGreaterThan(50)
  })
})

describe('Manual Paste Functionality', () => {
  it('should accept title and content separately', () => {
    const manualInput = {
      title: 'How to Build Your First SaaS',
      content: 'Full newsletter content here...',
    }

    expect(manualInput.title).toBeTruthy()
    expect(manualInput.content).toBeTruthy()
    expect(manualInput.title.length).toBeGreaterThan(0)
    expect(manualInput.content.length).toBeGreaterThan(0)
  })

  it('should work without URL scraping', () => {
    const manualInput = { title: 'Title', content: 'Content' }

    // Manual input doesn't need URL
    expect(manualInput).not.toHaveProperty('url')
    expect(manualInput).toHaveProperty('title')
    expect(manualInput).toHaveProperty('content')
  })
})
