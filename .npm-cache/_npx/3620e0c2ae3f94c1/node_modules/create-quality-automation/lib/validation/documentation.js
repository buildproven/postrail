'use strict'

const fs = require('fs')
const { execSync } = require('child_process')
const { showProgress } = require('../ui-helpers')

/**
 * Documentation Validator
 * Uses mature tools for comprehensive documentation validation
 */
class DocumentationValidator {
  constructor(options = {}) {
    this.issues = []
    this.warnings = []
    this.options = options
  }

  /**
   * Validate all documentation
   */
  async validateAll() {
    console.log('📖 Running documentation validation with mature tools...')

    this.issues = []
    this.warnings = []

    if (!this.options.disableMarkdownlint) {
      await this.runMarkdownlint()
    }

    await this.validateBasicStructure()
    await this.validatePackageJsonAlignment()
    await this.validateFileReferences()
    await this.validateScriptReferences()

    // Show warnings but don't fail on them
    if (this.warnings.length > 0) {
      console.warn(`⚠️ Found ${this.warnings.length} documentation warning(s):`)
      this.warnings.forEach(warning => console.warn(`   ${warning}`))
    }

    if (this.issues.length > 0) {
      console.error(`❌ Found ${this.issues.length} documentation issue(s):`)
      this.issues.forEach(issue => console.error(`   ${issue}`))
      throw new Error('Documentation validation failed')
    }

    console.log('✅ Documentation validation passed')
    return {
      issues: this.issues,
      warnings: this.warnings,
      passed: this.issues.length === 0,
    }
  }

  /**
   * Run markdownlint for comprehensive markdown validation
   */
  async runMarkdownlint() {
    if (!fs.existsSync('README.md')) return

    const spinner = showProgress(
      'Validating markdown files with markdownlint...'
    )

    try {
      // Check if markdownlint-cli2 is available
      try {
        execSync('npx markdownlint-cli2 --version', { stdio: 'pipe' })
      } catch {
        // markdownlint-cli2 not available, skip with info message
        spinner.info(
          'markdownlint-cli2 not found - skipping markdown validation'
        )
        console.log(
          'ℹ️ markdownlint-cli2 not found - install for enhanced markdown validation'
        )
        return
      }

      // Run markdownlint on markdown files with default config (exclude node_modules)
      execSync('npx markdownlint-cli2 "**/*.md" "!node_modules/**"', {
        stdio: 'pipe',
        encoding: 'utf8',
      })
      // If we get here, markdownlint passed with no errors
      spinner.succeed('Markdown validation passed')
    } catch (error) {
      // Check both stdout and stderr for errors (markdownlint uses stderr for errors)
      if (error.status !== 0) {
        const stdout = error.stdout ? error.stdout.toString().trim() : ''
        const stderr = error.stderr ? error.stderr.toString().trim() : ''
        const output = stderr || stdout // Prefer stderr as markdownlint writes errors there

        if (output) {
          const lines = output.split('\n')

          // Filter out the header/summary lines and only include actual errors
          const errorLines = lines.filter(line => {
            const trimmed = line.trim()
            return (
              trimmed &&
              !trimmed.startsWith('markdownlint-cli2') &&
              !trimmed.startsWith('Finding:') &&
              !trimmed.startsWith('Linting:') &&
              !trimmed.startsWith('Summary:') &&
              !trimmed.startsWith('Unable to use configuration file') && // Skip config errors
              (trimmed.includes(':') || trimmed.includes('MD'))
            ) // Actual errors have line:column or MD rule format
          })

          // Convert markdown lint issues to warnings (non-blocking)
          // Markdown style is subjective and shouldn't fail CI
          errorLines.forEach(issue => {
            if (issue.trim()) {
              this.warnings.push(`Markdown lint: ${issue.trim()}`)
            }
          })

          // Add summary warning
          if (errorLines.length > 0) {
            spinner.warn(
              `markdownlint found ${errorLines.length} style issue(s)`
            )
            this.warnings.push(
              `💡 markdownlint found ${errorLines.length} style issue(s). These are warnings only.`
            )
          }
        } else {
          spinner.succeed('Markdown validation passed')
        }
      }
    }
  }

  /**
   * Basic structure validation for common documentation requirements
   */
  async validateBasicStructure() {
    if (!fs.existsSync('README.md')) {
      this.issues.push('No README.md found')
      return
    }

    const readme = fs.readFileSync('README.md', 'utf8')

    // Check for basic sections that good documentation should have
    // Convert to warnings - structure is suggestive, not mandatory
    const suggestedSections = ['install', 'usage', 'description']
    const readmeLower = readme.toLowerCase()

    for (const section of suggestedSections) {
      if (!readmeLower.includes(section)) {
        this.warnings.push(
          `README.md could include a "${section}" section for better clarity`
        )
      }
    }

    // Check if package.json exists but README doesn't mention installation (advisory)
    if (fs.existsSync('package.json')) {
      if (
        !readmeLower.includes('npm install') &&
        !readmeLower.includes('pnpm install') &&
        !readmeLower.includes('yarn install')
      ) {
        this.warnings.push(
          'README.md should include package manager installation instructions'
        )
      }
    }
  }

  /**
   * Validate package.json alignment with documentation
   */
  async validatePackageJsonAlignment() {
    if (!fs.existsSync('package.json')) {
      return
    }

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

    // Check README exists if this is a published package
    if (packageJson.name && !fs.existsSync('README.md')) {
      this.issues.push(
        'package.json defines a package name but no README.md exists'
      )
    }

    // Advisory checks for package.json metadata (warnings, not failures)
    if (
      !packageJson.description ||
      packageJson.description.trim().length === 0
    ) {
      this.warnings.push('package.json should have a meaningful description')
    }

    // Only require keywords for packages that are likely to be published
    if (
      packageJson.name &&
      packageJson.name !== 'my-project' &&
      packageJson.version &&
      (!packageJson.keywords || packageJson.keywords.length === 0)
    ) {
      this.warnings.push(
        'Published packages should have keywords in package.json for discoverability'
      )
    }

    // Advisory license check
    if (!packageJson.license) {
      this.warnings.push('package.json should specify a license')
    }

    // Validate version is semver compliant if present
    if (packageJson.version && !/^\d+\.\d+\.\d+/.test(packageJson.version)) {
      this.issues.push(
        `package.json version "${packageJson.version}" is not semver compliant`
      )
    }
  }

  /**
   * Validate README file references
   */
  async validateFileReferences() {
    if (!fs.existsSync('README.md')) {
      return
    }

    const readme = fs.readFileSync('README.md', 'utf8')

    // Match code-fenced file references like `filename.ext`
    // Looking for patterns like `package.json`, `setup.js`, etc.
    const fileRefRegex = /`([a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+)`/g
    const matches = [...readme.matchAll(fileRefRegex)]

    for (const match of matches) {
      const filePath = match[1]

      // Skip common non-file references
      if (
        filePath.includes('example') ||
        filePath.includes('placeholder') ||
        filePath.includes('your-') ||
        filePath.includes('my-') ||
        filePath.startsWith('http') ||
        filePath.startsWith('www.') ||
        // Skip common placeholders and examples
        filePath.includes('*.') ||
        filePath.includes('{') ||
        filePath.includes('}')
      ) {
        continue
      }

      // Skip files that this tool CREATES in target projects (not in package repo)
      const createdByTool = [
        // Python project files
        'pyproject.toml',
        'requirements.txt',
        'requirements-dev.txt',
        '.pre-commit-config.yaml',
        // Workflow files (created in .github/workflows/)
        'quality.yml',
        'quality-python.yml',
        // Optional tooling configs
        '.lighthouserc.js',
        'vercel.json',
      ]

      if (createdByTool.includes(filePath)) {
        continue
      }

      // Check if file exists

      if (!fs.existsSync(filePath)) {
        this.issues.push(`README.md references non-existent file: ${filePath}`)
      }
    }
  }

  /**
   * Validate README script references
   */
  async validateScriptReferences() {
    if (!fs.existsSync('README.md') || !fs.existsSync('package.json')) {
      return
    }

    const readme = fs.readFileSync('README.md', 'utf8')
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
    const scripts = packageJson.scripts || {}

    // Match npm script references like `npm run script-name`
    const scriptRefRegex = /npm run ([a-z0-9:_-]+)/gi
    const matches = [...readme.matchAll(scriptRefRegex)]

    for (const match of matches) {
      const scriptName = match[1]

      // Skip scripts that this tool CREATES in target projects (not in package repo)
      const createdByTool = [
        'lighthouse:ci',
        'python:format',
        'python:lint',
        'python:type-check',
        'python:test',
      ]

      if (createdByTool.includes(scriptName)) {
        continue
      }

      if (!scripts[scriptName]) {
        this.issues.push(
          `README.md references non-existent script: npm run ${scriptName}`
        )
      }
    }
  }
}

module.exports = { DocumentationValidator }
