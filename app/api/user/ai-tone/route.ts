import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

/**
 * AI Tone Settings Schema
 * Controls how Claude generates social posts
 */
const aiToneSchema = z.object({
  voice: z
    .enum(['professional', 'casual', 'witty', 'inspirational'])
    .default('professional'),
  formality: z.enum(['formal', 'balanced', 'casual']).default('balanced'),
  emoji_level: z
    .enum(['none', 'minimal', 'moderate', 'liberal'])
    .default('moderate'),
  hashtag_style: z
    .enum(['none', 'minimal', 'relevant', 'trending'])
    .default('relevant'),
  custom_instructions: z.string().max(500).nullable().optional(),
})

export type AiToneSettings = z.infer<typeof aiToneSchema>

const DEFAULT_TONE: AiToneSettings = {
  voice: 'professional',
  formality: 'balanced',
  emoji_level: 'moderate',
  hashtag_style: 'relevant',
  custom_instructions: null,
}

/**
 * GET /api/user/ai-tone
 * Returns the user's AI tone preferences
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('ai_tone')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching AI tone:', error)
      return NextResponse.json(
        { error: 'Failed to fetch settings' },
        { status: 500 }
      )
    }

    const tone = profile?.ai_tone || DEFAULT_TONE

    return NextResponse.json({
      tone,
      options: {
        voice: [
          {
            value: 'professional',
            label: 'Professional',
            description: 'Business-focused, authoritative tone',
          },
          {
            value: 'casual',
            label: 'Casual',
            description: 'Friendly, conversational approach',
          },
          {
            value: 'witty',
            label: 'Witty',
            description: 'Clever, engaging with personality',
          },
          {
            value: 'inspirational',
            label: 'Inspirational',
            description: 'Motivating, uplifting messages',
          },
        ],
        formality: [
          {
            value: 'formal',
            label: 'Formal',
            description: 'Structured, proper language',
          },
          {
            value: 'balanced',
            label: 'Balanced',
            description: 'Mix of professional and approachable',
          },
          {
            value: 'casual',
            label: 'Casual',
            description: 'Relaxed, everyday language',
          },
        ],
        emoji_level: [
          { value: 'none', label: 'None', description: 'No emojis' },
          { value: 'minimal', label: 'Minimal', description: '1-2 emojis max' },
          {
            value: 'moderate',
            label: 'Moderate',
            description: '2-4 strategic emojis',
          },
          {
            value: 'liberal',
            label: 'Liberal',
            description: 'Emoji-rich posts',
          },
        ],
        hashtag_style: [
          { value: 'none', label: 'None', description: 'No hashtags' },
          { value: 'minimal', label: 'Minimal', description: '1-2 hashtags' },
          {
            value: 'relevant',
            label: 'Relevant',
            description: '3-5 topic hashtags',
          },
          {
            value: 'trending',
            label: 'Trending',
            description: 'Include popular hashtags',
          },
        ],
      },
    })
  } catch (error) {
    console.error('AI tone GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/user/ai-tone
 * Updates the user's AI tone preferences
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const result = aiToneSchema.safeParse(body)

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid tone settings', details: result.error.issues },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({ ai_tone: result.data })
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating AI tone:', error)
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      tone: result.data,
    })
  } catch (error) {
    console.error('AI tone PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Helper function to get AI tone for a user (for use in post generation)
 */
export async function getAiToneForUser(
  userId: string
): Promise<AiToneSettings> {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const supabase = createServiceClient()

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('ai_tone')
    .eq('user_id', userId)
    .single()

  return (profile?.ai_tone as AiToneSettings) || DEFAULT_TONE
}

/**
 * Converts tone settings to prompt instructions for Claude
 */
export function toneToPromptInstructions(tone: AiToneSettings): string {
  const instructions: string[] = []

  // Voice
  switch (tone.voice) {
    case 'professional':
      instructions.push(
        'Write in a professional, authoritative voice that establishes expertise.'
      )
      break
    case 'casual':
      instructions.push(
        'Use a friendly, conversational tone like talking to a colleague.'
      )
      break
    case 'witty':
      instructions.push(
        'Be clever and engaging with a touch of humor and personality.'
      )
      break
    case 'inspirational':
      instructions.push(
        'Write in an uplifting, motivating way that inspires action.'
      )
      break
  }

  // Formality
  switch (tone.formality) {
    case 'formal':
      instructions.push(
        'Use proper, structured language with complete sentences.'
      )
      break
    case 'balanced':
      instructions.push('Balance professionalism with approachability.')
      break
    case 'casual':
      instructions.push(
        'Keep it relaxed with everyday language and contractions.'
      )
      break
  }

  // Emoji
  switch (tone.emoji_level) {
    case 'none':
      instructions.push('Do not use any emojis.')
      break
    case 'minimal':
      instructions.push('Use at most 1-2 emojis, only when very impactful.')
      break
    case 'moderate':
      instructions.push('Include 2-4 strategic emojis to enhance the message.')
      break
    case 'liberal':
      instructions.push('Use emojis liberally to make posts visually engaging.')
      break
  }

  // Hashtags
  switch (tone.hashtag_style) {
    case 'none':
      instructions.push('Do not include any hashtags.')
      break
    case 'minimal':
      instructions.push('Include only 1-2 essential hashtags.')
      break
    case 'relevant':
      instructions.push('Add 3-5 relevant topic hashtags at the end.')
      break
    case 'trending':
      instructions.push(
        'Include popular and trending hashtags where appropriate.'
      )
      break
  }

  // Custom instructions
  if (tone.custom_instructions) {
    instructions.push(`Additional style notes: ${tone.custom_instructions}`)
  }

  return instructions.join(' ')
}
