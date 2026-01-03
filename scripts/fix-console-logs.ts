#!/usr/bin/env ts-node

import * as fs from 'fs'
import { glob } from 'glob'

const DIRS_TO_PROCESS = ['app', 'lib', 'components']
const EXCLUDE_PATTERNS = ['node_modules', 'dist', 'build', '.next']

interface Replacement {
  file: string
  before: number
  after: number
}

async function fixConsoleLogsInFile(filePath: string): Promise<Replacement> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n')

  // Count console statements before
  const consoleBefore = (
    content.match(/console\.(log|error|warn|info|debug)/g) || []
  ).length

  // Check if logger is already imported
  const hasLoggerImport = /import.*logger.*from.*@\/lib\/logger/.test(content)

  // Replace console.log/error/warn/info with logger
  let newContent = content
    .replace(/console\.log\(/g, 'logger.info(')
    .replace(/console\.error\(/g, 'logger.error(')
    .replace(/console\.warn\(/g, 'logger.warn(')
    .replace(/console\.info\(/g, 'logger.info(')
    .replace(/console\.debug\(/g, 'logger.debug(')

  // Add logger import if needed and there were console statements
  if (!hasLoggerImport && consoleBefore > 0) {
    // Find the last import statement
    const importLines = lines.filter(line => line.trim().startsWith('import'))
    if (importLines.length > 0) {
      const lastImportIndex = lines.findIndex(
        line => line === importLines[importLines.length - 1]
      )
      lines.splice(
        lastImportIndex + 1,
        0,
        "import { logger } from '@/lib/logger'"
      )
      newContent = lines
        .join('\n')
        .replace(/console\.log\(/g, 'logger.info(')
        .replace(/console\.error\(/g, 'logger.error(')
        .replace(/console\.warn\(/g, 'logger.warn(')
        .replace(/console\.info\(/g, 'logger.info(')
        .replace(/console\.debug\(/g, 'logger.debug(')
    }
  }

  // Count console statements after
  const consoleAfter = (
    newContent.match(/console\.(log|error|warn|info|debug)/g) || []
  ).length

  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent, 'utf-8')
  }

  return {
    file: filePath,
    before: consoleBefore,
    after: consoleAfter,
  }
}

async function main() {
  const results: Replacement[] = []

  for (const dir of DIRS_TO_PROCESS) {
    const pattern = `${dir}/**/*.{ts,tsx}`
    const files = await glob(pattern, {
      ignore: EXCLUDE_PATTERNS.map(p => `**/${p}/**`),
    })

    console.log(`\nProcessing ${files.length} files in ${dir}/...`)

    for (const file of files) {
      const result = await fixConsoleLogsInFile(file)
      if (result.before > 0) {
        results.push(result)
      }
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  console.log(`Files processed: ${results.length}`)
  const totalBefore = results.reduce((sum, r) => sum + r.before, 0)
  const totalAfter = results.reduce((sum, r) => sum + r.after, 0)
  console.log(`Console statements: ${totalBefore} → ${totalAfter}`)
  console.log(`Fixed: ${totalBefore - totalAfter}`)

  if (totalAfter === 0) {
    console.log('\n✅ All console statements replaced with logger!')
  } else {
    console.log(
      `\n⚠️  ${totalAfter} console statements remaining (may be in comments or strings)`
    )
  }

  // List files with remaining console statements
  const remaining = results.filter(r => r.after > 0)
  if (remaining.length > 0) {
    console.log('\nFiles with remaining console statements:')
    remaining.forEach(r => {
      console.log(`  - ${r.file}: ${r.after}`)
    })
  }
}

main().catch(console.error)
