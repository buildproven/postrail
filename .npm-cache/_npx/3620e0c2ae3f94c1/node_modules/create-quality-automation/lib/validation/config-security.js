'use strict'

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const https = require('https')
const { execSync } = require('child_process')
const { showProgress } = require('../ui-helpers')

// Pinned gitleaks version for reproducible security scanning
const GITLEAKS_VERSION = '8.28.0'
// Real SHA256 checksums from https://github.com/gitleaks/gitleaks/releases/tag/v8.28.0
const GITLEAKS_CHECKSUMS = {
  'linux-x64':
    'a65b5253807a68ac0cafa4414031fd740aeb55f54fb7e55f386acb52e6a840eb',
  'darwin-x64':
    'edf5a507008b0d2ef4959575772772770586409c1f6f74dabf19cbe7ec341ced',
  'darwin-arm64':
    '5588b5d942dffa048720f7e6e1d274283219fb5722a2c7564d22e83ba39087d7',
  'win32-x64':
    'da6458e8864af553807de1c46a7a8eac0880bd6b99ba56288e87e86a45af884f',
}

/**
 * Configuration Security Scanner
 * Uses mature security tools instead of custom regex heuristics
 */
class ConfigSecurityScanner {
  constructor(options = {}) {
    this.issues = []
    this.options = options

    // checksumMap dependency injection - FOR TESTING ONLY
    // WARNING: Do not use in production CLI - this bypasses security verification!
    if (options.checksumMap) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'checksumMap override not allowed in production environment'
        )
      }
      console.warn('⚠️ WARNING: Using custom checksum map - FOR TESTING ONLY!')
      this.checksumMap = options.checksumMap
    } else {
      this.checksumMap = GITLEAKS_CHECKSUMS
    }
  }

  /**
   * Resolve gitleaks binary with fallback chain for reproducible security
   * 1. Process.env.GITLEAKS_PATH (user override)
   * 2. Global gitleaks binary (brew, choco, etc.)
   * 3. Cached pinned version in ~/.cache/create-quality-automation/
   * 4. npx fallback with loud warning
   */
  async resolveGitleaksBinary() {
    // 1. Check environment override
    if (process.env.GITLEAKS_PATH) {
      if (fs.existsSync(process.env.GITLEAKS_PATH)) {
        return process.env.GITLEAKS_PATH
      }
      console.warn(
        `⚠️ GITLEAKS_PATH set but binary not found: ${process.env.GITLEAKS_PATH}`
      )
    }

    // 2. Check global installation
    try {
      const globalPath = execSync('which gitleaks', {
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim()
      if (globalPath && fs.existsSync(globalPath)) {
        return globalPath
      }
    } catch {
      // which command failed, global binary not available
    }

    // 3. Use cached pinned version or download if missing
    const cacheDir = path.join(
      os.homedir(),
      '.cache',
      'create-quality-automation'
    )
    const binaryName =
      process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'
    const cachedBinary = path.join(
      cacheDir,
      'gitleaks',
      GITLEAKS_VERSION,
      binaryName
    )

    if (fs.existsSync(cachedBinary)) {
      // Verify cached binary integrity
      if (await this.verifyBinaryChecksum(cachedBinary)) {
        return cachedBinary
      } else {
        console.warn(
          '⚠️ Cached gitleaks binary failed checksum verification, re-downloading...'
        )
        fs.rmSync(path.dirname(cachedBinary), { recursive: true, force: true })
      }
    }

    // Download and cache pinned version
    try {
      await this.downloadGitleaksBinary(cachedBinary)
      return cachedBinary
    } catch (error) {
      console.error(
        `❌ Failed to download gitleaks v${GITLEAKS_VERSION}: ${error.message}`
      )

      // Check if fallback to unpinned gitleaks is explicitly allowed
      if (this.options.allowLatestGitleaks) {
        console.warn(
          '🚨 WARNING: Using npx gitleaks (supply chain risk - downloads latest version)'
        )
        console.warn(
          '📌 Consider: brew install gitleaks (macOS) or choco install gitleaks (Windows)'
        )
        return 'npx gitleaks'
      }

      // Security-first: fail hard instead of silent fallback
      throw new Error(
        `Cannot resolve secure gitleaks binary. Options:\n` +
          `1. Install globally: brew install gitleaks (macOS) or choco install gitleaks (Windows)\n` +
          `2. Set GITLEAKS_PATH to your preferred binary\n` +
          `3. Use --allow-latest-gitleaks flag (NOT RECOMMENDED - supply chain risk)`
      )
    }
  }

  /**
   * Download and verify gitleaks binary for current platform
   */
  async downloadGitleaksBinary(targetPath) {
    const platform = this.detectPlatform()
    if (!platform) {
      throw new Error(
        `Unsupported platform: ${process.platform}-${process.arch}`
      )
    }

    const tarballName = `gitleaks_${GITLEAKS_VERSION}_${platform}.tar.gz`
    const downloadUrl = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${tarballName}`

    console.log(
      `📥 Downloading gitleaks v${GITLEAKS_VERSION} for ${platform}...`
    )

    // Ensure cache directory exists
    const cacheDir = path.dirname(targetPath)
    fs.mkdirSync(cacheDir, { recursive: true })

    // Download and extract
    const tarballPath = path.join(cacheDir, tarballName)
    await this.downloadFile(downloadUrl, tarballPath)

    // Extract binary (tar.gz contains just the gitleaks executable)
    const tar = require('tar')
    await tar.extract({
      file: tarballPath,
      cwd: cacheDir,
    })

    // Move extracted binary to final location and make executable
    const extractedBinary = path.join(
      cacheDir,
      process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'
    )
    fs.renameSync(extractedBinary, targetPath)
    if (process.platform !== 'win32') {
      fs.chmodSync(targetPath, 0o755)
    }

    // Verify checksum
    if (!(await this.verifyBinaryChecksum(targetPath))) {
      fs.rmSync(targetPath, { force: true })
      throw new Error('Downloaded binary failed checksum verification')
    }

    // Cleanup tarball
    fs.rmSync(tarballPath, { force: true })

    console.log(`✅ gitleaks v${GITLEAKS_VERSION} cached and verified`)
  }

  /**
   * Detect current platform for gitleaks release naming
   */
  detectPlatform() {
    const platforms = {
      'darwin-x64': 'darwin_x64',
      'darwin-arm64': 'darwin_arm64',
      'linux-x64': 'linux_x64',
      'win32-x64': 'windows_x64',
    }

    const key = `${process.platform}-${process.arch}`
    return platforms[key] || null
  }

  /**
   * Download file from URL to target path
   */
  downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(targetPath)

      https
        .get(url, response => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Follow redirect
            return this.downloadFile(response.headers.location, targetPath)
              .then(resolve)
              .catch(reject)
          }

          if (response.statusCode !== 200) {
            reject(
              new Error(
                `HTTP ${response.statusCode}: ${response.statusMessage}`
              )
            )
            return
          }

          response.pipe(file)

          file.on('finish', () => {
            file.close()
            resolve()
          })

          file.on('error', err => {
            fs.unlink(targetPath, () => {}) // Delete partial file
            reject(err)
          })
        })
        .on('error', reject)
    })
  }

  /**
   * Verify binary checksum against known good hash
   * CRITICAL SECURITY: Fails hard on missing checksums - no silent bypass
   */
  async verifyBinaryChecksum(binaryPath) {
    const platformKey = `${process.platform}-${process.arch}`
    const expectedChecksum = this.checksumMap[platformKey]

    if (!expectedChecksum) {
      throw new Error(
        `No checksum available for platform ${platformKey} - refusing to execute unverified binary`
      )
    }

    try {
      const binaryData = fs.readFileSync(binaryPath)
      const actualChecksum = crypto
        .createHash('sha256')
        .update(binaryData)
        .digest('hex')

      if (actualChecksum !== expectedChecksum) {
        throw new Error(
          `Checksum mismatch for ${binaryPath}: expected ${expectedChecksum}, got ${actualChecksum}`
        )
      }

      return true
    } catch (error) {
      if (
        error.message.includes('Checksum mismatch') ||
        error.message.includes('No checksum available')
      ) {
        throw error // Re-throw security-critical errors
      }
      throw new Error(`Checksum verification failed: ${error.message}`)
    }
  }

  /**
   * Scan all configuration files for security issues
   */
  async scanAll() {
    console.log('🔍 Running security scans with mature tools...')

    this.issues = []

    if (!this.options.disableNpmAudit) {
      await this.runNpmAudit()
    }

    if (!this.options.disableEslintSecurity) {
      await this.runESLintSecurity()
    }

    if (!this.options.disableGitleaks) {
      await this.runGitleaks()
    }

    await this.scanClientSideSecrets()
    await this.scanDockerSecrets()
    await this.scanEnvironmentFiles()
    await this.checkGitignore()

    if (this.issues.length > 0) {
      console.error(`❌ Found ${this.issues.length} security issue(s):`)
      this.issues.forEach(issue => console.error(`   ${issue}`))
      throw new Error('Security violations detected')
    }

    console.log('✅ Security checks passed')
    return { issues: this.issues, passed: this.issues.length === 0 }
  }

  /**
   * Run package manager audit for dependency vulnerabilities
   * Only checks production dependencies (dev vulnerabilities are acceptable)
   */
  async runNpmAudit() {
    if (!fs.existsSync('package.json')) return

    const spinner = showProgress(
      'Running npm audit for dependency vulnerabilities...'
    )

    // Detect package manager
    const {
      detectPackageManager,
      getAuditCommand,
    } = require('../package-utils')
    const packageManager = detectPackageManager(process.cwd())
    const baseAuditCmd = getAuditCommand(packageManager)

    try {
      // Run audit and capture high/critical vulnerabilities
      // Use --omit=dev to only check production dependencies
      const auditCmd = `${baseAuditCmd} --audit-level high --omit=dev --json`
      execSync(auditCmd, {
        stdio: 'pipe',
        timeout: 60000, // 60 second timeout for audit operations
        encoding: 'utf8',
      })
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        // Timeout occurred
        this.issues.push(
          `${packageManager} audit: Scan timed out after 60 seconds. Check for network issues or consider running audit manually.`
        )
        return
      }
      // Audit exits with code 1 when vulnerabilities are found
      if (error.stdout) {
        try {
          const auditResult = JSON.parse(error.stdout.toString())
          if (auditResult.metadata && auditResult.metadata.vulnerabilities) {
            const vulns = auditResult.metadata.vulnerabilities
            const total = vulns.high + vulns.critical + vulns.moderate
            if (total > 0) {
              spinner.fail(`npm audit found ${total} vulnerabilities`)
              this.issues.push(
                `${packageManager} audit: ${total} vulnerabilities found (${vulns.high} high, ${vulns.critical} critical). Run '${packageManager} audit fix' to resolve.`
              )
            } else {
              spinner.succeed(
                'npm audit completed - no high/critical vulnerabilities'
              )
            }
          } else {
            spinner.succeed('npm audit completed')
          }
        } catch {
          spinner.warn(`Could not parse ${packageManager} audit output`)
          console.warn(`Could not parse ${packageManager} audit output`)
        }
      } else {
        spinner.succeed('npm audit completed')
      }
    }
  }

  /**
   * Run gitleaks for comprehensive secret scanning with timeout and redaction
   * Uses pinned binary for reproducible security scanning
   */
  async runGitleaks() {
    const spinner = showProgress('Scanning for secrets with gitleaks...')

    try {
      // Resolve gitleaks binary with security-focused fallback chain
      const gitleaksBinary = await this.resolveGitleaksBinary()

      // Build command - handle npx vs direct binary execution
      const isNpxCommand = gitleaksBinary.startsWith('npx ')
      const command = isNpxCommand
        ? `${gitleaksBinary} detect --source . --redact`
        : `"${gitleaksBinary}" detect --source . --redact`

      // Run gitleaks with --redact to prevent secret exposure and timeout for safety
      execSync(command, {
        stdio: 'pipe',
        timeout: 30000, // 30 second timeout to prevent hangs
        encoding: 'utf8',
      })
      spinner.succeed('gitleaks scan completed - no secrets detected')
    } catch (error) {
      if (error.signal === 'SIGTERM') {
        // Timeout occurred
        this.issues.push(
          'gitleaks: Scan timed out after 30 seconds. Repository may be too large for comprehensive scanning.'
        )
        return
      }

      if (error.status === 1) {
        // Gitleaks found secrets (exit code 1)
        const output = error.stdout
          ? error.stdout.toString()
          : error.stderr
            ? error.stderr.toString()
            : ''
        if (output.includes('leaks found') || output.includes('Finding:')) {
          // Extract just the count, not the actual findings
          const leakMatches = output.match(/(\d+)\s+leaks?\s+found/i)
          const leakCount = leakMatches ? leakMatches[1] : 'some'
          spinner.fail('gitleaks found potential secrets')
          this.issues.push(
            `gitleaks: ${leakCount} potential secret(s) detected in repository. Run gitleaks with --redact for details.`
          )
        } else {
          spinner.succeed('gitleaks scan completed')
        }
      } else {
        // Other errors (missing binary, permission issues, etc.)
        const stderr = error.stderr ? error.stderr.toString() : ''
        const stdout = error.stdout ? error.stdout.toString() : ''
        const output = stderr || stdout || error.message

        if (
          output.includes('not found') ||
          output.includes('command not found') ||
          output.includes('ENOENT') ||
          error?.code === 'ENOENT'
        ) {
          // Missing gitleaks should block security validation, not silently pass
          spinner.fail('gitleaks tool not found')
          this.issues.push(
            `gitleaks: Tool not found. Install gitleaks v${GITLEAKS_VERSION}+ for comprehensive secret scanning or use --no-gitleaks to skip.`
          )
        } else {
          // Log the actual error so users know gitleaks failed to run (redact any potential sensitive info)
          const sanitizedError = output
            .split('\n')[0]
            .replace(/[A-Za-z0-9+/=]{20,}/g, '[REDACTED]')
          spinner.fail('gitleaks failed to run')
          console.warn(`⚠️ gitleaks failed to run: ${sanitizedError}`)
          this.issues.push(
            `gitleaks: Failed to run - ${sanitizedError}. Install gitleaks for secret scanning.`
          )
        }
      }
    }
  }

  /**
   * Run ESLint with security rules using programmatic API
   */
  async runESLintSecurity() {
    // Detect which ESLint config file exists (check all variants)
    let eslintConfigPath = null
    const configVariants = [
      'eslint.config.cjs',
      'eslint.config.js',
      'eslint.config.mjs',
      'eslint.config.ts.cjs', // TypeScript projects
    ]

    for (const configFile of configVariants) {
      if (fs.existsSync(configFile)) {
        eslintConfigPath = path.resolve(configFile)
        break
      }
    }

    if (!eslintConfigPath) {
      return // No ESLint config found
    }

    const spinner = showProgress('Running ESLint security checks...')

    try {
      // Try to load ESLint programmatically
      const { ESLint } = require('eslint')

      // Create ESLint instance with detected config
      const eslint = new ESLint({
        overrideConfigFile: eslintConfigPath,
      })

      // Lint files in current directory
      const results = await eslint.lintFiles(['.'])

      // Filter for security plugin violations
      const securityIssues = []
      for (const result of results) {
        for (const message of result.messages) {
          if (message.ruleId && message.ruleId.startsWith('security/')) {
            securityIssues.push({
              file: result.filePath,
              line: message.line,
              column: message.column,
              rule: message.ruleId,
              message: message.message,
              severity: message.severity,
            })
          }
        }
      }

      // Report security issues
      if (securityIssues.length > 0) {
        spinner.fail(`ESLint security found ${securityIssues.length} issue(s)`)
        securityIssues.forEach(issue => {
          const relativePath = path.relative(process.cwd(), issue.file)
          this.issues.push(
            `ESLint Security: ${relativePath}:${issue.line}:${issue.column} - ${issue.message} (${issue.rule})`
          )
        })
      } else {
        spinner.succeed('ESLint security checks passed')
      }
    } catch (error) {
      // Check if ESLint is not installed
      if (
        error?.code === 'MODULE_NOT_FOUND' ||
        error?.message?.includes('Cannot find module')
      ) {
        spinner.fail('ESLint not found')
        this.issues.push(
          'ESLint Security: ESLint is not installed or cannot be loaded. ' +
            'Install eslint and eslint-plugin-security to enable security validation, or use --no-eslint-security to skip.'
        )
        return
      }

      // Check if config file has syntax errors
      if (error.name === 'SyntaxError' || error.message.includes('parse')) {
        spinner.fail('ESLint configuration error')
        this.issues.push(
          `ESLint Security: ESLint configuration file has errors: ${error.message}. ` +
            'Fix the configuration or use --no-eslint-security to skip.'
        )
        return
      }

      // Other ESLint errors
      spinner.fail('ESLint security check failed')
      this.issues.push(
        `ESLint Security: ESLint failed with error: ${error.message}. ` +
          'Review the error and fix the issue, or use --no-eslint-security to skip.'
      )
    }
  }

  /**
   * Scan for client-side secret exposure in Next.js and Vite
   */
  async scanClientSideSecrets() {
    await this.scanNextjsConfig()
    await this.scanViteConfig()
  }

  /**
   * Scan Next.js configuration for client-side secret exposure
   */
  async scanNextjsConfig() {
    const configFiles = ['next.config.js', 'next.config.mjs', 'next.config.ts']

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        const content = fs.readFileSync(configFile, 'utf8')

        // Check for secrets in env block (client-side exposure risk)
        const envBlockRegex = /env:\s*\{([^}]+)\}/gi
        let match

        while ((match = envBlockRegex.exec(content)) !== null) {
          const envBlock = match[1]

          const secretPatterns = [
            { pattern: /\b\w*SECRET\w*\b/gi, type: 'SECRET' },
            { pattern: /\b\w*PASSWORD\w*\b/gi, type: 'PASSWORD' },
            { pattern: /\b\w*PRIVATE\w*\b/gi, type: 'PRIVATE' },
            { pattern: /\b\w*API_KEY\w*\b/gi, type: 'API_KEY' },
            { pattern: /\b\w*_KEY\b/gi, type: 'KEY' },
            { pattern: /\b\w*TOKEN\w*\b/gi, type: 'TOKEN' },
            { pattern: /\b\w*WEBHOOK\w*\b/gi, type: 'WEBHOOK' },
          ]

          for (const { pattern, type } of secretPatterns) {
            if (pattern.test(envBlock)) {
              this.issues.push(
                `${configFile}: Potential ${type} exposure in env block. ` +
                  `Variables in 'env' are sent to client bundle. ` +
                  `Use process.env.${type} server-side instead.`
              )
            }
          }
        }
      }
    }
  }

  /**
   * Scan Vite configuration for client-side secret exposure
   */
  async scanViteConfig() {
    const configFiles = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        const content = fs.readFileSync(configFile, 'utf8')

        // VITE_ prefixed variables are automatically exposed to client
        const viteSecretPattern =
          /VITE_[^=]*(?:SECRET|PASSWORD|PRIVATE|KEY|TOKEN)/gi
        const matches = content.match(viteSecretPattern)

        if (matches && matches.length > 0) {
          this.issues.push(
            `${configFile}: VITE_ prefixed secrets detected: ${matches.join(', ')}. ` +
              `All VITE_ variables are exposed to client bundle!`
          )
        }
      }
    }
  }

  /**
   * Scan Dockerfile for hardcoded secrets
   */
  async scanDockerSecrets() {
    if (fs.existsSync('Dockerfile')) {
      const content = fs.readFileSync('Dockerfile', 'utf8')

      // Check for hardcoded secrets in ENV statements
      const envStatements = content.match(/^ENV\s+.+$/gim) || []

      for (const envStatement of envStatements) {
        const secretPattern =
          /(?:SECRET|PASSWORD|KEY|TOKEN)\s*=\s*["']?[^"\s']+/gi
        if (secretPattern.test(envStatement)) {
          this.issues.push(
            `Dockerfile: Hardcoded secret in ENV statement: ${envStatement.trim()}`
          )
        }
      }
    }
  }

  /**
   * Check .gitignore for security-sensitive files
   */
  async checkGitignore() {
    if (!fs.existsSync('.gitignore')) {
      this.issues.push(
        'No .gitignore found. Create one to prevent committing sensitive files.'
      )
      return
    }

    const gitignore = fs.readFileSync('.gitignore', 'utf8')
    const requiredIgnores = ['.env*', 'node_modules', '*.log']

    for (const pattern of requiredIgnores) {
      if (!gitignore.includes(pattern)) {
        this.issues.push(`Missing '${pattern}' in .gitignore`)
      }
    }
  }

  /**
   * Scan environment files for common issues
   */
  async scanEnvironmentFiles() {
    // Check that .env files are properly ignored
    const envFiles = [
      '.env',
      '.env.local',
      '.env.production',
      '.env.development',
    ]

    const existingEnvFiles = envFiles.filter(file => fs.existsSync(file))

    if (existingEnvFiles.length > 0) {
      if (!fs.existsSync('.gitignore')) {
        this.issues.push('Environment files found but no .gitignore exists')
      } else {
        const gitignore = fs.readFileSync('.gitignore', 'utf8')
        for (const envFile of existingEnvFiles) {
          if (!gitignore.includes(envFile) && !gitignore.includes('.env*')) {
            this.issues.push(
              `${envFile} exists but not in .gitignore. Add it to prevent secret exposure.`
            )
          }
        }
      }
    }

    // Check for .env.example without corresponding documentation
    if (fs.existsSync('.env.example') && !fs.existsSync('README.md')) {
      this.issues.push(
        '.env.example exists but no README.md to document required variables'
      )
    }
  }
}

module.exports = { ConfigSecurityScanner }
