'use strict'

const fs = require('fs')
const path = require('path')
const { EXCLUDE_DIRECTORIES } = require('../config/constants')

/**
 * TemplateLoader - Load and merge custom template configurations
 *
 * Supports loading template files from a local directory to override default
 * configurations. Enables organizations to maintain custom coding standards
 * while still using the automated setup tooling.
 *
 * Usage:
 *   const loader = new TemplateLoader()
 *   const templates = await loader.mergeTemplates('/path/to/custom', '/path/to/defaults')
 */
class TemplateLoader {
  constructor(options = {}) {
    this.verbose = options.verbose !== false
    this.strict = options.strict === true
  }

  /**
   * Validate that a template path is valid
   * @param {string} templatePath - Path to template directory
   * @returns {boolean} True if path is valid
   */
  isValidTemplatePath(templatePath) {
    if (!templatePath) {
      return false
    }

    try {
      const stats = fs.statSync(templatePath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Validate template directory structure
   * Empty directories are valid (partial templates)
   * @param {string} templateDir - Path to template directory
   * @returns {Promise<boolean>} True if structure is valid
   */
  async validateTemplateStructure(templateDir) {
    try {
      // Any directory is valid - even empty ones (partial templates are OK)

      const stats = fs.statSync(templateDir)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Directories that should be skipped during template loading
   * This prevents scanning node_modules and other unnecessary directories
   */
  static SKIP_DIRECTORIES = new Set(EXCLUDE_DIRECTORIES.TEMPLATE_LOADING)

  /**
   * Known template directories that should be scanned
   * When loading from package directory, only these are scanned
   */
  static TEMPLATE_DIRECTORIES = new Set(EXCLUDE_DIRECTORIES.TEMPLATE_WHITELIST)

  /**
   * Check if a directory should be skipped during scanning
   * @param {string} dirName - Directory name
   * @param {boolean} isPackageDir - Whether this is the package's own directory
   * @returns {boolean} True if directory should be skipped
   */
  shouldSkipDirectory(dirName, isPackageDir = false) {
    // Always skip these directories
    if (TemplateLoader.SKIP_DIRECTORIES.has(dirName)) {
      return true
    }

    // For package directory, only scan known template directories
    if (isPackageDir && !TemplateLoader.TEMPLATE_DIRECTORIES.has(dirName)) {
      return true
    }

    return false
  }

  /**
   * Recursively loads all template files from a directory tree
   *
   * Walks through a directory tree loading file contents while respecting
   * security boundaries and skip rules. When loading from the package's own
   * directory (isPackageDir=true), only scans allowed template directories
   * to prevent loading arbitrary package files.
   *
   * Algorithm:
   * 1. Read directory entries (files and subdirectories)
   * 2. Skip excluded directories (node_modules, .git, etc.)
   * 3. For files: load content and map by relative path
   * 4. For subdirs: recursively load templates (depth-first)
   * 5. Merge all templates into single flat map
   * 6. Silently continue on errors (returns partial results)
   *
   * Security:
   * - Package dir mode: Only loads from TEMPLATE_DIRECTORIES whitelist
   * - Respects SKIP_DIRECTORIES blacklist (node_modules, .git, etc.)
   * - Handles permission errors gracefully
   *
   * @param {string} dir - Directory to load from (absolute path)
   * @param {string} [baseDir=dir] - Base directory for calculating relative paths
   * @param {boolean} [isPackageDir=false] - True if scanning package's own directory
   *        (enables whitelist mode for security)
   * @returns {Promise<Object<string, string>>} Map of relative file paths to contents
   *
   * @example
   * // Load custom templates from user directory
   * const templates = await loader.loadTemplates('/user/templates', '/user/templates', false)
   * // Returns: { 'config/.prettierrc': '...', '.github/workflows/ci.yml': '...' }
   *
   * @example
   * // Load from package directory (restricted mode)
   * const templates = await loader.loadTemplates('/pkg/config', '/pkg', true)
   * // Only loads from whitelisted dirs: config/, .github/, lib/
   */
  async loadTemplates(dir, baseDir = dir, isPackageDir = false) {
    const templates = {}

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })

      for (const entry of entries) {
        // Skip directories that should not be scanned
        if (
          entry.isDirectory() &&
          this.shouldSkipDirectory(entry.name, isPackageDir)
        ) {
          continue
        }

        const fullPath = path.join(dir, entry.name)
        const relativePath = path.relative(baseDir, fullPath)

        if (entry.isDirectory()) {
          // Recursively load from subdirectories
          // After first level, we're no longer in package root
          const subTemplates = await this.loadTemplates(
            fullPath,
            baseDir,
            false
          )
          Object.assign(templates, subTemplates)
        } else if (entry.isFile()) {
          // Load file content

          const content = fs.readFileSync(fullPath, 'utf8')
          templates[relativePath] = content
        }
      }
    } catch (error) {
      if (this.verbose) {
        console.warn(
          `⚠️ Warning: Could not load templates from ${dir}: ${error.message}`
        )
      }
    }

    return templates
  }

  /**
   * Merge custom templates with defaults
   * Custom templates override defaults, but defaults fill in gaps
   * @param {string} customDir - Path to custom template directory
   * @param {string} defaultsDir - Path to defaults directory (package __dirname)
   * @returns {Promise<Object>} Merged template map
   */
  async mergeTemplates(customDir, defaultsDir) {
    const merged = {}

    // Load defaults first (from package directory - restrict to known template dirs)
    if (this.isValidTemplatePath(defaultsDir)) {
      const defaults = await this.loadTemplates(defaultsDir, defaultsDir, true)
      Object.assign(merged, defaults)
    }

    // Load custom templates (overrides defaults - scan fully, it's user-controlled)
    if (customDir) {
      // In strict mode, custom template path MUST be valid if provided
      if (!this.isValidTemplatePath(customDir)) {
        const errorMsg = `Custom template directory not found or invalid: ${customDir}`
        if (this.strict) {
          throw new Error(errorMsg)
        } else {
          if (this.verbose) {
            console.warn(`⚠️ ${errorMsg}`)
            console.warn('   Falling back to default templates')
          }
        }
      } else {
        const isValid = await this.validateTemplateStructure(customDir)

        if (!isValid) {
          const errorMsg = 'Invalid template structure'
          if (this.strict) {
            throw new Error(errorMsg)
          } else {
            if (this.verbose) {
              console.warn(`⚠️ ${errorMsg}, using defaults`)
            }
          }
        } else {
          const custom = await this.loadTemplates(customDir, customDir, false)
          Object.assign(merged, custom) // Custom templates override defaults

          if (this.verbose && Object.keys(custom).length > 0) {
            console.log(
              `✅ Loaded ${Object.keys(custom).length} custom template file(s)`
            )
          }
        }
      }
    }

    return merged
  }

  /**
   * Get the template file content or undefined if not found
   * @param {Object} templates - Template map from loadTemplates/mergeTemplates
   * @param {string} relativePath - Relative path to file
   * @returns {string|undefined} File content or undefined
   */
  getTemplate(templates, relativePath) {
    return templates[relativePath]
  }

  /**
   * Check if a specific template file exists in the template map
   * @param {Object} templates - Template map from loadTemplates/mergeTemplates
   * @param {string} relativePath - Relative path to file
   * @returns {boolean} True if template exists
   */
  hasTemplate(templates, relativePath) {
    return relativePath in templates
  }
}

module.exports = { TemplateLoader }
