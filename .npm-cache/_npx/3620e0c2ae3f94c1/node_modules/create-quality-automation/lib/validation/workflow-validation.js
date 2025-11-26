'use strict'

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const { showProgress } = require('../ui-helpers')

/**
 * GitHub Actions Workflow Validator
 * Basic validation for GitHub Actions workflow files
 */
class WorkflowValidator {
  constructor(options = {}) {
    this.issues = []
    this.options = options
  }

  /**
   * Validate GitHub Actions workflows
   */
  async validateAll() {
    console.log('🔄 Validating GitHub Actions workflows...')

    this.issues = []

    await this.validateWorkflowFiles()

    if (!this.options.disableActionlint) {
      await this.runActionlint()
    }

    await this.validateWorkflowSyntax()

    if (this.issues.length > 0) {
      console.error(`❌ Found ${this.issues.length} workflow issue(s):`)
      this.issues.forEach(issue => console.error(`   ${issue}`))
      throw new Error('Workflow validation failed')
    }

    console.log('✅ Workflow validation passed')
    return { issues: this.issues, passed: this.issues.length === 0 }
  }

  /**
   * Check for workflow files and basic structure
   */
  async validateWorkflowFiles() {
    const workflowDir = '.github/workflows'

    if (!fs.existsSync(workflowDir)) {
      this.issues.push('No .github/workflows directory found')
      return
    }

    const workflowFiles = fs
      .readdirSync(workflowDir)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))

    if (workflowFiles.length === 0) {
      this.issues.push('No workflow files found in .github/workflows')
      return
    }

    console.log(
      `📄 Found ${workflowFiles.length} workflow file(s): ${workflowFiles.join(', ')}`
    )
  }

  /**
   * Run actionlint for advanced workflow validation
   */
  async runActionlint() {
    const workflowDir = '.github/workflows'

    if (!fs.existsSync(workflowDir)) return

    const spinner = showProgress('Running actionlint on workflow files...')

    try {
      // Run actionlint via npx (works with local and global installs, cross-platform)
      execSync('npx actionlint', { stdio: 'pipe', cwd: process.cwd() })
      spinner.succeed('actionlint validation passed')
    } catch (error) {
      if (error.stdout || error.stderr) {
        const output = error.stdout
          ? error.stdout.toString()
          : error.stderr.toString()
        const lines = output
          .trim()
          .split('\n')
          .filter(line => line.trim())

        if (lines.length > 0) {
          spinner.fail(`actionlint found ${lines.length} issue(s)`)
          lines.forEach(line => {
            if (line.trim()) {
              this.issues.push(`actionlint: ${line.trim()}`)
            }
          })
        } else {
          spinner.succeed('actionlint validation passed')
        }
      } else {
        spinner.succeed('actionlint validation passed')
      }
    }
  }

  /**
   * Basic YAML syntax validation for workflow files
   */
  async validateWorkflowSyntax() {
    const workflowDir = '.github/workflows'

    if (!fs.existsSync(workflowDir)) return

    const workflowFiles = fs
      .readdirSync(workflowDir)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))

    for (const file of workflowFiles) {
      const filePath = path.join(workflowDir, file)
      try {
        const content = fs.readFileSync(filePath, 'utf8')

        // Basic checks for required workflow structure
        if (!content.includes('on:') && !content.includes('on ')) {
          this.issues.push(`${file}: Missing 'on:' trigger specification`)
        }

        if (!content.includes('jobs:') && !content.includes('jobs ')) {
          this.issues.push(`${file}: Missing 'jobs:' specification`)
        }

        // Check for common issues
        if (
          content.includes('ubuntu-latest') &&
          content.includes('node-version:')
        ) {
          // This is likely a Node.js workflow, check for proper setup
          if (!content.includes('actions/setup-node@')) {
            this.issues.push(
              `${file}: Node.js workflow should use actions/setup-node`
            )
          }
        }

        // Check for security best practices
        if (
          content.includes('${{') &&
          content.includes('github.event.pull_request.head.repo.full_name')
        ) {
          this.issues.push(
            `${file}: Potential security risk using untrusted PR data`
          )
        }
      } catch (error) {
        this.issues.push(`${file}: Error reading file - ${error.message}`)
      }
    }
  }
}

module.exports = { WorkflowValidator }
