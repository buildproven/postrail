'use strict'

/**
 * UI Helpers for Progress Indicators and Accessibility
 * Provides consistent messaging with ora spinners and fallback for CI/accessibility
 */

const ACCESSIBILITY_MODE =
  process.env.NO_EMOJI === 'true' || process.env.SCREEN_READER === 'true'

const icons = ACCESSIBILITY_MODE
  ? {
      success: '[OK]',
      error: '[ERROR]',
      warning: '[WARN]',
      info: '[INFO]',
      working: '[...]',
    }
  : {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: '💡',
      working: '🔍',
    }

/**
 * Format a message with appropriate icon
 * @param {string} type - Message type (success, error, warning, info, working)
 * @param {string} message - Message text
 * @returns {string} Formatted message
 */
function formatMessage(type, message) {
  return `${icons[type]} ${message}`
}

/**
 * Show progress indicator with ora spinner or fallback
 * @param {string} message - Progress message
 * @returns {Object} Spinner-like object with succeed/fail/warn methods
 */
function showProgress(message) {
  // In CI or non-TTY environments, use simple logging
  if (process.env.CI || !process.stdout.isTTY) {
    console.log(formatMessage('working', message))
    return {
      succeed: msg => console.log(formatMessage('success', msg)),
      fail: msg => console.error(formatMessage('error', msg)),
      warn: msg => console.warn(formatMessage('warning', msg)),
      info: msg => console.log(formatMessage('info', msg)),
      stop: () => {},
      start: () => {},
    }
  }

  // Try to use ora for interactive terminals
  try {
    const ora = require('ora')
    return ora(message).start()
  } catch {
    // Fallback if ora not installed (graceful degradation)
    console.log(formatMessage('working', message))
    return {
      succeed: msg => console.log(formatMessage('success', msg)),
      fail: msg => console.error(formatMessage('error', msg)),
      warn: msg => console.warn(formatMessage('warning', msg)),
      info: msg => console.log(formatMessage('info', msg)),
      stop: () => {},
      start: () => {},
    }
  }
}

module.exports = { formatMessage, showProgress, icons, ACCESSIBILITY_MODE }
