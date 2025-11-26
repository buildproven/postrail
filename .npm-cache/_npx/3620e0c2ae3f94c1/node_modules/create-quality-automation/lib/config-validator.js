'use strict'

const Ajv = require('ajv')
const addFormats = require('ajv-formats')
const fs = require('fs')
const path = require('path')

function validateQualityConfig(configPath) {
  const result = {
    valid: false,
    errors: [],
    config: null,
  }

  // DEBUG: Log entry
  if (process.env.DEBUG_VALIDATOR) {
    console.error(`[DEBUG] validateQualityConfig called with: ${configPath}`)
  }

  if (!fs.existsSync(configPath)) {
    result.errors.push('Configuration file not found: ' + configPath)
    return result
  }

  let config
  try {
    const configContent = fs.readFileSync(configPath, 'utf8')
    config = JSON.parse(configContent)
    result.config = config
  } catch (error) {
    result.errors.push('Failed to parse configuration file: ' + error.message)
    return result
  }

  let schema
  try {
    const schemaPath = path.join(
      __dirname,
      '..',
      'config',
      'quality-config.schema.json'
    )
    const schemaContent = fs.readFileSync(schemaPath, 'utf8')
    schema = JSON.parse(schemaContent)
  } catch (error) {
    result.errors.push('Failed to load configuration schema: ' + error.message)
    return result
  }

  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)

  const validate = ajv.compile(schema)
  const valid = validate(config)

  if (!valid) {
    if (validate.errors) {
      validate.errors.forEach(error => {
        const errorPath = error.instancePath || '(root)'
        const message = error.message || 'validation failed'

        if (error.keyword === 'required') {
          result.errors.push(
            'Missing required field: ' +
              (error.params?.missingProperty || 'unknown')
          )
        } else if (error.keyword === 'enum') {
          result.errors.push(
            'Invalid value at ' +
              errorPath +
              ': must be one of ' +
              (error.params?.allowedValues?.join(', ') || 'unknown values')
          )
        } else if (error.keyword === 'type') {
          result.errors.push(
            'Invalid type at ' +
              errorPath +
              ': expected ' +
              (error.params?.type || 'unknown')
          )
        } else if (error.keyword === 'pattern') {
          result.errors.push('Invalid format at ' + errorPath + ': ' + message)
        } else if (error.keyword === 'minimum') {
          result.errors.push(
            'Invalid value at ' +
              errorPath +
              ': must be >= ' +
              (error.params?.limit ?? 'unknown')
          )
        } else if (error.keyword === 'additionalProperties') {
          result.errors.push(
            'Unknown property at ' +
              errorPath +
              ': ' +
              (error.params?.additionalProperty || 'unknown')
          )
        } else {
          result.errors.push(
            'Validation error at ' + errorPath + ': ' + message
          )
        }
      })
    }
  } else {
    result.valid = true
  }

  return result
}

/**
 * Validate configuration and print results to console
 * @param {string} configPath - Path to .qualityrc.json file
 * @returns {boolean} - true if valid, false if invalid
 */
function validateAndReport(configPath) {
  const { formatMessage } = require('./ui-helpers')

  console.log(
    formatMessage('working', 'Validating .qualityrc.json configuration...')
  )
  console.log('')

  const result = validateQualityConfig(configPath)

  if (!result.valid) {
    console.error(formatMessage('error', 'Configuration validation failed!\n'))
    result.errors.forEach((error, index) => {
      console.error(`   ${index + 1}. ${error}`)
    })
    console.error('')
    console.error(formatMessage('info', 'Fix the errors above and try again.'))
    console.error(
      formatMessage('info', 'See .qualityrc.json.example for reference.\n')
    )
    return false
  }

  console.log(formatMessage('success', 'Configuration is valid!\n'))

  if (result.config) {
    console.log('Configuration summary:')
    console.log(`   Version: ${result.config.version}`)
    console.log(`   Maturity: ${result.config.maturity || 'auto'}`)

    if (result.config.checks) {
      const enabledChecks = Object.entries(result.config.checks)
        .filter(
          ([, check]) => check.enabled === true || check.enabled === 'auto'
        )
        .map(([name]) => name)

      console.log(
        `   Enabled checks: ${enabledChecks.length > 0 ? enabledChecks.join(', ') : 'none'}`
      )
    }
    console.log('')
  }

  return true
}

module.exports = { validateQualityConfig, validateAndReport }
