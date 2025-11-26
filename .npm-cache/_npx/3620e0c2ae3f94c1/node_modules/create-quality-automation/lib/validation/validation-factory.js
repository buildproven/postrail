'use strict'

const { ConfigSecurityScanner } = require('./config-security')
const { DocumentationValidator } = require('./documentation')
const { WorkflowValidator } = require('./workflow-validation')

/**
 * Validation Factory
 * Implements dependency injection pattern for validators
 * Centralizes validator instantiation and configuration
 */
class ValidationFactory {
  constructor(globalOptions = {}) {
    this.globalOptions = globalOptions
    this.validators = new Map()
  }

  /**
   * Create and register a validator instance
   * @param {string} type - Validator type ('security', 'documentation', 'workflow')
   * @param {object} options - Validator-specific options
   * @returns {object} Validator instance
   */
  createValidator(type, options = {}) {
    // Merge global options with validator-specific options
    const mergedOptions = { ...this.globalOptions, ...options }

    let validator
    switch (type) {
      case 'security':
        validator = new ConfigSecurityScanner(mergedOptions)
        break

      case 'documentation':
        validator = new DocumentationValidator(mergedOptions)
        break

      case 'workflow':
        validator = new WorkflowValidator(mergedOptions)
        break

      default:
        throw new Error(`Unknown validator type: ${type}`)
    }

    // Register validator for later retrieval
    this.validators.set(type, validator)

    return validator
  }

  /**
   * Get a registered validator
   * @param {string} type - Validator type
   * @returns {object|null} Validator instance or null if not found
   */
  getValidator(type) {
    return this.validators.get(type) || null
  }

  /**
   * Create all validators
   * @returns {object} Map of all validator instances
   */
  createAllValidators(options = {}) {
    const types = ['security', 'documentation', 'workflow']
    const validators = {}

    types.forEach(type => {
      validators[type] = this.createValidator(type, options)
    })

    return validators
  }

  /**
   * Run all validators
   * @returns {object} Validation results
   */
  async validateAll() {
    const results = {
      passed: true,
      issues: [],
      warnings: [],
      validators: {},
    }

    for (const [type, validator] of this.validators) {
      try {
        await validator.validate()

        results.validators[type] = {
          passed: validator.passed(),
          issues: validator.getIssues(),
          warnings: validator.getWarnings(),
        }

        // Aggregate issues and warnings
        results.issues.push(...validator.getIssues())
        results.warnings.push(...validator.getWarnings())

        if (!validator.passed()) {
          results.passed = false
        }
      } catch (error) {
        results.passed = false
        results.issues.push(`${type} validator failed: ${error.message}`)

        results.validators[type] = {
          passed: false,
          error: error.message,
        }
      }
    }

    return results
  }

  /**
   * Clear all registered validators
   */
  clear() {
    this.validators.clear()
  }

  /**
   * Get validation summary
   * @returns {object} Summary of all validators
   */
  getSummary() {
    const summary = {
      total: this.validators.size,
      passed: 0,
      failed: 0,
      totalIssues: 0,
      totalWarnings: 0,
    }

    for (const validator of this.validators.values()) {
      if (validator.passed()) {
        summary.passed++
      } else {
        summary.failed++
      }
      summary.totalIssues += validator.getIssues().length
      summary.totalWarnings += validator.getWarnings().length
    }

    return summary
  }
}

module.exports = ValidationFactory
