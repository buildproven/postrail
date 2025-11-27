#!/usr/bin/env tsx

/**
 * Performance Benchmark Script
 *
 * Tests query performance with different data loads:
 * - 1 newsletter (baseline)
 * - 10 newsletters (small dataset)
 * - 50 newsletters (medium dataset)
 * - 100 newsletters (large dataset)
 *
 * Run with: npx tsx scripts/benchmark-performance.ts
 */

import {
  generateTestData,
  cleanTestData,
  comparePerformance,
  formatComparison,
} from '../lib/performance-benchmark'

async function main() {
  console.log('🚀 Postrail Performance Benchmark\n')

  // Get user ID from environment or prompt
  const userId = process.env.TEST_USER_ID
  if (!userId) {
    console.error('❌ Error: TEST_USER_ID environment variable not set')
    console.error(
      'Usage: TEST_USER_ID=your-user-id npx tsx scripts/benchmark-performance.ts'
    )
    process.exit(1)
  }

  console.log(`Testing with user ID: ${userId}\n`)

  // Test scenarios
  const scenarios = [
    { count: 1, label: 'Baseline (1 newsletter)' },
    { count: 10, label: 'Small Dataset (10 newsletters)' },
    { count: 50, label: 'Medium Dataset (50 newsletters)' },
    { count: 100, label: 'Large Dataset (100 newsletters)' },
  ]

  const results: Array<{
    scenario: string
    improvement: {
      timeSavedMs: number
      percentFaster: number
      queriesReduced: number
    }
  }> = []

  for (const scenario of scenarios) {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📈 Testing: ${scenario.label}`)
    console.log('='.repeat(60))

    try {
      // Clean any existing test data
      await cleanTestData(userId)

      // Generate test data
      console.log(`\n📝 Generating ${scenario.count} test newsletters...`)
      await generateTestData(userId, scenario.count)

      // Wait for database to settle
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Run comparison
      console.log('\n⏱️  Running performance comparison...\n')
      const comparison = await comparePerformance(userId)

      console.log(formatComparison(comparison))

      results.push({
        scenario: scenario.label,
        improvement: comparison.improvement,
      })

      // Clean up after this scenario
      await cleanTestData(userId)
    } catch (error) {
      console.error(`❌ Error in scenario ${scenario.label}:`, error)
    }
  }

  // Summary report
  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY REPORT')
  console.log('='.repeat(60))

  console.log('\nPerformance Improvements by Dataset Size:\n')
  console.log(
    '| Dataset            | Time Saved | % Faster | Queries Reduced |'
  )
  console.log(
    '|--------------------|------------|----------|-----------------|'
  )

  for (const result of results) {
    const { scenario, improvement } = result
    console.log(
      `| ${scenario.padEnd(18)} | ${improvement.timeSavedMs.toString().padStart(8)}ms | ${improvement.percentFaster.toString().padStart(6)}% | ${improvement.queriesReduced.toString().padStart(15)} |`
    )
  }

  console.log('\n✅ Benchmark complete!\n')

  // Recommendations
  console.log('📋 Recommendations:\n')
  const avgImprovement =
    results.reduce((sum, r) => sum + r.improvement.percentFaster, 0) /
    results.length
  if (avgImprovement > 50) {
    console.log(
      '✅ Optimized queries show significant improvement (>50% faster)'
    )
    console.log('   → Deploy optimized queries to production')
  } else if (avgImprovement > 25) {
    console.log(
      '⚠️  Optimized queries show moderate improvement (25-50% faster)'
    )
    console.log('   → Consider deploying, monitor performance')
  } else {
    console.log('⚠️  Optimized queries show minimal improvement (<25% faster)')
    console.log('   → Review query execution plans')
  }

  console.log('\n🔍 Next Steps:')
  console.log(
    '   1. Apply database indexes: docs/DATABASE_MIGRATION_performance_indexes.sql'
  )
  console.log('   2. Replace current page.tsx with page.optimized.tsx')
  console.log('   3. Test in production with real user data')
  console.log('   4. Monitor query performance in Supabase dashboard')
}

main().catch(console.error)
