'use strict'

const { ConfigSecurityScanner } = require('./config-security')
const { DocumentationValidator } = require('./documentation')
const { WorkflowValidator } = require('./workflow-validation')

/**
 * Enhanced Validation Runner
 * Coordinates all validation checks
 */
class ValidationRunner {
  constructor(options = {}) {
    this.options = options
    this.configScanner = new ConfigSecurityScanner(options)
    this.docValidator = new DocumentationValidator(options)
    this.workflowValidator = new WorkflowValidator(options)
  }

  /**
   * Run configuration security checks
   */
  async runConfigSecurity() {
    return await this.configScanner.scanAll()
  }

  /**
   * Run documentation accuracy checks
   */
  async runDocumentationValidation() {
    return await this.docValidator.validateAll()
  }

  /**
   * Run workflow validation checks
   */
  async runWorkflowValidation() {
    return await this.workflowValidator.validateAll()
  }

  /**
   * Run comprehensive validation
   */
  async runComprehensiveCheck() {
    console.log('🔍 Running comprehensive validation...\n')

    const results = {
      configSecurity: null,
      documentation: null,
      workflows: null,
      overall: { passed: true, issues: [] },
    }

    try {
      console.log('⏳ [1/3] Running configuration security scan...')
      results.configSecurity = await this.runConfigSecurity()
      console.log('✅ [1/3] Configuration security complete')
    } catch (error) {
      console.log('❌ [1/3] Configuration security failed')
      results.configSecurity = { passed: false, error: error.message }
      results.overall.passed = false
      results.overall.issues.push(`Configuration Security: ${error.message}`)
    }

    console.log('') // Add spacing between checks

    try {
      console.log('⏳ [2/3] Running documentation validation...')
      results.documentation = await this.runDocumentationValidation()
      console.log('✅ [2/3] Documentation validation complete')
    } catch (error) {
      console.log('❌ [2/3] Documentation validation failed')
      results.documentation = { passed: false, error: error.message }
      results.overall.passed = false
      results.overall.issues.push(`Documentation: ${error.message}`)
    }

    console.log('') // Add spacing between checks

    try {
      console.log('⏳ [3/3] Running workflow validation...')
      results.workflows = await this.runWorkflowValidation()
      console.log('✅ [3/3] Workflow validation complete')
    } catch (error) {
      console.log('❌ [3/3] Workflow validation failed')
      results.workflows = { passed: false, error: error.message }
      results.overall.passed = false
      results.overall.issues.push(`Workflows: ${error.message}`)
    }

    console.log('') // Add spacing

    if (results.overall.passed) {
      console.log('✅ All validation checks passed!')
    } else {
      console.error('❌ Validation failed with issues:')
      results.overall.issues.forEach(issue => console.error(`   - ${issue}`))
      throw new Error('Comprehensive validation failed')
    }

    return results
  }

  /**
   * Run comprehensive validation with parallel execution
   * Runs all validations concurrently for better performance
   */
  async runComprehensiveCheckParallel() {
    console.log('🔍 Running comprehensive validation (parallel)...\n')

    const results = {
      configSecurity: null,
      documentation: null,
      workflows: null,
      overall: { passed: true, issues: [] },
    }

    // Run all validations in parallel
    const validationPromises = [
      this.runConfigSecurity()
        .then(result => {
          results.configSecurity = result
          console.log('✅ Configuration security complete')
        })
        .catch(error => {
          console.log('❌ Configuration security failed')
          results.configSecurity = { passed: false, error: error.message }
          results.overall.passed = false
          results.overall.issues.push(
            `Configuration Security: ${error.message}`
          )
        }),

      this.runDocumentationValidation()
        .then(result => {
          results.documentation = result
          console.log('✅ Documentation validation complete')
        })
        .catch(error => {
          console.log('❌ Documentation validation failed')
          results.documentation = { passed: false, error: error.message }
          results.overall.passed = false
          results.overall.issues.push(`Documentation: ${error.message}`)
        }),

      this.runWorkflowValidation()
        .then(result => {
          results.workflows = result
          console.log('✅ Workflow validation complete')
        })
        .catch(error => {
          console.log('❌ Workflow validation failed')
          results.workflows = { passed: false, error: error.message }
          results.overall.passed = false
          results.overall.issues.push(`Workflows: ${error.message}`)
        }),
    ]

    // Wait for all validations to complete
    await Promise.all(validationPromises)

    console.log('') // Add spacing

    if (results.overall.passed) {
      console.log('✅ All validation checks passed!')
    } else {
      console.error('❌ Validation failed with issues:')
      results.overall.issues.forEach(issue => console.error(`   - ${issue}`))
      throw new Error('Comprehensive validation failed')
    }

    return results
  }
}

module.exports = {
  ValidationRunner,
  ConfigSecurityScanner,
  DocumentationValidator,
  WorkflowValidator,
}
