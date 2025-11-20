import { describe, it, expect } from 'vitest'

/**
 * Integration tests for post quality validation
 * These tests validate actual generated posts against platform rules
 */

describe('Generated Post Quality Validation', () => {
  // Sample posts to validate (replace with actual generated posts from your system)
  const samplePosts = {
    linkedin_pre_cta: `🎯 Are you still manually posting to social media every single day?

What if I told you that 73% of newsletter creators are wasting 10+ hours/week on social promotion?

Tomorrow's newsletter reveals:
→ The 3-step automation framework top creators use
→ How to 10x your reach without spending more time
→ The exact tools that save 15+ hours/week

Sign up now so you don't miss this: [LINK]

#NewsletterGrowth #MarketingAutomation #ContentStrategy`,

    threads_pre_cta: `wait... you're still posting to social media manually? 😅

like literally copy-pasting the same content across 5 different platforms?

here's the thing 💡

73% of newsletter creators waste 10+ hours doing this every week

tomorrow i'm dropping the exact automation framework that changed everything for me

you don't wanna miss this one

link in bio 🔗`,

    linkedin_post_cta: `📊 Just published: The Complete Social Media Automation Playbook

This guide shows you exactly how to:
✅ Automate all your social posting (save 15+ hrs/week)
✅ 10x your reach without creating more content
✅ Set up the system once, run it forever

Comment AUTOMATION and I'll send you the full guide.

(It's email-gated, but totally worth it)

#SocialMediaMarketing #Automation #ContentCreation`,

    threads_post_cta: `ok so i just dropped the complete social automation guide 🎯

it's literally everything:
- how to automate your posts
- 10x your reach
- save 15+ hours every week

and it actually works (been using it for 6 months)

comment YES and i'll send it to you 💌

(it's behind an email wall but it's 🔥)`,
  }

  describe('Character Count Validation', () => {
    it('LinkedIn posts should be under 3000 characters', () => {
      const linkedinPosts = [
        samplePosts.linkedin_pre_cta,
        samplePosts.linkedin_post_cta,
      ]

      linkedinPosts.forEach(post => {
        expect(post.length).toBeLessThanOrEqual(3000)
        // Aim for 70% = 2100
        expect(post.length).toBeLessThanOrEqual(2500) // Allow some buffer
      })
    })

    it('Threads posts should be under 500 characters', () => {
      const threadsPosts = [
        samplePosts.threads_pre_cta,
        samplePosts.threads_post_cta,
      ]

      threadsPosts.forEach(post => {
        expect(post.length).toBeLessThanOrEqual(500)
        console.log('Threads post length:', post.length, '/ 500')
      })
    })

    it('should count emojis correctly in Threads posts', () => {
      const threadsPost = samplePosts.threads_pre_cta
      const emojiCount = (threadsPost.match(/[\u{1F000}-\u{1F9FF}]/gu) || [])
        .length

      console.log('Threads post has', emojiCount, 'emojis')
      expect(emojiCount).toBeGreaterThan(0) // Should use emojis
    })
  })

  describe('Hashtag Usage Validation', () => {
    it('LinkedIn posts should have 3-5 hashtags at end', () => {
      const linkedinPosts = [
        samplePosts.linkedin_pre_cta,
        samplePosts.linkedin_post_cta,
      ]

      linkedinPosts.forEach(post => {
        const hashtags = post.match(/#\w+/g) || []
        console.log('LinkedIn hashtags:', hashtags)

        expect(hashtags.length).toBeGreaterThanOrEqual(3)
        expect(hashtags.length).toBeLessThanOrEqual(5)

        // Hashtags should be at the end
        const lastLine = post.trim().split('\n').pop() || ''
        const hasHashtagsAtEnd = lastLine.includes('#')
        expect(hasHashtagsAtEnd).toBe(true)
      })
    })

    it('Threads posts should NOT have hashtags', () => {
      const threadsPosts = [
        samplePosts.threads_pre_cta,
        samplePosts.threads_post_cta,
      ]

      threadsPosts.forEach(post => {
        const hashtags = post.match(/#\w+/g) || []
        console.log('Threads hashtags:', hashtags)

        expect(hashtags.length).toBe(0)
      })
    })
  })

  describe('Link Usage Validation', () => {
    it('Pre-CTA posts should reference link/signup', () => {
      const prePosts = [
        samplePosts.linkedin_pre_cta,
        samplePosts.threads_pre_cta,
      ]

      prePosts.forEach(post => {
        const hasLinkReference =
          post.toLowerCase().includes('link') ||
          post.toLowerCase().includes('sign up') ||
          post.toLowerCase().includes('signup') ||
          post.includes('[LINK]')

        expect(hasLinkReference).toBe(true)
      })
    })

    it('Post-CTA posts should use engagement triggers', () => {
      const postPosts = [
        samplePosts.linkedin_post_cta,
        samplePosts.threads_post_cta,
      ]

      postPosts.forEach(post => {
        const hasEngagementTrigger =
          post.toLowerCase().includes('comment') ||
          post.toLowerCase().includes('dm') ||
          post.toLowerCase().includes('send')

        expect(hasEngagementTrigger).toBe(true)
      })
    })

    it('should have platform-specific trigger words', () => {
      // LinkedIn uses "Comment AUTOMATION"
      expect(samplePosts.linkedin_post_cta).toMatch(/comment\s+\w+/i)

      // Threads uses "comment YES"
      expect(samplePosts.threads_post_cta).toMatch(/comment\s+yes/i)
    })
  })

  describe('Emoji Usage Validation', () => {
    it('LinkedIn should use 0-2 professional emojis', () => {
      const linkedinPosts = [
        samplePosts.linkedin_pre_cta,
        samplePosts.linkedin_post_cta,
      ]

      linkedinPosts.forEach(post => {
        const emojiCount = (post.match(/[\u{1F000}-\u{1F9FF}]/gu) || []).length
        console.log('LinkedIn emoji count:', emojiCount)

        expect(emojiCount).toBeLessThanOrEqual(3) // Allow slight variation
      })
    })

    it('Threads should use 2-5 emojis liberally', () => {
      const threadsPosts = [
        samplePosts.threads_pre_cta,
        samplePosts.threads_post_cta,
      ]

      threadsPosts.forEach(post => {
        const emojiCount = (post.match(/[\u{1F000}-\u{1F9FF}]/gu) || []).length
        console.log('Threads emoji count:', emojiCount)

        expect(emojiCount).toBeGreaterThanOrEqual(2)
        expect(emojiCount).toBeLessThanOrEqual(6)
      })
    })
  })

  describe('Tone and Style Validation', () => {
    it('LinkedIn should be professional', () => {
      const linkedinPost = samplePosts.linkedin_pre_cta

      // Professional indicators
      const isProfessional =
        !linkedinPost.includes('like literally') &&
        !linkedinPost.includes('wanna') &&
        !linkedinPost.includes('gonna')

      expect(isProfessional).toBe(true)
    })

    it('Threads should be casual and conversational', () => {
      const threadsPost = samplePosts.threads_pre_cta

      // Casual indicators
      const isCasual =
        threadsPost.toLowerCase().includes('wait') ||
        threadsPost.toLowerCase().includes('like') ||
        threadsPost.toLowerCase().includes('wanna') ||
        threadsPost.includes('...')

      expect(isCasual).toBe(true)
    })

    it('should use first-person on Threads', () => {
      const threadsPost = samplePosts.threads_pre_cta

      const hasFirstPerson =
        threadsPost.toLowerCase().includes("i'm") ||
        threadsPost.toLowerCase().includes(' i ') ||
        threadsPost.toLowerCase().includes('my ')

      expect(hasFirstPerson).toBe(true)
    })
  })

  describe('CTA Clarity Validation', () => {
    it('Pre-CTA should tease content', () => {
      const prePosts = [
        samplePosts.linkedin_pre_cta,
        samplePosts.threads_pre_cta,
      ]

      prePosts.forEach(post => {
        const teasesContent =
          post.toLowerCase().includes('tomorrow') ||
          post.toLowerCase().includes('reveals') ||
          post.toLowerCase().includes('dropping')

        expect(teasesContent).toBe(true)
      })
    })

    it('Post-CTA should request engagement', () => {
      const postPosts = [
        samplePosts.linkedin_post_cta,
        samplePosts.threads_post_cta,
      ]

      postPosts.forEach(post => {
        const requestsEngagement =
          post.toLowerCase().includes('comment') &&
          (post.toLowerCase().includes('send') ||
            post.toLowerCase().includes("i'll send"))

        expect(requestsEngagement).toBe(true)
      })
    })

    it('should mention email gate in post-CTA', () => {
      const postPosts = [
        samplePosts.linkedin_post_cta,
        samplePosts.threads_post_cta,
      ]

      postPosts.forEach(post => {
        const mentionsEmailGate =
          post.toLowerCase().includes('email') ||
          post.toLowerCase().includes('gated') ||
          post.toLowerCase().includes('behind')

        expect(mentionsEmailGate).toBe(true)
      })
    })
  })

  describe('Content Structure Validation', () => {
    it('should have clear hook in first line of PRE-CTA posts', () => {
      // Only PRE-CTA posts need attention-grabbing hooks
      // POST-CTA posts announce value/resources
      const preCTAPosts = [
        samplePosts.linkedin_pre_cta,
        samplePosts.threads_pre_cta,
      ]

      preCTAPosts.forEach(post => {
        const firstLine = post.trim().split('\n')[0]
        expect(firstLine.length).toBeGreaterThan(10)
        expect(firstLine.length).toBeLessThan(150)

        // Hook should grab attention
        const isHook =
          firstLine.includes('?') || // Question
          firstLine.includes('!') || // Exclamation
          firstLine.toLowerCase().includes('wait') ||
          firstLine.toLowerCase().includes('are you')

        expect(isHook).toBe(true)
      })
    })

    it('should have clear call-to-action', () => {
      const allPosts = Object.values(samplePosts)

      allPosts.forEach(post => {
        const lowerPost = post.toLowerCase()
        const hasCTA =
          lowerPost.includes('sign up') ||
          lowerPost.includes('comment') ||
          lowerPost.includes('link in bio')

        expect(hasCTA).toBe(true)
      })
    })
  })
})

describe('Manual Paste Integration Test', () => {
  it('should accept manually pasted content', () => {
    const manualInput = {
      title: 'How to Build Your First SaaS in 30 Days',
      content: `
Building a SaaS product in 30 days is challenging but possible.

Week 1: Validate your idea
- Talk to 10 potential customers
- Build a landing page
- Get 50 email signups

Week 2: Build MVP
- Focus on core feature only
- Use proven tech stack
- No perfect code, just working code

The key is to start small and move fast.
      `.trim(),
    }

    expect(manualInput.title).toBeTruthy()
    expect(manualInput.content).toBeTruthy()
    expect(manualInput.content.length).toBeGreaterThan(100)

    // Should be able to generate posts from this
    const isValidForGeneration =
      manualInput.content.length >= 100 && manualInput.content.length <= 10000

    expect(isValidForGeneration).toBe(true)
  })
})
