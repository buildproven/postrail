#!/usr/bin/env node

/**
 * Project Maturity Detection for Progressive Quality Automation
 *
 * Automatically detects project maturity level and recommends appropriate quality checks.
 *
 * Maturity Levels:
 * - minimal: Just package.json, maybe README (< 5 files)
 * - bootstrap: Some source files, no tests yet (1-2 source files)
 * - development: Active development with tests (≥ 3 source files, has tests)
 * - production-ready: Full project (≥ 10 source files, tests, docs)
 */

const fs = require('fs')
const path = require('path')
const {
  MATURITY_THRESHOLDS,
  SCAN_LIMITS,
  EXCLUDE_DIRECTORIES,
} = require('../config/constants')

/**
 * Maturity level definitions with check recommendations
 */
const MATURITY_LEVELS = {
  minimal: {
    name: 'Minimal',
    description: 'Just getting started - basic setup only',
    checks: {
      required: ['prettier'],
      optional: [],
      disabled: [
        'eslint',
        'stylelint',
        'tests',
        'coverage',
        'security-audit',
        'documentation',
      ],
    },
    message:
      '⚡ Minimal project - only basic formatting checks enabled. Add source files to enable linting.',
  },

  bootstrap: {
    name: 'Bootstrap',
    description: 'Early development - has some source files',
    checks: {
      required: ['prettier', 'eslint'],
      optional: ['stylelint'],
      disabled: ['tests', 'coverage', 'security-audit', 'documentation'],
    },
    message:
      '🚀 Bootstrap project - linting enabled. Add tests to enable test coverage checks.',
  },

  development: {
    name: 'Development',
    description: 'Active development - has source files and tests',
    checks: {
      required: ['prettier', 'eslint', 'stylelint', 'tests'],
      optional: ['coverage', 'security-audit'],
      disabled: ['documentation'],
    },
    message:
      '🔨 Development project - most checks enabled. Add documentation to enable doc validation.',
  },

  'production-ready': {
    name: 'Production Ready',
    description: 'Mature project - full quality automation',
    checks: {
      required: [
        'prettier',
        'eslint',
        'stylelint',
        'tests',
        'coverage',
        'security-audit',
        'documentation',
      ],
      optional: ['lighthouse'],
      disabled: [],
    },
    message: '✅ Production-ready project - all quality checks enabled.',
  },
}

class ProjectMaturityDetector {
  constructor(options = {}) {
    this.verbose = options.verbose || false
    this.projectPath = options.projectPath || process.cwd()
  }

  /**
   * Detect project maturity level
   * @returns {string} Maturity level: 'minimal', 'bootstrap', 'development', or 'production-ready'
   */
  detect() {
    const stats = this.analyzeProject()

    if (this.verbose) {
      console.log('📊 Project Analysis:')
      console.log(`   Source files: ${stats.totalSourceFiles}`)
      console.log(`   Test files: ${stats.testFiles}`)
      console.log(`   Has documentation: ${stats.hasDocumentation}`)
      console.log(`   Has dependencies: ${stats.hasDependencies}`)
      console.log(`   Has CSS files: ${stats.hasCssFiles}`)
    }

    // Determine maturity level based on project characteristics
    let maturity = 'minimal'

    if (stats.totalSourceFiles === 0) {
      maturity = 'minimal'
    } else if (
      stats.totalSourceFiles < MATURITY_THRESHOLDS.MIN_BOOTSTRAP_FILES &&
      stats.testFiles === 0
    ) {
      maturity = 'bootstrap'
    } else if (
      stats.testFiles > 0 &&
      stats.totalSourceFiles >= MATURITY_THRESHOLDS.MIN_BOOTSTRAP_FILES &&
      stats.totalSourceFiles < MATURITY_THRESHOLDS.MIN_PRODUCTION_FILES
    ) {
      maturity = 'development'
    } else if (
      stats.testFiles >= MATURITY_THRESHOLDS.MIN_PRODUCTION_TESTS &&
      stats.totalSourceFiles >= MATURITY_THRESHOLDS.MIN_PRODUCTION_FILES &&
      (stats.hasDocumentation || stats.hasDependencies)
    ) {
      maturity = 'production-ready'
    } else if (
      stats.totalSourceFiles >= MATURITY_THRESHOLDS.MIN_BOOTSTRAP_FILES
    ) {
      maturity = 'development'
    }

    if (this.verbose) {
      const level = MATURITY_LEVELS[maturity]
      console.log(`\n${level.message}`)
    }

    return maturity
  }

  /**
   * Get detailed project statistics
   * @returns {Object} Project statistics
   */
  analyzeProject() {
    return {
      totalSourceFiles: this.countSourceFiles(),
      testFiles: this.countTestFiles(),
      hasDocumentation: this.hasDocumentation(),
      hasTests: this.hasTests(),
      hasDependencies: this.hasDependencies(),
      hasCssFiles: this.hasCssFiles(),
      packageJsonExists: this.packageJsonExists(),
    }
  }

  /**
   * Count JavaScript/TypeScript source files (excluding tests)
   * @returns {number} Number of source files
   */
  countSourceFiles() {
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']
    const testPatterns = ['.test.', '.spec.', '__tests__', '__mocks__']

    return this.countFilesRecursive(this.projectPath, {
      extensions,
      excludeDirs: EXCLUDE_DIRECTORIES.PROJECT_MATURITY,
      excludePatterns: testPatterns,
      maxDepth: 5,
    })
  }

  /**
   * Count test files
   * @returns {number} Number of test files
   */
  countTestFiles() {
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']
    const testPatterns = ['.test.', '.spec.', '__tests__']

    return this.countFilesRecursive(this.projectPath, {
      extensions,
      excludeDirs: EXCLUDE_DIRECTORIES.PROJECT_MATURITY,
      includePatterns: testPatterns,
      maxDepth: 5,
    })
  }

  /**
   * Check if project has documentation
   * @returns {boolean} True if documentation exists
   */
  hasDocumentation() {
    const docIndicators = [
      'docs',
      'documentation',
      'doc',
      '.github/CONTRIBUTING.md',
      '.github/CODE_OF_CONDUCT.md',
    ]

    // Check for docs directory
    for (const indicator of docIndicators) {
      const docPath = path.join(this.projectPath, indicator)
      if (fs.existsSync(docPath)) {
        return true
      }
    }

    // Check for substantial README (> MIN_LINES_FOR_DOCS lines)
    const readmePath = path.join(this.projectPath, 'README.md')
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf8')
      const lines = content.split('\n').length
      if (lines > MATURITY_THRESHOLDS.README_MIN_LINES_FOR_DOCS) {
        return true
      }
    }

    return false
  }

  /**
   * Check if project has tests directory or test files
   * @returns {boolean} True if tests exist
   */
  hasTests() {
    const testDirs = [
      'test',
      'tests',
      '__tests__',
      'spec',
      'specs',
      '__specs__',
    ]

    for (const dir of testDirs) {
      const testPath = path.join(this.projectPath, dir)
      if (fs.existsSync(testPath)) {
        return true
      }
    }

    return this.countTestFiles() > 0
  }

  /**
   * Check if package.json has dependencies
   * @returns {boolean} True if dependencies exist
   */
  hasDependencies() {
    const packageJsonPath = path.join(this.projectPath, 'package.json')
    if (!fs.existsSync(packageJsonPath)) {
      return false
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      const deps = packageJson.dependencies || {}
      const devDeps = packageJson.devDependencies || {}
      return Object.keys(deps).length > 0 || Object.keys(devDeps).length > 0
    } catch {
      return false
    }
  }

  /**
   * Check if project has CSS/SCSS files
   * @returns {boolean} True if CSS files exist
   */
  hasCssFiles() {
    const extensions = ['.css', '.scss', '.sass', '.less', '.pcss']

    return (
      this.countFilesRecursive(this.projectPath, {
        extensions,
        excludeDirs: EXCLUDE_DIRECTORIES.PROJECT_MATURITY,
        maxDepth: 4,
      }) > 0
    )
  }

  /**
   * Check if package.json exists
   * @returns {boolean} True if package.json exists
   */
  packageJsonExists() {
    return fs.existsSync(path.join(this.projectPath, 'package.json'))
  }

  /**
   * Recursively counts files in a directory tree with advanced filtering
   *
   * Provides flexible file counting with multiple filter options for project
   * analysis. Supports extension filtering, directory exclusion, pattern
   * matching, and depth limiting. Skips symlinks for safety.
   *
   * Algorithm:
   * 1. Read directory entries (skip if depth > maxDepth)
   * 2. Skip excluded directories and symbolic links
   * 3. For subdirectories: recursively count (depth + 1)
   * 4. For files: apply all filters (extension, include, exclude)
   * 5. Return total count across all matching files
   *
   * Filter priority:
   * 1. Extension filter (if specified, must match)
   * 2. Include patterns (if specified, must match at least one)
   * 3. Exclude patterns (if any match, file is excluded)
   *
   * @param {string} dir - Directory to search (absolute path)
   * @param {Object} [options={}] - Search and filter options
   * @param {string[]} [options.extensions=[]] - File extensions to count (e.g., ['.js', '.ts'])
   * @param {string[]} [options.excludeDirs=[]] - Directory names to skip (e.g., ['node_modules'])
   * @param {string[]} [options.includePatterns=[]] - Filename patterns to include (substring match)
   * @param {string[]} [options.excludePatterns=[]] - Filename patterns to exclude (substring match)
   * @param {number} [options.maxDepth=5] - Maximum recursion depth
   * @param {number} [options.currentDepth=0] - Current depth (for internal recursion)
   * @returns {number} Count of files matching all filters
   *
   * @example
   * // Count all JavaScript files
   * const jsCount = maturity.countFilesRecursive('./src', {
   *   extensions: ['.js', '.jsx']
   * })
   *
   * @example
   * // Count test files in src/, excluding node_modules
   * const testCount = maturity.countFilesRecursive('./src', {
   *   includePatterns: ['.test.', '.spec.'],
   *   excludeDirs: ['node_modules', 'dist'],
   *   maxDepth: 10
   * })
   */
  countFilesRecursive(dir, options = {}) {
    const {
      extensions = [],
      excludeDirs = [],
      includePatterns = [],
      excludePatterns = [],
      maxDepth = SCAN_LIMITS.FILE_COUNT_MAX_DEPTH,
      currentDepth = 0,
    } = options

    if (currentDepth > maxDepth) {
      return 0
    }

    let count = 0

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isSymbolicLink()) {
          continue
        }

        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          if (excludeDirs.includes(entry.name)) {
            continue
          }

          count += this.countFilesRecursive(fullPath, {
            ...options,
            currentDepth: currentDepth + 1,
          })
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()

          // Check extension
          if (extensions.length > 0 && !extensions.includes(ext)) {
            continue
          }

          // Check include patterns
          if (includePatterns.length > 0) {
            const matches = includePatterns.some(pattern =>
              entry.name.includes(pattern)
            )
            if (!matches) {
              continue
            }
          }

          // Check exclude patterns
          if (excludePatterns.length > 0) {
            const excluded = excludePatterns.some(pattern =>
              entry.name.includes(pattern)
            )
            if (excluded) {
              continue
            }
          }

          count++
        }
      }
    } catch (error) {
      // Silently ignore permission errors
      if (this.verbose) {
        console.warn(`Warning: Could not read directory ${dir}:`, error.message)
      }
    }

    return count
  }

  /**
   * Get maturity level details
   * @param {string} maturity - Maturity level
   * @returns {Object} Maturity level details
   */
  getMaturityDetails(maturity) {
    return MATURITY_LEVELS[maturity] || MATURITY_LEVELS.minimal
  }

  /**
   * Get recommended checks for maturity level
   * @param {string} maturity - Maturity level
   * @returns {Object} Recommended checks
   */
  getRecommendedChecks(maturity) {
    const level = this.getMaturityDetails(maturity)
    return level.checks
  }

  /**
   * Generate GitHub Actions outputs for maturity detection
   * @returns {string} GitHub Actions output format
   */
  generateGitHubActionsOutput() {
    const maturity = this.detect()
    const stats = this.analyzeProject()
    const checks = this.getRecommendedChecks(maturity)

    return {
      maturity,
      sourceCount: stats.totalSourceFiles,
      testCount: stats.testFiles,
      hasDeps: stats.hasDependencies,
      hasDocs: stats.hasDocumentation,
      hasCss: stats.hasCssFiles,
      requiredChecks: checks.required.join(','),
      optionalChecks: checks.optional.join(','),
      disabledChecks: checks.disabled.join(','),
    }
  }

  /**
   * Print human-readable maturity report
   */
  printReport() {
    const maturity = this.detect()
    const stats = this.analyzeProject()
    const level = this.getMaturityDetails(maturity)

    console.log('\n📊 Project Maturity Report\n')
    console.log(`Maturity Level: ${level.name}`)
    console.log(`Description: ${level.description}\n`)

    console.log('Project Statistics:')
    console.log(`  • Source files: ${stats.totalSourceFiles}`)
    console.log(`  • Test files: ${stats.testFiles}`)
    console.log(`  • Documentation: ${stats.hasDocumentation ? 'Yes' : 'No'}`)
    console.log(`  • Dependencies: ${stats.hasDependencies ? 'Yes' : 'No'}`)
    console.log(`  • CSS files: ${stats.hasCssFiles ? 'Yes' : 'No'}\n`)

    console.log('Quality Checks:')
    console.log(`  ✅ Required: ${level.checks.required.join(', ')}`)
    if (level.checks.optional.length > 0) {
      console.log(`  🔵 Optional: ${level.checks.optional.join(', ')}`)
    }
    if (level.checks.disabled.length > 0) {
      console.log(`  ⏭️  Disabled: ${level.checks.disabled.join(', ')}`)
    }

    console.log(`\n${level.message}\n`)
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose') || args.includes('-v')
  const githubActions = args.includes('--github-actions')

  const detector = new ProjectMaturityDetector({ verbose })

  if (githubActions) {
    // Output for GitHub Actions
    const output = detector.generateGitHubActionsOutput()
    console.log(`maturity=${output.maturity}`)
    console.log(`source-count=${output.sourceCount}`)
    console.log(`test-count=${output.testCount}`)
    console.log(`has-deps=${output.hasDeps}`)
    console.log(`has-docs=${output.hasDocs}`)
    console.log(`has-css=${output.hasCss}`)
    console.log(`required-checks=${output.requiredChecks}`)
    console.log(`optional-checks=${output.optionalChecks}`)
    console.log(`disabled-checks=${output.disabledChecks}`)
  } else {
    // Human-readable report
    detector.printReport()
  }
}

module.exports = { ProjectMaturityDetector, MATURITY_LEVELS }
