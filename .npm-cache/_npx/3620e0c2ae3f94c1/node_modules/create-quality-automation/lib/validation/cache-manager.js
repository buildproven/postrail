'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

/**
 * Cache Manager for Validation Results
 * Caches validation results to avoid re-running validations on unchanged files
 */
class CacheManager {
  constructor(options = {}) {
    this.cacheDir =
      options.cacheDir ||
      path.join(process.cwd(), '.create-quality-automation-cache')
    this.ttl = options.ttl || 24 * 60 * 60 * 1000 // Default: 24 hours in milliseconds
    this.enabled = options.enabled !== false // Enable by default

    // Ensure cache directory exists
    if (this.enabled) {
      this.ensureCacheDir()
    }
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true })
    }
  }

  /**
   * Generate cache key from file content
   * @param {string} filePath - Path to file
   * @returns {string} Hash of file content
   */
  generateKey(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      return crypto.createHash('sha256').update(content).digest('hex')
    } catch {
      // If file doesn't exist or can't be read, return timestamp-based key
      return crypto
        .createHash('sha256')
        .update(`${filePath}-${Date.now()}`)
        .digest('hex')
    }
  }

  /**
   * Generate cache key from multiple files
   * @param {string[]} filePaths - Array of file paths
   * @returns {string} Combined hash of all files
   */
  generateKeyFromFiles(filePaths) {
    const hashes = filePaths.map(filePath => this.generateKey(filePath))
    const combined = hashes.join('-')
    return crypto.createHash('sha256').update(combined).digest('hex')
  }

  /**
   * Get cached validation result
   * @param {string} key - Cache key
   * @returns {Object|null} Cached result or null if not found/expired
   */
  get(key) {
    if (!this.enabled) {
      return null
    }

    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`)

      if (!fs.existsSync(cacheFile)) {
        return null // Cache miss
      }

      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
      const now = Date.now()

      // Check if cache is expired
      if (now - cached.timestamp > this.ttl) {
        // Remove expired cache file

        fs.unlinkSync(cacheFile)
        return null
      }

      return cached.result
    } catch {
      // If cache file is corrupted or unreadable, treat as cache miss
      return null
    }
  }

  /**
   * Store validation result in cache
   * @param {string} key - Cache key
   * @param {Object} result - Validation result to cache
   */
  set(key, result) {
    if (!this.enabled) {
      return
    }

    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`)
      const cached = {
        timestamp: Date.now(),
        result,
      }

      fs.writeFileSync(cacheFile, JSON.stringify(cached, null, 2), 'utf8')
    } catch (error) {
      // Silently fail if cache write fails (don't break validation)
      // Log error if verbose mode is enabled
      if (this.verbose) {
        console.warn(`Cache write failed: ${error.message}`)
      }
    }
  }

  /**
   * Clear all cached results
   */
  clear() {
    if (!this.enabled) {
      return
    }

    try {
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir)
        files.forEach(file => {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(this.cacheDir, file))
          }
        })
      }
    } catch (error) {
      // Silently fail if cache clear fails
      if (this.verbose) {
        console.warn(`Cache clear failed: ${error.message}`)
      }
    }
  }

  /**
   * Check if cache is enabled
   * @returns {boolean} True if cache is enabled
   */
  isEnabled() {
    return this.enabled
  }
}

module.exports = CacheManager
