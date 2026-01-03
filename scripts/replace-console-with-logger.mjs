#!/usr/bin/env node
/**
 * Script to replace console statements with proper logger calls in production code
 *
 * Usage: node scripts/replace-console-with-logger.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { glob } from 'glob'

// Directories to process (production code only)
const INCLUDE_PATTERNS = [
  'app/api/**/*.ts',
  'lib/**/*.ts',
  'components/**/*.tsx',
  'app/dashboard/**/*.tsx',
]

// Files to exclude (tests, scripts, etc.)
const EXCLUDE_PATTERNS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/test/**',
  '**/tests/**',
  'e2e/**',
  'scripts/**',
  'lib/observability.ts', // Observability layer uses console intentionally
  'lib/env-validator.ts', // Startup validation uses console intentionally
  'lib/performance-benchmark.ts', // Benchmarking tool
  '**/node_modules/**',
]

// Replacement rules
const REPLACEMENTS = [
  {
    pattern: /console\.error\((.*?)\)/g,
    replacement: (match, args) => {
      // Check if it's already using error as Error cast
      if (args.includes(' as Error')) {
        return `logger.error(${args})`
      }
      // If it's a simple string + error pattern
      const parts = args.split(',').map(s => s.trim())
      if (parts.length === 2) {
        const [msg, err] = parts
        return `logger.error(${msg}, { error: ${err} as Error })`
      }
      // Single argument - treat as message
      return `logger.error(${args})`
    },
  },
  {
    pattern: /console\.warn\((.*?)\)/g,
    replacement: (match, args) => `logger.warn(${args})`,
  },
  {
    pattern: /console\.log\((.*?)\)/g,
    replacement: (match, args) => `logger.info(${args})`,
  },
  {
    pattern: /console\.info\((.*?)\)/g,
    replacement: (match, args) => `logger.info(${args})`,
  },
]

async function processFile(filePath) {
  let content = readFileSync(filePath, 'utf8')
  let modified = false

  // Skip if file doesn't have console statements
  if (!content.includes('console.')) {
    return { path: filePath, modified: false }
  }

  // Skip if it's just in comments/strings
  const uncommentedContent = content
    .replace(/\/\/.*$/gm, '') // Remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/"[^"]*"/g, '""') // Remove string contents
    .replace(/'[^']*'/g, "''") // Remove string contents
    .replace(/`[^`]*`/g, '``') // Remove template string contents

  if (!uncommentedContent.includes('console.')) {
    return { path: filePath, modified: false }
  }

  // Check if logger is already imported
  const hasLoggerImport = content.includes("from '@/lib/logger'")

  // Apply replacements
  for (const { pattern, replacement } of REPLACEMENTS) {
    if (typeof replacement === 'function') {
      const newContent = content.replace(pattern, replacement)
      if (newContent !== content) {
        modified = true
        content = newContent
      }
    } else {
      const newContent = content.replace(pattern, replacement)
      if (newContent !== content) {
        modified = true
        content = newContent
      }
    }
  }

  // Add logger import if not present and file was modified
  if (modified && !hasLoggerImport) {
    // Find the last import statement
    const importRegex = /^import\s+.*from\s+['"][^'"]+['"]/gm
    const imports = content.match(importRegex)

    if (imports && imports.length > 0) {
      const lastImport = imports[imports.length - 1]
      const importIndex = content.lastIndexOf(lastImport)
      const insertIndex = importIndex + lastImport.length

      content =
        content.slice(0, insertIndex) +
        "\nimport { logger } from '@/lib/logger'" +
        content.slice(insertIndex)
    }
  }

  if (modified) {
    writeFileSync(filePath, content, 'utf8')
  }

  return { path: filePath, modified }
}

async function main() {
  console.log('🔍 Finding files to process...\n')

  const files = await glob(INCLUDE_PATTERNS, {
    ignore: EXCLUDE_PATTERNS,
    nodir: true,
  })

  console.log(`Found ${files.length} files to scan\n`)

  const results = []
  for (const file of files) {
    const result = await processFile(file)
    results.push(result)
    if (result.modified) {
      console.log(`✅ Updated: ${file}`)
    }
  }

  const modifiedCount = results.filter(r => r.modified).length

  console.log(`\n✨ Complete! Modified ${modifiedCount} files.`)
}

main().catch(console.error)
