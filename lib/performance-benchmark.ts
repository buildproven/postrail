/**
 * Performance Benchmarking Utilities
 *
 * Tools for measuring database query performance and comparing
 * optimized vs unoptimized query patterns.
 */

import { createClient } from '@/lib/supabase/server'

interface BenchmarkResult {
  operation: string
  timeMs: number
  queryCount: number
  rowsReturned: number
  timestamp: string
}

interface BenchmarkComparison {
  operation: string
  unoptimized: BenchmarkResult
  optimized: BenchmarkResult
  improvement: {
    timeSavedMs: number
    percentFaster: number
    queriesReduced: number
  }
}

/**
 * Measure execution time of an async operation
 */
export async function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<{ result: T; benchmark: BenchmarkResult }> {
  const startTime = performance.now()
  const result = await fn()
  const endTime = performance.now()

  const benchmark: BenchmarkResult = {
    operation,
    timeMs: endTime - startTime,
    queryCount: 1, // Default, can be overridden
    rowsReturned: Array.isArray(result) ? result.length : 1,
    timestamp: new Date().toISOString(),
  }

  return { result, benchmark }
}

/**
 * Benchmark: Unoptimized newsletter list (N+1 queries)
 */
export async function benchmarkNewsletterListUnoptimized(
  userId: string
): Promise<BenchmarkResult> {
  const supabase = await createClient()

  const { benchmark } = await measurePerformance(
    'Newsletter List (Unoptimized N+1)',
    async () => {
      // Step 1: Fetch newsletters
      const { data: newsletters } = await supabase
        .from('newsletters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (!newsletters) return []

      // Step 2: For each newsletter, fetch posts (N+1 pattern)
      const newslettersWithPosts = await Promise.all(
        newsletters.map(async newsletter => {
          const { data: posts } = await supabase
            .from('social_posts')
            .select('id, status, platform, post_type')
            .eq('newsletter_id', newsletter.id)

          return {
            ...newsletter,
            posts: posts || [],
          }
        })
      )

      return newslettersWithPosts
    }
  )

  // Adjust query count: 1 for newsletters + N for posts
  benchmark.queryCount = 1 + benchmark.rowsReturned

  return benchmark
}

/**
 * Benchmark: Optimized newsletter list (single join query)
 */
export async function benchmarkNewsletterListOptimized(
  userId: string
): Promise<BenchmarkResult> {
  const supabase = await createClient()

  const { benchmark } = await measurePerformance(
    'Newsletter List (Optimized Join)',
    async () => {
      const { data: newsletters } = await supabase
        .from('newsletters')
        .select(
          `
          *,
          social_posts (
            id,
            status,
            platform,
            post_type
          )
        `
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      return newsletters || []
    }
  )

  benchmark.queryCount = 1 // Single query with join

  return benchmark
}

/**
 * Benchmark: Newsletter preview page
 */
export async function benchmarkNewsletterPreview(
  newsletterId: string,
  userId: string
): Promise<BenchmarkResult> {
  const supabase = await createClient()

  const { benchmark } = await measurePerformance(
    'Newsletter Preview (Optimized)',
    async () => {
      const { data: newsletter } = await supabase
        .from('newsletters')
        .select(
          `
          *,
          social_posts (
            id,
            platform,
            post_type,
            content,
            character_count,
            status,
            scheduled_time
          )
        `
        )
        .eq('id', newsletterId)
        .eq('user_id', userId)
        .single()

      return newsletter
    }
  )

  return benchmark
}

/**
 * Compare unoptimized vs optimized performance
 */
export async function comparePerformance(
  userId: string
): Promise<BenchmarkComparison> {
  const unoptimized = await benchmarkNewsletterListUnoptimized(userId)
  const optimized = await benchmarkNewsletterListOptimized(userId)

  const timeSavedMs = unoptimized.timeMs - optimized.timeMs
  const percentFaster =
    unoptimized.timeMs > 0
      ? ((timeSavedMs / unoptimized.timeMs) * 100).toFixed(1)
      : '0'
  const queriesReduced = unoptimized.queryCount - optimized.queryCount

  return {
    operation: 'Newsletter Dashboard Loading',
    unoptimized,
    optimized,
    improvement: {
      timeSavedMs: Math.round(timeSavedMs),
      percentFaster: parseFloat(percentFaster),
      queriesReduced,
    },
  }
}

/**
 * Load test: Generate test data for benchmarking
 */
export async function generateTestData(
  userId: string,
  newsletterCount: number
): Promise<void> {
  const supabase = await createClient()

  console.log(`Generating ${newsletterCount} test newsletters...`)

  for (let i = 0; i < newsletterCount; i++) {
    const { data: newsletter } = await supabase
      .from('newsletters')
      .insert({
        user_id: userId,
        title: `Test Newsletter ${i + 1}`,
        content: `This is test content for newsletter ${i + 1}. `.repeat(50),
        status: 'draft',
      })
      .select()
      .single()

    if (newsletter) {
      // Generate 6 posts per newsletter (3 platforms × 2 types)
      const platforms = ['linkedin', 'threads', 'facebook']
      const postTypes = ['pre_cta', 'post_cta']

      const posts = platforms.flatMap(platform =>
        postTypes.map(post_type => ({
          newsletter_id: newsletter.id,
          platform,
          post_type,
          content: `Test ${post_type} post for ${platform}`,
          character_count: 100,
          status: 'draft',
        }))
      )

      await supabase.from('social_posts').insert(posts)
    }

    if ((i + 1) % 10 === 0) {
      console.log(`Created ${i + 1}/${newsletterCount} newsletters`)
    }
  }

  console.log(`Test data generation complete!`)
}

/**
 * Clean test data
 */
export async function cleanTestData(userId: string): Promise<void> {
  const supabase = await createClient()

  console.log('Cleaning test data...')

  const { data: newsletters } = await supabase
    .from('newsletters')
    .select('id')
    .eq('user_id', userId)
    .like('title', 'Test Newsletter %')

  if (newsletters) {
    await supabase
      .from('newsletters')
      .delete()
      .in(
        'id',
        newsletters.map(n => n.id)
      )

    console.log(
      `Deleted ${newsletters.length} test newsletters and their posts`
    )
  }
}

/**
 * Format benchmark results for display
 */
export function formatBenchmarkResult(result: BenchmarkResult): string {
  return `
📊 ${result.operation}
⏱️  Time: ${result.timeMs.toFixed(2)}ms
🔍 Queries: ${result.queryCount}
📄 Rows: ${result.rowsReturned}
🕐 Timestamp: ${result.timestamp}
  `.trim()
}

/**
 * Format comparison results for display
 */
export function formatComparison(comparison: BenchmarkComparison): string {
  const { unoptimized, optimized, improvement } = comparison

  return `
📊 Performance Comparison: ${comparison.operation}

❌ Unoptimized (N+1 Queries):
   Time: ${unoptimized.timeMs.toFixed(2)}ms
   Queries: ${unoptimized.queryCount}

✅ Optimized (Single Join):
   Time: ${optimized.timeMs.toFixed(2)}ms
   Queries: ${optimized.queryCount}

🎯 Improvement:
   Time Saved: ${improvement.timeSavedMs}ms (${improvement.percentFaster}% faster)
   Queries Reduced: ${improvement.queriesReduced} (from ${unoptimized.queryCount} to ${optimized.queryCount})
  `.trim()
}
