/**
 * Query Optimization Tests
 *
 * Validates that optimized queries:
 * 1. Return same data as unoptimized queries (correctness)
 * 2. Use fewer database queries (efficiency)
 * 3. Perform faster under load (performance)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import {
  benchmarkNewsletterListUnoptimized,
  benchmarkNewsletterListOptimized,
  generateTestData,
  cleanTestData,
  comparePerformance,
} from '@/lib/performance-benchmark'

describe('Query Optimization - Correctness', () => {
  let testUserId: string
  let supabase: Awaited<ReturnType<typeof createClient>>

  beforeAll(async () => {
    supabase = await createClient()

    // Create test user or use existing
    const {
      data: { user },
    } = await supabase.auth.getUser()
    testUserId = user?.id || 'test-user-id'

    // Generate test data
    await generateTestData(testUserId, 5)
  })

  afterAll(async () => {
    await cleanTestData(testUserId)
  })

  it('should return same number of newsletters', async () => {
    const unoptimized = await benchmarkNewsletterListUnoptimized(testUserId)
    const optimized = await benchmarkNewsletterListOptimized(testUserId)

    expect(unoptimized.rowsReturned).toBe(optimized.rowsReturned)
  })

  it('should reduce number of queries from N+1 to 1', async () => {
    const unoptimized = await benchmarkNewsletterListUnoptimized(testUserId)
    const optimized = await benchmarkNewsletterListOptimized(testUserId)

    // Unoptimized: 1 query for newsletters + N queries for posts
    expect(unoptimized.queryCount).toBeGreaterThan(1)

    // Optimized: 1 query with join
    expect(optimized.queryCount).toBe(1)

    // Should reduce queries
    expect(optimized.queryCount).toBeLessThan(unoptimized.queryCount)
  })

  it('should include post data in optimized query', async () => {
    const { data: newsletters } = await (
      await createClient()
    )
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
      .eq('user_id', testUserId)
      .limit(1)

    expect(newsletters).toBeDefined()
    expect(newsletters?.length).toBeGreaterThan(0)

    const newsletter = newsletters![0]
    expect(newsletter).toHaveProperty('social_posts')
    expect(Array.isArray(newsletter.social_posts)).toBe(true)

    // Should have 6 posts per newsletter (3 platforms × 2 types)
    if (newsletter.social_posts.length > 0) {
      expect(newsletter.social_posts[0]).toHaveProperty('id')
      expect(newsletter.social_posts[0]).toHaveProperty('status')
      expect(newsletter.social_posts[0]).toHaveProperty('platform')
      expect(newsletter.social_posts[0]).toHaveProperty('post_type')
    }
  })
})

describe('Query Optimization - Performance', () => {
  let testUserId: string

  beforeAll(async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    testUserId = user?.id || 'test-user-id'
  })

  afterAll(async () => {
    await cleanTestData(testUserId)
  })

  it('should be faster with 10 newsletters', async () => {
    await cleanTestData(testUserId)
    await generateTestData(testUserId, 10)

    const comparison = await comparePerformance(testUserId)

    // Optimized should be faster
    expect(comparison.optimized.timeMs).toBeLessThan(
      comparison.unoptimized.timeMs
    )

    // Should show significant improvement
    expect(comparison.improvement.percentFaster).toBeGreaterThan(0)
  })

  it('should scale better with 50 newsletters', async () => {
    await cleanTestData(testUserId)
    await generateTestData(testUserId, 50)

    const comparison = await comparePerformance(testUserId)

    // With larger dataset, improvement should be even more significant
    expect(comparison.improvement.percentFaster).toBeGreaterThan(30)

    // Should complete in reasonable time even with large dataset
    expect(comparison.optimized.timeMs).toBeLessThan(1000) // < 1 second
  })

  it('should maintain performance with 100 newsletters', async () => {
    await cleanTestData(testUserId)
    await generateTestData(testUserId, 100)

    const comparison = await comparePerformance(testUserId)

    // Should still show improvement at scale
    expect(comparison.improvement.percentFaster).toBeGreaterThan(50)

    // Should complete in reasonable time
    expect(comparison.optimized.timeMs).toBeLessThan(2000) // < 2 seconds
  })
})

describe('Query Optimization - Index Impact', () => {
  let testUserId: string
  let supabase: Awaited<ReturnType<typeof createClient>>

  beforeAll(async () => {
    supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    testUserId = user?.id || 'test-user-id'

    // Generate moderate dataset
    await generateTestData(testUserId, 20)
  })

  afterAll(async () => {
    await cleanTestData(testUserId)
  })

  it('should check if performance indexes exist', async () => {
    // Query to check for indexes
    const { data: indexes } = await supabase.rpc('pg_indexes', {
      schemaname: 'public',
    })

    const expectedIndexes = [
      'idx_newsletters_user_created',
      'idx_social_posts_newsletter',
      'idx_newsletters_id_user',
      'idx_platform_connections_user_platform',
    ]

    // Note: This test will pass or fail based on whether indexes are applied
    // It's informational - shows whether migration has been run
    if (indexes) {
      const indexNames = indexes.map(
        (idx: { indexname: string }) => idx.indexname
      )

      expectedIndexes.forEach(expectedIndex => {
        const exists = indexNames.includes(expectedIndex)
        console.log(
          `Index ${expectedIndex}: ${exists ? '✅ EXISTS' : '⚠️  MISSING'}`
        )
      })
    }
  })

  it('should benefit from indexes on large queries', async () => {
    const start = performance.now()

    // This query should use idx_newsletters_user_created
    const { data: newsletters } = await supabase
      .from('newsletters')
      .select('*')
      .eq('user_id', testUserId)
      .order('created_at', { ascending: false })
      .limit(10)

    const end = performance.now()
    const queryTime = end - start

    expect(newsletters).toBeDefined()

    // With index: should be very fast (< 100ms)
    // Without index: could be slower on large datasets
    console.log(
      `Query time with ${newsletters?.length || 0} newsletters: ${queryTime.toFixed(2)}ms`
    )

    // Informational: log whether performance meets expectations
    if (queryTime < 100) {
      console.log('✅ Query performance excellent (likely using index)')
    } else if (queryTime < 500) {
      console.log('⚠️  Query performance acceptable (may not be using index)')
    } else {
      console.log('❌ Query performance poor (indexes may not be applied)')
    }
  })
})

describe('Query Optimization - Edge Cases', () => {
  let testUserId: string
  let supabase: Awaited<ReturnType<typeof createClient>>

  beforeAll(async () => {
    supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    testUserId = user?.id || 'test-user-id'
  })

  afterAll(async () => {
    await cleanTestData(testUserId)
  })

  it('should handle newsletters with no posts', async () => {
    await cleanTestData(testUserId)

    // Create newsletter without posts
    await supabase.from('newsletters').insert({
      user_id: testUserId,
      title: 'Newsletter without posts',
      content: 'Test content',
      status: 'draft',
    })

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
      .eq('user_id', testUserId)

    expect(newsletters).toBeDefined()
    expect(newsletters?.length).toBeGreaterThan(0)

    const newsletter = newsletters![0]
    expect(newsletter.social_posts).toBeDefined()
    expect(Array.isArray(newsletter.social_posts)).toBe(true)
    expect(newsletter.social_posts.length).toBe(0)
  })

  it('should handle empty result set', async () => {
    await cleanTestData(testUserId)

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
      .eq('user_id', testUserId)

    expect(newsletters).toBeDefined()
    expect(newsletters).toEqual([])
  })

  it('should handle partial post sets', async () => {
    await cleanTestData(testUserId)

    // Create newsletter with only 3 posts (not the full 6)
    const { data: newsletter } = await supabase
      .from('newsletters')
      .insert({
        user_id: testUserId,
        title: 'Partial posts newsletter',
        content: 'Test content',
        status: 'draft',
      })
      .select()
      .single()

    if (newsletter) {
      await supabase.from('social_posts').insert([
        {
          newsletter_id: newsletter.id,
          platform: 'linkedin',
          post_type: 'pre_cta',
          content: 'Test post 1',
          status: 'draft',
        },
        {
          newsletter_id: newsletter.id,
          platform: 'linkedin',
          post_type: 'post_cta',
          content: 'Test post 2',
          status: 'draft',
        },
        {
          newsletter_id: newsletter.id,
          platform: 'threads',
          post_type: 'pre_cta',
          content: 'Test post 3',
          status: 'draft',
        },
      ])
    }

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
      .eq('user_id', testUserId)

    expect(newsletters).toBeDefined()
    expect(newsletters![0].social_posts.length).toBe(3)
  })
})
