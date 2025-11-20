/**
 * Test script to verify AI post generation is working
 *
 * Run with: node test-generation.js
 *
 * This will test the AI generation without needing the full app
 */

const Anthropic = require('@anthropic-ai/sdk')
require('dotenv').config({ path: '.env.local' })

async function testGeneration() {
  console.log('🔍 Testing AI Post Generation...\n')

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set in .env.local')
    process.exit(1)
  }

  console.log(
    '✅ API key found:',
    process.env.ANTHROPIC_API_KEY.substring(0, 20) + '...'
  )

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const testTitle = 'How to Build Your First SaaS in 30 Days'
  const testContent = `
    Building a SaaS product in 30 days is challenging but possible. Here's how:

    Week 1: Validate your idea
    - Talk to 10 potential customers
    - Build a landing page
    - Get 50 email signups

    Week 2: Build MVP
    - Focus on core feature only
    - Use proven tech stack
    - No perfect code, just working code

    Week 3: Get first users
    - Launch on Product Hunt
    - Share on LinkedIn
    - Email your list

    Week 4: Iterate
    - Talk to users daily
    - Fix critical bugs
    - Add one requested feature

    The key is to start small and move fast.
  `

  console.log('\n📝 Test Newsletter:')
  console.log(`   Title: ${testTitle}`)
  console.log(`   Content: ${testContent.substring(0, 100)}...`)

  console.log('\n🤖 Generating LinkedIn Pre-CTA post...')

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `Newsletter Title: ${testTitle}\n\nNewsletter Content:\n${testContent}\n\nGenerate a pre_cta post for linkedin.`,
        },
      ],
      system: `You are a newsletter growth expert. Create a pre-CTA post for LinkedIn that creates FOMO and urgency. Keep it under 2100 characters (70% of 3000 limit).`,
    })

    const content = message.content[0]
    if (content.type === 'text') {
      console.log('\n✅ SUCCESS! Generated post:\n')
      console.log('─'.repeat(60))
      console.log(content.text)
      console.log('─'.repeat(60))
      console.log(`\n📊 Character count: ${content.text.length} / 3000`)
      console.log(
        `📊 Percentage: ${Math.round((content.text.length / 3000) * 100)}%`
      )

      if (content.text.length > 3000) {
        console.log('\n⚠️  WARNING: Post exceeds LinkedIn character limit!')
      } else if (content.text.length > 2700) {
        console.log('\n⚠️  WARNING: Post is near LinkedIn character limit!')
      } else {
        console.log('\n✅ Post is within safe character limit')
      }
    }
  } catch (error) {
    console.error('\n❌ FAILED to generate post')
    console.error('Error:', error.message)
    if (error.status) {
      console.error('Status:', error.status)
    }
    if (error.error) {
      console.error('Details:', error.error)
    }
    process.exit(1)
  }

  console.log('\n✅ AI generation is working!\n')
  console.log('If you see the generated post above, the AI API is functional.')
  console.log('The issue is likely in:')
  console.log('  1. Database saving (check Supabase RLS policies)')
  console.log('  2. Post fetching on preview page')
  console.log('  3. Browser console errors\n')
}

testGeneration()
