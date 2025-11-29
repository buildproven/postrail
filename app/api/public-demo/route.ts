import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  checkPublicDemoAccess,
  recordPublicDemoGeneration,
} from '@/lib/trial-guard'
import { observability, withObservability } from '@/lib/observability'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || 'missing-key',
})

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest'

/**
 * Extract client IP from request headers
 */
function getClientIp(request: NextRequest): string {
  // Check various headers for client IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Vercel-specific header
  const vercelIp = request.headers.get('x-vercel-forwarded-for')
  if (vercelIp) {
    return vercelIp.split(',')[0].trim()
  }

  // Fallback - shouldn't happen in production
  return '127.0.0.1'
}

/**
 * Generate a single demo hook/teaser post
 */
async function generateDemoHook(
  topic: string,
  platform: 'linkedin' | 'twitter'
): Promise<string> {
  const charLimit = platform === 'twitter' ? 280 : 500

  const systemPrompt = `You are a newsletter growth expert. Generate a compelling hook/teaser post for ${platform}.

REQUIREMENTS:
- Create curiosity and FOMO
- Tease value without revealing everything
- Keep under ${charLimit} characters
- Match ${platform} tone (${platform === 'linkedin' ? 'professional, sparse emojis' : 'punchy, concise'})
- Return ONLY the post text, no explanations`

  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: `Topic: ${topic}\n\nGenerate a compelling teaser post.`,
      },
    ],
    system: systemPrompt,
  })

  const content = message.content[0]
  if (content.type === 'text') {
    return content.text.trim()
  }

  throw new Error('Unexpected response format')
}

/**
 * POST /api/public-demo - Generate a free demo hook (no auth required)
 *
 * Rate limited to 3 generations per month per IP.
 * Used for homepage "Try it free" feature.
 */
export async function POST(request: NextRequest) {
  return withObservability.trace('public_demo', async (requestId: string) => {
    try {
      const ipAddress = getClientIp(request)
      const userAgent = request.headers.get('user-agent') || undefined

      // Check demo access
      const accessResult = await checkPublicDemoAccess(ipAddress)

      if (!accessResult.allowed) {
        observability.info('Public demo rate limited', {
          requestId,
          event: 'public_demo_rate_limited',
          metadata: { ipAddress, error: accessResult.error },
        })

        return NextResponse.json(
          {
            error: accessResult.error,
            upgrade_prompt: 'Sign up for a free trial to continue!',
          },
          {
            status: 429,
            headers: accessResult.headers,
          }
        )
      }

      const { topic, platform = 'linkedin' } = await request.json()

      if (!topic || typeof topic !== 'string' || topic.length < 5) {
        return NextResponse.json(
          { error: 'Please provide a topic (at least 5 characters)' },
          { status: 400 }
        )
      }

      if (topic.length > 500) {
        return NextResponse.json(
          { error: 'Topic too long (max 500 characters)' },
          { status: 400 }
        )
      }

      const validPlatforms = ['linkedin', 'twitter']
      if (!validPlatforms.includes(platform)) {
        return NextResponse.json(
          { error: 'Platform must be linkedin or twitter' },
          { status: 400 }
        )
      }

      // Generate the demo hook
      const hook = await generateDemoHook(
        topic,
        platform as 'linkedin' | 'twitter'
      )

      // Record the generation
      await recordPublicDemoGeneration(ipAddress, {
        tokensUsed: 256, // Estimate
        userAgent,
      })

      observability.info('Public demo generated', {
        requestId,
        event: 'public_demo_success',
        metadata: { ipAddress, platform, topicLength: topic.length },
      })

      return NextResponse.json(
        {
          hook,
          platform,
          characterCount: hook.length,
          remaining: accessResult.headers?.['X-Demo-Remaining'],
          upgrade_prompt:
            'Love it? Sign up for a free trial to generate posts for all platforms!',
        },
        { headers: accessResult.headers }
      )
    } catch (error) {
      observability.error('Public demo failed', {
        requestId,
        event: 'public_demo_failure',
        error: error as Error,
      })

      return NextResponse.json(
        { error: 'Failed to generate demo. Please try again.' },
        { status: 500 }
      )
    }
  })
}

/**
 * GET /api/public-demo - Check demo availability for IP
 */
export async function GET(request: NextRequest) {
  const ipAddress = getClientIp(request)
  const accessResult = await checkPublicDemoAccess(ipAddress)

  return NextResponse.json(
    {
      available: accessResult.allowed,
      remaining: accessResult.headers?.['X-Demo-Remaining'] || '0',
    },
    { headers: accessResult.headers }
  )
}
