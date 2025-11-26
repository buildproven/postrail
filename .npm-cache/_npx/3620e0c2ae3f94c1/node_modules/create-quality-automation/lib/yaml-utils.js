/**
 * YAML Utilities
 *
 * Shared utilities for converting JavaScript objects to YAML format.
 * Used across dependency monitoring modules.
 */

/**
 * Converts a JavaScript object to YAML format
 *
 * Recursively converts nested objects and arrays to properly indented YAML.
 * Handles:
 * - Arrays (converted to YAML list format with `-` prefix)
 * - Objects (converted to key-value pairs with proper indentation)
 * - Primitive values (strings, numbers, booleans)
 *
 * @param {*} obj - The object to convert to YAML
 * @param {number} [indent=0] - Current indentation level (number of spaces)
 * @returns {string} YAML-formatted string representation of the object
 *
 * @example
 * ```javascript
 * const config = {
 *   updates: [
 *     { 'package-ecosystem': 'npm', directory: '/' }
 *   ]
 * }
 * console.log(convertToYaml(config))
 * // Output:
 * // updates:
 * //   - package-ecosystem: npm
 * //     directory: /
 * ```
 */
function convertToYaml(obj, indent = 0) {
  const spaces = ' '.repeat(indent)
  let yaml = ''

  if (Array.isArray(obj)) {
    obj.forEach(item => {
      if (typeof item === 'object' && item !== null) {
        yaml += `${spaces}- ${convertToYaml(item, indent + 2).trim()}\n`
      } else {
        yaml += `${spaces}- ${item}\n`
      }
    })
  } else if (typeof obj === 'object' && obj !== null) {
    Object.entries(obj).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`
        yaml += convertToYaml(value, indent + 2)
      } else if (typeof value === 'object' && value !== null) {
        yaml += `${spaces}${key}:\n`
        yaml += convertToYaml(value, indent + 2)
      } else {
        yaml += `${spaces}${key}: ${value}\n`
      }
    })
  }

  return yaml
}

module.exports = {
  convertToYaml,
}
