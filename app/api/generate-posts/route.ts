import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const PLATFORMS = ['linkedin', 'threads', 'facebook'] as const
const POST_TYPES = ['pre_cta', 'post_cta'] as const

// Character limits per platform
const CHAR_LIMITS = {
  linkedin: 3000,
  threads: 500,
  facebook: 63206,
}

interface GeneratedPost {
  platform: typeof PLATFORMS[number]
  postType: typeof POST_TYPES[number]
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

${postType === 'pre_cta' ? `
PRE-CTA GUIDELINES (Post 24-8 hours BEFORE newsletter):
- Create FOMO, urgency, and curiosity
- Tease 3-5 key insights WITHOUT revealing everything
- Hook readers with a compelling question or statement
- Clear CTA: "Sign up so you don't miss it: [LINK]"
- Build anticipation for tomorrow's newsletter
` : `
POST-CTA GUIDELINES (Post 48-72 hours AFTER newsletter):
- Reframe newsletter as valuable resource (guide/playbook/cheatsheet/blueprint)
- List 3-4 specific outcomes/benefits readers will gain
- Create engagement: "Comment [WORD] to get access"
- Mention it's email-gated to create perceived value
- Encourage interaction and sharing
`}

PLATFORM-SPECIFIC TONE (${platform}):
${platform === 'linkedin' ? `
- Professional, business-value focused
- Use industry jargon appropriately
- Lead with ROI or business outcomes
- Emojis: Use sparingly (1-2 max: 📊, 💡, ✅)
- Hashtags: 3-5 relevant industry tags at end
` : platform === 'threads' ? `
- Conversational, first-person voice
- Casual but valuable
- Emojis: Liberal use (2-3 per post)
- Question-based hooks
- Community-oriented language
` : `
- Story-driven, community-focused
- Longer context allowed but keep concise
- Personal anecdotes welcome
- Shareability is key
- Emojis: Moderate (1-2)
`}

CHARACTER LIMIT: ${charLimit} (stay well under, aim for ${Math.floor(charLimit * 0.7)} for optimal readability)

STRICT REQUIREMENTS:
- Do NOT include [LINK] placeholder - just write where link should go
- Return ONLY the post text, no explanations
- Stay under character limit
- Match platform tone exactly
- Include appropriate emojis for platform
- For post-CTA: Use platform-appropriate trigger words (LinkedIn: "SEND", Threads: "YES", Facebook: "INTERESTED")
`

  const userPrompt = `Newsletter Title: ${newsletterTitle}

Newsletter Content Summary:
${newsletterContent.slice(0, 2000)}

Generate a ${postType} post for ${platform}.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
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
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { title, content } = await request.json()

    if (!content) {
      return NextResponse.json(
        { error: 'Newsletter content is required' },
        { status: 400 }
      )
    }

    // Create newsletter record
    const { data: newsletter, error: newsletterError } = await supabase
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
          )
        ]).catch(error => {
          console.error(`Failed to generate ${postType} for ${platform}:`, error)
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
    // scheduled_time is null for drafts, will be set during scheduling phase
    const socialPostsData = posts.map((post) => ({
      newsletter_id: newsletter.id,
      platform: post.platform,
      post_type: post.postType,
      content: post.content,
      character_count: post.characterCount,
      scheduled_time: null,
      status: 'draft',
    }))

    const { error: postsError } = await supabase
      .from('social_posts')
      .insert(socialPostsData)

    if (postsError) {
      console.error('Social posts creation error:', postsError)
      // Rollback: delete the newsletter since posts failed to save
      await supabase.from('newsletters').delete().eq('id', newsletter.id)
      return NextResponse.json(
        { error: 'Failed to save generated posts' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      newsletterId: newsletter.id,
      postsGenerated: posts.length,
      posts,
    })
  } catch (error) {
    console.error('Post generation error:', error)

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
