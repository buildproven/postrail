import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { observability, withObservability } from '@/lib/observability'

// Validate API key at module load - fail fast with clear error
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('FATAL: ANTHROPIC_API_KEY environment variable is not set')
  console.error('Set it in .env.local: ANTHROPIC_API_KEY=your-key-here')
}

// Configurable model name via environment variable
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'missing-key',
})

const PLATFORMS = ['linkedin', 'threads', 'facebook', 'twitter'] as const
const POST_TYPES = ['pre_cta', 'post_cta'] as const

// Character limits per platform
const CHAR_LIMITS = {
  linkedin: 3000,
  threads: 500,
  facebook: 63206,
  twitter: 280,
}

interface GeneratedPost {
  platform: (typeof PLATFORMS)[number]
  postType: (typeof POST_TYPES)[number]
  content: string
  characterCount: number
}

async function generatePost(
  newsletterTitle: string,
  newsletterContent: string,
  platform: string,
  postType: string
): Promise<string> {
  const charLimit = CHAR_LIMITS[platform as keyof typeof CHAR_LIMITS]

  const systemPrompt = `You are a newsletter growth expert specializing in creating high-converting social media posts.

Your task is to create ${postType === 'pre_cta' ? 'pre-newsletter teaser' : 'post-newsletter engagement'} posts for ${platform}.

${
  postType === 'pre_cta'
    ? `
PRE-CTA GUIDELINES (Post 24-8 hours BEFORE newsletter):
- Create FOMO, urgency, and curiosity
- Tease 3-5 key insights WITHOUT revealing everything
- Hook readers with a compelling question or statement
- Clear CTA: "Sign up so you don't miss it: [LINK]"
- Build anticipation for tomorrow's newsletter
`
    : `
POST-CTA GUIDELINES (Post 48-72 hours AFTER newsletter):
- Reframe newsletter as valuable resource (guide/playbook/cheatsheet/blueprint)
- List 3-4 specific outcomes/benefits readers will gain
- Create engagement: "Comment [WORD] to get access"
- Mention it's email-gated to create perceived value
- Encourage interaction and sharing
`
}

PLATFORM-SPECIFIC TONE (${platform}):
${
  platform === 'linkedin'
    ? `
- Professional, business-value focused
- Use industry jargon appropriately
- Lead with ROI or business outcomes
- Emojis: Use sparingly (1-2 max: 📊, 💡, ✅)
- Hashtags: 3-5 relevant industry tags at end
`
    : platform === 'threads'
      ? `
- Conversational, first-person voice
- Casual but valuable
- Emojis: Liberal use (2-3 per post)
- Question-based hooks
- Community-oriented language
`
      : platform === 'twitter'
        ? `
- Punchy, concise, attention-grabbing
- Start with a hook (question, bold statement, or teaser)
- Use line breaks for readability
- Emojis: 1-2 max, strategically placed
- Hashtags: 1-2 max, highly relevant only
- Make EVERY word count (280 char limit!)
`
        : `
- Story-driven, community-focused
- Longer context allowed but keep concise
- Personal anecdotes welcome
- Shareability is key
- Emojis: Moderate (1-2)
`
}

CHARACTER LIMIT: ${charLimit} (stay well under, aim for ${Math.floor(charLimit * 0.7)} for optimal readability)

STRICT REQUIREMENTS:
- Do NOT include [LINK] placeholder - just write where link should go
- Return ONLY the post text, no explanations
- Stay under character limit
- Match platform tone exactly
- Include appropriate emojis for platform
- For post-CTA: Use platform-appropriate trigger words (LinkedIn: "SEND", Threads: "YES", Facebook: "INTERESTED", Twitter: "DM")
`

  const userPrompt = `Newsletter Title: ${newsletterTitle}

Newsletter Content Summary:
${newsletterContent.slice(0, 2000)}

Generate a ${postType} post for ${platform}.`

  try {
    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    })

    const content = message.content[0]
    if (content.type === 'text') {
      return content.text.trim()
    }

    throw new Error('Unexpected response format from Claude')
  } catch (error) {
    console.error(`Error generating ${postType} for ${platform}:`, error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  return withObservability.trace('ai_generation', async (requestId: string) => {
    try {
      // Runtime validation: fail fast if API key missing
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          {
            error:
              'Server configuration error: ANTHROPIC_API_KEY not set. Contact administrator.',
          },
          { status: 500 }
        )
      }

      const supabase = await createClient()

      // Check authentication
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { title, content } = await request.json()

      if (!content) {
        return NextResponse.json(
          { error: 'Newsletter content is required' },
          { status: 400 }
        )
      }

      // Generate content hash for rate limiting + deduplication
      const contentHash = redisRateLimiter.generateContentHash(
        title || 'Untitled Newsletter',
        content,
        user.id
      )

      // Rate limiting with integrated deduplication
      const rateLimitResult = await redisRateLimiter.checkRateLimit(
        user.id,
        contentHash
      )

      if (!rateLimitResult.allowed) {
        // Handle cached results (from deduplication)
        if (rateLimitResult.reason === 'cached_result') {
          observability.info('AI generation returned from cache', {
            requestId,
            userId: user.id,
            event: 'ai_generation_success',
            metadata: {
              fromCache: true,
              contentHash,
            },
          })

          return NextResponse.json({
            fromCache: true,
            message: 'Posts already generated for this content',
          })
        }

        // Handle rate limiting
        observability.warn('AI generation rate limited', {
          requestId,
          userId: user.id,
          event: 'ai_generation_rate_limited',
          metadata: {
            reason: rateLimitResult.reason,
            retryAfter: rateLimitResult.retryAfter,
          },
        })

        const userStatus = await redisRateLimiter.getUserStatus(user.id)
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: rateLimitResult.reason,
            retryAfter: rateLimitResult.retryAfter,
            userStatus,
          },
          {
            status: 429,
            headers: {
              'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
              'X-RateLimit-Remaining': userStatus.requestsRemaining.toString(),
              'X-RateLimit-Reset': userStatus.resetTime.toString(),
            },
          }
        )
      }

      // Note: Redis rate limiter handles deduplication internally via TTL keys
      // No need for separate pending request registration

      // Check if newsletter with this content already exists for this user
      const { data: existingNewsletter } = await supabase
        .from('newsletters')
        .select('id')
        .eq('user_id', user.id)
        .eq('title', title || 'Untitled Newsletter')
        .eq('status', 'draft')
        .maybeSingle()

      let newsletter
      if (existingNewsletter) {
        // Check if posts already exist for this newsletter
        const { data: existingPosts, error: postsCheckError } = await supabase
          .from('social_posts')
          .select('*')
          .eq('newsletter_id', existingNewsletter.id)

        if (postsCheckError) {
          console.error('Error checking existing posts:', postsCheckError)
          return NextResponse.json(
            { error: 'Failed to check existing posts' },
            { status: 500 }
          )
        }

        if (existingPosts && existingPosts.length > 0) {
          // Posts already exist, return them instead of generating new ones
          console.log(
            `Posts already exist for newsletter ${existingNewsletter.id}, returning existing posts`
          )
          return NextResponse.json({
            message: 'Posts already generated for this newsletter',
            newsletter: { id: existingNewsletter.id },
            posts: existingPosts,
            isExisting: true,
          })
        }

        // Newsletter exists but no posts, use existing newsletter
        newsletter = existingNewsletter
        console.log(
          `Using existing newsletter ${newsletter.id}, generating posts`
        )
      } else {
        // Create new newsletter record
        const { data: newNewsletter, error: newsletterError } = await supabase
          .from('newsletters')
          .insert({
            user_id: user.id,
            title: title || 'Untitled Newsletter',
            content,
            status: 'draft',
          })
          .select()
          .single()

        if (newsletterError) {
          console.error('Newsletter creation error:', newsletterError)
          return NextResponse.json(
            { error: 'Failed to create newsletter' },
            { status: 500 }
          )
        }
        newsletter = newNewsletter
        console.log(`Created new newsletter ${newsletter.id}`)
      }

      // Generate all posts in parallel with timeout protection
      const postPromises = PLATFORMS.flatMap(platform =>
        POST_TYPES.map(postType =>
          Promise.race([
            generatePost(
              title || 'Untitled Newsletter',
              content,
              platform,
              postType
            ).then(postContent => ({
              platform,
              postType,
              content: postContent,
              characterCount: postContent.length,
            })),
            new Promise<null>((_, reject) =>
              setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
            ),
          ]).catch(error => {
            console.error(
              `Failed to generate ${postType} for ${platform}:`,
              error
            )
            return null // Return null for failed posts
          })
        )
      )

      const results = await Promise.all(postPromises)
      const posts = results.filter((p): p is GeneratedPost => p !== null)

      // Transaction: Save posts and handle rollback on failure
      if (posts.length === 0) {
        // No posts generated - delete the newsletter and fail
        await supabase.from('newsletters').delete().eq('id', newsletter.id)
        return NextResponse.json(
          { error: 'All post generation attempts failed. Please try again.' },
          { status: 500 }
        )
      }

      // Save generated posts to database using upsert to handle unique constraint
      // scheduled_time is null for drafts, will be set during scheduling phase
      const socialPostsData = posts.map(post => ({
        newsletter_id: newsletter.id,
        platform: post.platform,
        post_type: post.postType,
        content: post.content,
        character_count: post.characterCount,
        scheduled_time: null,
        status: 'draft',
      }))

      // Use upsert to handle the unique constraint gracefully
      // If posts already exist for this (newsletter_id, platform, post_type), update them
      const { error: postsError } = await supabase
        .from('social_posts')
        .upsert(socialPostsData, {
          onConflict: 'newsletter_id,platform,post_type',
          ignoreDuplicates: false, // Update existing records instead of ignoring
        })

      if (postsError) {
        console.error('Social posts creation error:', postsError)
        // Only rollback if this is a newly created newsletter (not existing)
        if (!existingNewsletter) {
          console.log(`Rolling back newly created newsletter ${newsletter.id}`)
          await supabase.from('newsletters').delete().eq('id', newsletter.id)
        }
        return NextResponse.json(
          { error: 'Failed to save generated posts' },
          { status: 500 }
        )
      }

      const finalResult = {
        newsletterId: newsletter.id,
        postsGenerated: posts.length,
        posts,
      }

      // Log successful generation
      observability.info('AI generation completed successfully', {
        requestId,
        userId: user.id,
        event: 'ai_generation_success',
        metadata: {
          newsletterId: newsletter.id,
          postsGenerated: posts.length,
          platforms: posts.map(p => p.platform),
          fromCache: false,
        },
      })

      // Store successful result for deduplication
      await redisRateLimiter.storeDedupResult(user.id, contentHash, finalResult)

      return NextResponse.json(finalResult)
    } catch (error) {
      observability.error('AI generation failed', {
        requestId,
        userId: undefined, // user may not be defined if error occurs early
        event: 'ai_generation_failure',
        error: error as Error,
        metadata: {
          errorType:
            error instanceof Anthropic.APIError
              ? 'anthropic_api_error'
              : 'unknown_error',
        },
      })

      // Note: Redis rate limiter doesn't store failed results for deduplication

      if (error instanceof Anthropic.APIError) {
        return NextResponse.json(
          { error: `AI generation failed: ${error.message}` },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { error: 'Failed to generate posts' },
        { status: 500 }
      )
    }
  })
}
