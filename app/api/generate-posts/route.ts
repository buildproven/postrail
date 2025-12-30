import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { checkFeatureAccess, checkUsageLimits } from '@/lib/feature-gate'
import { checkTrialAccess, recordTrialGeneration } from '@/lib/trial-guard'
import { logger, logError } from '@/lib/logger'

// Validate API key at module load - fail fast with clear error
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error(
    { type: 'config.missing', key: 'ANTHROPIC_API_KEY' },
    'FATAL: ANTHROPIC_API_KEY environment variable is not set'
  )
}

// Configurable model name via environment variable
const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'missing-key',
})

const PLATFORMS = ['linkedin', 'threads', 'facebook', 'x'] as const
const POST_TYPES = ['pre_cta', 'post_cta'] as const

// Character limits per platform
const CHAR_LIMITS = {
  linkedin: 3000,
  threads: 500,
  facebook: 63206,
  x: 280,
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
      : platform === 'x'
        ? `
- Concise, punchy, attention-grabbing
- Conversational and direct
- Emojis: Strategic use (1-3)
- Hashtags: 2-3 relevant hashtags maximum
- Thread-style for longer content (use line breaks)
- Hook in first line (people decide in 2 seconds)
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
- For post-CTA: Use platform-appropriate trigger words (LinkedIn: "SEND", Threads: "YES", Facebook: "INTERESTED", X: "DM")
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
    logger.error({
      type: 'ai.generation.error',
      platform,
      postType,
      error: String(error),
    })
    throw error
  }
}

export async function POST(request: NextRequest) {
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

    const workerToken = request.headers.get('x-worker-token')
    const serviceUserId = request.headers.get('x-service-user-id')
    const isWorkerRequest = Boolean(workerToken || serviceUserId)

    let supabase:
      | Awaited<ReturnType<typeof createClient>>
      | ReturnType<typeof createServiceClient>
    let userId: string

    if (isWorkerRequest) {
      if (
        !process.env.INTERNAL_WORKER_TOKEN ||
        workerToken !== process.env.INTERNAL_WORKER_TOKEN ||
        !serviceUserId
      ) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      supabase = createServiceClient()
      userId = serviceUserId
    } else {
      supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const { title, content, newsletterDate } = await request.json()

    if (!content) {
      return NextResponse.json(
        { error: 'Newsletter content is required' },
        { status: 400 }
      )
    }

    const featureCheck = await checkFeatureAccess(userId, 'basic_generation')
    if (!featureCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Feature not available',
          message: featureCheck.message,
          requiredTier: featureCheck.requiredTier,
          currentTier: featureCheck.tier,
        },
        { status: 403 }
      )
    }

    const usage = await checkUsageLimits(userId)
    if (!usage.allowed) {
      let message = 'Daily usage limit reached. Please try again later.'
      if (usage.tier === 'trial') {
        const trialCheck = await checkTrialAccess(userId)
        message = trialCheck.error || message
      }

      return NextResponse.json(
        {
          error: message,
          limit: usage.limit,
          remaining: usage.remaining,
          tier: usage.tier,
        },
        { status: 429 }
      )
    }

    const rateLimitResult = await redisRateLimiter.checkRateLimit(userId)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
          requestsRemaining: rateLimitResult.requestsRemaining,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter || 60),
            'X-RateLimit-Remaining': String(rateLimitResult.requestsRemaining),
            'X-RateLimit-Reset': String(rateLimitResult.resetTime),
          },
        }
      )
    }

    // Calculate scheduled times based on newsletter date
    const pubDate = newsletterDate ? new Date(newsletterDate) : new Date()
    if (Number.isNaN(pubDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid newsletterDate format' },
        { status: 400 }
      )
    }
    const preCtaTime = new Date(pubDate.getTime() - 24 * 60 * 60 * 1000) // 24h before
    const postCtaTime = new Date(pubDate.getTime() + 48 * 60 * 60 * 1000) // 48h after

    // Create newsletter record
    const { data: newsletter, error: newsletterError } = await supabase
      .from('newsletters')
      .insert({
        user_id: userId,
        title: title || 'Untitled Newsletter',
        content,
        status: 'draft',
      })
      .select()
      .single()

    if (newsletterError) {
      logger.error({
        type: 'newsletter.create.error',
        userId,
        error: newsletterError.message,
      })
      return NextResponse.json(
        { error: 'Failed to create newsletter' },
        { status: 500 }
      )
    }

    if (!newsletter) {
      logger.error({ type: 'newsletter.create.empty', userId })
      return NextResponse.json(
        { error: 'Failed to create newsletter' },
        { status: 500 }
      )
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
          logger.warn({
            type: 'ai.generation.partial_fail',
            platform,
            postType,
            error: String(error),
          })
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

    // Save generated posts to database
    // scheduled_time is calculated relative to newsletter publication time
    const socialPostsData = posts.map(post => ({
      newsletter_id: newsletter.id,
      platform: post.platform,
      post_type: post.postType,
      content: post.content,
      character_count: post.characterCount,
      scheduled_time:
        post.postType === 'pre_cta'
          ? preCtaTime.toISOString()
          : postCtaTime.toISOString(),
      status: 'draft',
    }))

    const { error: postsError } = await supabase
      .from('social_posts')
      .insert(socialPostsData)

    if (postsError) {
      logger.error({
        type: 'posts.create.error',
        newsletterId: newsletter.id,
        error: postsError.message,
      })
      // Rollback: delete the newsletter since posts failed to save
      await supabase.from('newsletters').delete().eq('id', newsletter.id)
      return NextResponse.json(
        { error: 'Failed to save generated posts' },
        { status: 500 }
      )
    }

    try {
      if (usage.tier === 'trial') {
        await recordTrialGeneration(userId, {
          newsletterId: newsletter.id,
          postsCount: posts.length,
        })
      } else {
        await supabase.from('generation_events').insert({
          user_id: userId,
          event_type: 'generation',
          newsletter_id: newsletter.id,
          posts_count: posts.length,
          tokens_used: 0,
        })
      }
    } catch (recordError) {
      logger.warn({
        type: 'generation_event.record.error',
        error: String(recordError),
      })
    }

    logger.info({
      type: 'posts.generated',
      newsletterId: newsletter.id,
      count: posts.length,
    })
    return NextResponse.json({
      newsletterId: newsletter.id,
      postsGenerated: posts.length,
      posts,
    })
  } catch (error) {
    logError(error instanceof Error ? error : new Error(String(error)), {
      context: 'generate_posts',
    })

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
}
