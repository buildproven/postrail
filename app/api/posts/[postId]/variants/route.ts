import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { redisRateLimiter } from '@/lib/redis-rate-limiter'
import { checkFeatureAccess } from '@/lib/feature-gate'
import { z } from 'zod'

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'missing-key',
})

const CHAR_LIMITS: Record<string, number> = {
  linkedin: 3000,
  threads: 500,
  facebook: 63206,
  x: 280,
}

const VARIANT_STYLES = [
  {
    id: 'hook',
    name: 'Strong Hook',
    instruction: 'Start with a provocative question or bold statement',
  },
  {
    id: 'story',
    name: 'Story-Driven',
    instruction: 'Lead with a brief personal anecdote or case study',
  },
  {
    id: 'data',
    name: 'Data-Led',
    instruction: 'Open with a surprising statistic or specific result',
  },
  {
    id: 'contrarian',
    name: 'Contrarian',
    instruction: 'Challenge conventional wisdom or popular beliefs',
  },
] as const

const requestSchema = z.object({
  variantCount: z.number().min(1).max(3).default(2),
  styles: z.array(z.enum(['hook', 'story', 'data', 'contrarian'])).optional(),
})

interface Variant {
  id: string
  style: string
  styleName: string
  content: string
  characterCount: number
}

async function generateVariant(
  originalContent: string,
  platform: string,
  postType: string,
  style: (typeof VARIANT_STYLES)[number]
): Promise<string> {
  const charLimit = CHAR_LIMITS[platform] || 500

  const systemPrompt = `You are a social media copywriting expert specializing in A/B testing and optimization.

Your task is to create an ALTERNATIVE VERSION of an existing social media post for ${platform}.
The variant style is: ${style.name}

VARIANT APPROACH: ${style.instruction}

POST TYPE: ${postType === 'pre_cta' ? 'Pre-newsletter teaser (builds anticipation)' : 'Post-newsletter engagement (drives interaction)'}

PLATFORM TONE (${platform}):
${
  platform === 'linkedin'
    ? '- Professional, business-value focused\n- Lead with outcomes/ROI\n- 3-5 hashtags at end'
    : platform === 'threads'
      ? '- Conversational, casual\n- Question-based hooks\n- Emoji-friendly'
      : platform === 'x'
        ? '- Punchy, direct, hook in first line\n- 2-3 hashtags max\n- Thread-friendly format'
        : '- Story-driven, shareable\n- Community-focused\n- Moderate emojis'
}

CHARACTER LIMIT: ${charLimit} (aim for ${Math.floor(charLimit * 0.7)} for optimal readability)

REQUIREMENTS:
- Create a DISTINCTLY DIFFERENT angle from the original
- Keep the core message but change the approach
- Match the ${style.name} style exactly
- Stay under character limit
- Return ONLY the post text, no explanations`

  const userPrompt = `Original post to create a variant of:
---
${originalContent}
---

Create a ${style.name} variant of this post. Make it distinctly different while conveying the same core value proposition.`

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const content = message.content[0]
  if (content.type === 'text') {
    return content.text.trim()
  }

  throw new Error('Unexpected response format from Claude')
}

/**
 * POST /api/posts/[postId]/variants
 * Generate A/B variants for an existing post
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error: ANTHROPIC_API_KEY not set' },
        { status: 500 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Feature gate: A/B variants may be a paid feature
    const featureCheck = await checkFeatureAccess(user.id, 'ab_variants')
    if (!featureCheck.allowed) {
      return NextResponse.json(
        {
          error: 'A/B variants require Standard or higher plan',
          message: featureCheck.message,
          requiredTier: featureCheck.requiredTier,
        },
        { status: 403 }
      )
    }

    // Rate limiting
    const rateLimitResult = await redisRateLimiter.checkRateLimit(user.id)
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          retryAfter: rateLimitResult.retryAfter,
        },
        { status: 429 }
      )
    }

    // Parse request body
    const body = await request.json()
    const parseResult = requestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.issues },
        { status: 400 }
      )
    }

    const { variantCount, styles } = parseResult.data

    // Fetch the original post
    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select('*, newsletters!inner(user_id)')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Verify ownership
    const newsletter = post.newsletters as unknown as { user_id: string }
    if (newsletter.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Select variant styles to use
    const stylesToGenerate = styles
      ? VARIANT_STYLES.filter(s =>
          styles.includes(s.id as 'hook' | 'story' | 'data' | 'contrarian')
        )
      : VARIANT_STYLES.slice(0, variantCount)

    // Generate variants in parallel
    const variantPromises = stylesToGenerate
      .slice(0, variantCount)
      .map(async style => {
        try {
          const content = await generateVariant(
            post.content,
            post.platform,
            post.post_type,
            style
          )
          return {
            id: `${postId}-${style.id}`,
            style: style.id,
            styleName: style.name,
            content,
            characterCount: content.length,
          } as Variant
        } catch (error) {
          console.error(`Failed to generate ${style.id} variant:`, error)
          return null
        }
      })

    const results = await Promise.all(variantPromises)
    const variants = results.filter((v): v is Variant => v !== null)

    if (variants.length === 0) {
      return NextResponse.json(
        { error: 'Failed to generate any variants' },
        { status: 500 }
      )
    }

    // Store variants in post metadata
    const existingVariants = (post.metadata?.variants as Variant[]) || []
    const updatedVariants = [...existingVariants, ...variants]

    const { error: updateError } = await supabase
      .from('social_posts')
      .update({
        metadata: {
          ...((post.metadata as Record<string, unknown>) || {}),
          variants: updatedVariants,
        },
      })
      .eq('id', postId)

    if (updateError) {
      console.error('Failed to save variants:', updateError)
      // Still return the variants even if save failed
    }

    return NextResponse.json({
      postId,
      original: {
        content: post.content,
        characterCount: post.character_count,
      },
      variants,
      totalVariants: updatedVariants.length,
    })
  } catch (error) {
    console.error('Variant generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate variants' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/posts/[postId]/variants
 * Get existing variants for a post
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: post, error } = await supabase
      .from('social_posts')
      .select('content, character_count, metadata, newsletters!inner(user_id)')
      .eq('id', postId)
      .single()

    if (error || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const newsletter = post.newsletters as unknown as { user_id: string }
    if (newsletter.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const variants = (post.metadata?.variants as Variant[]) || []

    return NextResponse.json({
      postId,
      original: {
        content: post.content,
        characterCount: post.character_count,
      },
      variants,
      availableStyles: VARIANT_STYLES,
    })
  } catch (error) {
    console.error('Get variants error:', error)
    return NextResponse.json(
      { error: 'Failed to get variants' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/posts/[postId]/variants
 * Swap a variant to become the main post content
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await params

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { variantId } = await request.json()
    if (!variantId) {
      return NextResponse.json(
        { error: 'variantId is required' },
        { status: 400 }
      )
    }

    const { data: post, error } = await supabase
      .from('social_posts')
      .select('content, character_count, metadata, newsletters!inner(user_id)')
      .eq('id', postId)
      .single()

    if (error || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    const newsletter = post.newsletters as unknown as { user_id: string }
    if (newsletter.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const variants = (post.metadata?.variants as Variant[]) || []
    const selectedVariant = variants.find(v => v.id === variantId)

    if (!selectedVariant) {
      return NextResponse.json({ error: 'Variant not found' }, { status: 404 })
    }

    // Swap: current content becomes a variant, selected variant becomes main
    const originalAsVariant: Variant = {
      id: `${postId}-original-${Date.now()}`,
      style: 'original',
      styleName: 'Original',
      content: post.content,
      characterCount: post.character_count,
    }

    const updatedVariants = [
      originalAsVariant,
      ...variants.filter(v => v.id !== variantId),
    ]

    const { error: updateError } = await supabase
      .from('social_posts')
      .update({
        content: selectedVariant.content,
        character_count: selectedVariant.characterCount,
        metadata: {
          ...((post.metadata as Record<string, unknown>) || {}),
          variants: updatedVariants,
          lastSwappedAt: new Date().toISOString(),
        },
      })
      .eq('id', postId)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to swap variant' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      newContent: selectedVariant.content,
      variantsCount: updatedVariants.length,
    })
  } catch (error) {
    console.error('Swap variant error:', error)
    return NextResponse.json(
      { error: 'Failed to swap variant' },
      { status: 500 }
    )
  }
}
