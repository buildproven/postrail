#!/usr/bin/env node

/**
 * Error reporting module for crash analytics (opt-in only)
 *
 * Privacy principles:
 * - Completely opt-in (prompt on error or ENV var)
 * - No personal information collected (paths/usernames sanitized)
 * - Local storage primary (optional remote sync)
 * - Easy to inspect and delete
 * - User can add context/comments
 *
 * Data collected:
 * - Error category (dependency, permission, config, validation, network)
 * - Error type and sanitized message
 * - Sanitized stack trace (paths removed)
 * - Node version and OS platform
 * - Operation attempted (setup, validate, deps)
 * - Optional user comment/context
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { REPORTING_LIMITS } = require('../config/constants')

const ERROR_REPORTS_DIR = path.join(os.homedir(), '.create-quality-automation')
const ERROR_REPORTS_FILE = path.join(ERROR_REPORTS_DIR, 'error-reports.json')
const MAX_REPORTS = REPORTING_LIMITS.MAX_ERROR_REPORTS

/**
 * Error categories for classification
 */
const ErrorCategory = {
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR', // npm install, missing packages
  PERMISSION_ERROR: 'PERMISSION_ERROR', // EACCES, EPERM
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR', // Invalid configs
  VALIDATION_ERROR: 'VALIDATION_ERROR', // ESLint/Prettier failures
  NETWORK_ERROR: 'NETWORK_ERROR', // npm registry, git
  UNKNOWN_ERROR: 'UNKNOWN_ERROR', // Uncategorized
}

/**
 * Check if error reporting is enabled
 * Can be enabled via ENV var or interactive prompt
 */
function isErrorReportingEnabled() {
  const envEnabled =
    process.env.CQA_ERROR_REPORTING === 'true' ||
    process.env.CQA_ERROR_REPORTING === '1'

  return envEnabled
}

/**
 * Categorize error based on error message and code
 */
function categorizeError(error) {
  const message = error?.message?.toLowerCase() || ''
  const code = error?.code || ''

  // Permission errors
  if (code === 'EACCES' || code === 'EPERM' || message.includes('permission')) {
    return ErrorCategory.PERMISSION_ERROR
  }

  // Dependency errors
  if (
    message.includes('npm install') ||
    message.includes('cannot find module') ||
    message.includes('module not found') ||
    code === 'MODULE_NOT_FOUND'
  ) {
    return ErrorCategory.DEPENDENCY_ERROR
  }

  // Network errors
  if (
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    message.includes('network') ||
    message.includes('registry')
  ) {
    return ErrorCategory.NETWORK_ERROR
  }

  // Configuration errors
  if (
    message.includes('package.json') ||
    message.includes('invalid config') ||
    message.includes('parse error') ||
    message.includes('syntax error')
  ) {
    return ErrorCategory.CONFIGURATION_ERROR
  }

  // Validation errors
  if (
    message.includes('eslint') ||
    message.includes('prettier') ||
    message.includes('stylelint') ||
    message.includes('validation failed')
  ) {
    return ErrorCategory.VALIDATION_ERROR
  }

  return ErrorCategory.UNKNOWN_ERROR
}

/**
 * Sanitize file path to remove personal information
 */
function sanitizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath

  // Remove username from common paths
  const homeDir = os.homedir()
  const sanitized = filePath.replace(homeDir, '/Users/<redacted>')

  // Remove common user-specific directories
  return sanitized
    .replace(/\/Users\/[^/]+/g, '/Users/<redacted>')
    .replace(/\/home\/[^/]+/g, '/home/<redacted>')
    .replace(/C:\\Users\\[^\\]+/g, 'C:\\Users\\<redacted>')
}

/**
 * Sanitize error message to remove personal information
 */
function sanitizeMessage(message) {
  if (!message || typeof message !== 'string') return message

  let sanitized = message

  // Remove file paths
  sanitized = sanitizePath(sanitized)

  // Remove git URLs with tokens
  sanitized = sanitized.replace(
    /https:\/\/[^@]+@github\.com/g,
    'https://<token>@github.com'
  )

  // Remove email addresses
  sanitized = sanitized.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '<email>'
  )

  return sanitized
}

/**
 * Sanitize stack trace to remove personal information
 */
function sanitizeStackTrace(stack) {
  if (!stack || typeof stack !== 'string') return stack

  return stack
    .split('\n')
    .map(line => sanitizePath(line))
    .join('\n')
}

/**
 * Generate unique error report ID
 */
function generateReportId() {
  return crypto.randomBytes(8).toString('hex')
}

/**
 * Ensure error reports directory exists
 */
function ensureErrorReportsDir() {
  if (!fs.existsSync(ERROR_REPORTS_DIR)) {
    fs.mkdirSync(ERROR_REPORTS_DIR, { recursive: true, mode: 0o700 })
  }
}

/**
 * Load existing error reports
 */
function loadErrorReports() {
  try {
    if (fs.existsSync(ERROR_REPORTS_FILE)) {
      const data = fs.readFileSync(ERROR_REPORTS_FILE, 'utf8')
      return JSON.parse(data)
    }
  } catch {
    // If corrupted, start fresh
    console.warn('⚠️  Error reports data corrupted, starting fresh')
  }

  return {
    version: 1,
    reports: [],
  }
}

/**
 * Save error reports (with rotation)
 */
function saveErrorReports(data) {
  try {
    ensureErrorReportsDir()

    // Rotate: keep only last MAX_REPORTS
    if (data.reports.length > MAX_REPORTS) {
      data.reports = data.reports.slice(-MAX_REPORTS)
    }

    fs.writeFileSync(
      ERROR_REPORTS_FILE,
      JSON.stringify(data, null, 2),
      { mode: 0o600 } // Owner read/write only
    )
  } catch (error) {
    // Silently fail - error reporting should never break the tool
    if (process.env.DEBUG) {
      console.error('Error reporting save failed:', error.message)
    }
  }
}

/**
 * Error reporter for capturing and analyzing crashes
 */
class ErrorReporter {
  constructor(operation = 'unknown') {
    this.operation = operation
    this.enabled = isErrorReportingEnabled()
  }

  /**
   * Capture and report an error
   *
   * @param {Error} error - The error to report
   * @param {object} context - Additional context
   * @param {string} userComment - Optional user comment
   */
  captureError(error, context = {}, userComment = null) {
    if (!this.enabled && !context.forceCapture) {
      return null
    }

    try {
      const data = loadErrorReports()

      const category = categorizeError(error)
      const reportId = generateReportId()

      const report = {
        id: reportId,
        timestamp: new Date().toISOString(),
        category,
        errorType: error?.constructor?.name || 'Error',
        message: sanitizeMessage(error?.message || 'Unknown error'),
        sanitizedStack: sanitizeStackTrace(error?.stack || ''),
        operation: this.operation,
        context: {
          nodeVersion: process.version,
          platform: os.platform(),
          arch: os.arch(),
          ...context,
        },
        userComment: userComment || null,
      }

      data.reports.push(report)
      saveErrorReports(data)

      return reportId
    } catch (captureError) {
      // Silently fail - error reporting should never break the tool
      if (process.env.DEBUG) {
        console.error('Error capture failed:', captureError.message)
      }
      return null
    }
  }

  /**
   * Get friendly error message for user
   */
  getFriendlyMessage(error) {
    const category = categorizeError(error)

    const messages = {
      [ErrorCategory.DEPENDENCY_ERROR]: {
        title: '📦 Dependency Issue',
        suggestion: 'Try running: npm install\nOr check your package.json file',
      },
      [ErrorCategory.PERMISSION_ERROR]: {
        title: '🔒 Permission Denied',
        suggestion:
          'Try running with appropriate permissions or check file ownership',
      },
      [ErrorCategory.CONFIGURATION_ERROR]: {
        title: '⚙️  Configuration Error',
        suggestion: 'Check your configuration files for syntax errors',
      },
      [ErrorCategory.VALIDATION_ERROR]: {
        title: '✅ Validation Failed',
        suggestion:
          'Review the validation errors above and fix them before continuing',
      },
      [ErrorCategory.NETWORK_ERROR]: {
        title: '🌐 Network Issue',
        suggestion: 'Check your internet connection and try again',
      },
      [ErrorCategory.UNKNOWN_ERROR]: {
        title: '❌ Unexpected Error',
        suggestion: 'Please report this issue with the error details below',
      },
    }

    return messages[category] || messages[ErrorCategory.UNKNOWN_ERROR]
  }

  /**
   * Show error report prompt to user
   */
  async promptErrorReport(error) {
    const friendly = this.getFriendlyMessage(error)

    console.error('\n' + '━'.repeat(60))
    console.error(`${friendly.title}`)
    console.error('━'.repeat(60))
    console.error(`Error: ${error?.message || 'Unknown error'}`)
    console.error(`\n💡 Suggestion: ${friendly.suggestion}`)
    console.error('━'.repeat(60))

    if (!this.enabled) {
      console.log('\n📊 Help improve this tool by reporting errors')
      console.log('Enable error reporting: export CQA_ERROR_REPORTING=true')
      console.log(`Report will be saved locally at: ${ERROR_REPORTS_FILE}`)
    }
  }
}

/**
 * Get error report statistics
 */
function getErrorReportStats() {
  const data = loadErrorReports()

  const stats = {
    totalReports: data.reports.length,
    byCategory: {},
    byPlatform: {},
    byNodeVersion: {},
    recentReports: data.reports.slice(-10),
  }

  data.reports.forEach(report => {
    // Count by category
    stats.byCategory[report.category] =
      (stats.byCategory[report.category] || 0) + 1

    // Count by platform
    const platform = report.context?.platform || 'unknown'
    stats.byPlatform[platform] = (stats.byPlatform[platform] || 0) + 1

    // Count by Node version
    const nodeVersion = report.context?.nodeVersion || 'unknown'
    stats.byNodeVersion[nodeVersion] =
      (stats.byNodeVersion[nodeVersion] || 0) + 1
  })

  return stats
}

/**
 * Clear all error reports
 */
function clearErrorReports() {
  try {
    if (fs.existsSync(ERROR_REPORTS_FILE)) {
      fs.unlinkSync(ERROR_REPORTS_FILE)
      return true
    }
    return false
  } catch (error) {
    console.error('Failed to clear error reports:', error.message)
    return false
  }
}

/**
 * Show error reporting status
 */
function showErrorReportingStatus() {
  const enabled = isErrorReportingEnabled()

  console.log('\n📊 Error Reporting Status')
  console.log('─'.repeat(50))
  console.log(
    `Status: ${enabled ? '✅ Enabled' : '❌ Disabled (opt-in required)'}`
  )

  if (enabled) {
    const stats = getErrorReportStats()
    console.log(`Total error reports: ${stats.totalReports}`)
    console.log(`Storage: ${ERROR_REPORTS_FILE}`)

    if (stats.totalReports > 0) {
      console.log('\nBy Category:')
      Object.entries(stats.byCategory).forEach(([category, count]) => {
        console.log(`  ${category}: ${count}`)
      })
    }
  } else {
    console.log('\nTo enable error reporting (opt-in):')
    console.log('  export CQA_ERROR_REPORTING=true')
    console.log('  # or add to ~/.bashrc or ~/.zshrc')
    console.log('\nWhy enable error reporting?')
    console.log('  - Helps identify common issues and failure patterns')
    console.log('  - All data stays local (no network calls)')
    console.log('  - No personal information collected (paths sanitized)')
    console.log(
      '  - Easy to inspect: cat ~/.create-quality-automation/error-reports.json'
    )
  }

  console.log('─'.repeat(50))
}

module.exports = {
  ErrorReporter,
  ErrorCategory,
  isErrorReportingEnabled,
  categorizeError,
  sanitizePath,
  sanitizeMessage,
  sanitizeStackTrace,
  getErrorReportStats,
  clearErrorReports,
  showErrorReportingStatus,
  ERROR_REPORTS_FILE,
}
