#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const {
  mergeScripts,
  mergeDevDependencies,
  mergeLintStaged,
} = require('./lib/package-utils')
const { showProgress } = require('./lib/ui-helpers')
const {
  NODE_VERSION,
  SCAN_LIMITS,
  EXCLUDE_DIRECTORIES,
} = require('./config/constants')

/**
 * Check Node version and lazily load @npmcli/package-json
 * This prevents import errors on older Node versions for basic commands like --help
 */
function checkNodeVersionAndLoadPackageJson() {
  const nodeVersion = process.version
  const majorVersion = parseInt(nodeVersion.split('.')[0].slice(1))

  if (majorVersion < NODE_VERSION.MIN_MAJOR) {
    console.error(
      `❌ Node.js ${nodeVersion} is not supported. This tool requires Node.js ${NODE_VERSION.MIN_MAJOR} or higher.`
    )
    console.log('Please upgrade Node.js and try again.')
    console.log('Visit https://nodejs.org/ to download the latest version.')
    process.exit(1)
  }

  try {
    return require('@npmcli/package-json')
  } catch (error) {
    console.error(`❌ Failed to load package.json utilities: ${error.message}`)
    console.log('This tool requires Node.js 20+ with modern module support.')
    process.exit(1)
  }
}

const {
  STYLELINT_EXTENSIONS,
  getDefaultDevDependencies,
  getDefaultLintStaged,
  getDefaultScripts,
} = require('./config/defaults')

// Enhanced validation capabilities
const { ValidationRunner } = require('./lib/validation')
const { validateQualityConfig } = require('./lib/config-validator')

// Interactive mode capabilities
const { InteractivePrompt } = require('./lib/interactive/prompt')
const { runInteractiveFlow } = require('./lib/interactive/questions')

// Basic dependency monitoring (Free Tier)
const {
  hasNpmProject,
  generateBasicDependabotConfig,
  writeBasicDependabotConfig,
} = require('./lib/dependency-monitoring-basic')

// Premium dependency monitoring (Pro/Enterprise Tiers)
const {
  generatePremiumDependabotConfig,
  writePremiumDependabotConfig,
} = require('./lib/dependency-monitoring-premium')

// Custom template loading
const { TemplateLoader } = require('./lib/template-loader')

// Licensing system
const {
  getLicenseInfo,
  showUpgradeMessage,
  showLicenseStatus,
} = require('./lib/licensing')

// Telemetry (opt-in usage tracking)
const { TelemetrySession, showTelemetryStatus } = require('./lib/telemetry')

// Error reporting (opt-in crash analytics)
const {
  ErrorReporter,
  showErrorReportingStatus,
} = require('./lib/error-reporter')

const STYLELINT_EXTENSION_SET = new Set(STYLELINT_EXTENSIONS)
const STYLELINT_DEFAULT_TARGET = `**/*.{${STYLELINT_EXTENSIONS.join(',')}}`
const STYLELINT_EXTENSION_GLOB = `*.{${STYLELINT_EXTENSIONS.join(',')}}`
const STYLELINT_SCAN_EXCLUDES = new Set(EXCLUDE_DIRECTORIES.STYLELINT)
const MAX_STYLELINT_SCAN_DEPTH = SCAN_LIMITS.STYLELINT_MAX_DEPTH

/**
 * Safely reads directory contents without throwing on permission errors
 *
 * Wraps fs.readdirSync with error handling to prevent crashes when
 * encountering permission denied errors or non-existent directories.
 *
 * @param {string} dir - Directory path to read
 * @returns {fs.Dirent[]} Array of directory entries, empty array on error
 *
 * @example
 * const entries = safeReadDir('./src')
 * // Returns: [Dirent { name: 'index.js', ... }, ...]
 * // On error: []
 */
const safeReadDir = dir => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Checks if a filename has a Stylelint-supported extension
 *
 * Validates whether a file should be linted by Stylelint based on
 * its extension. Supports: css, scss, sass, less, pcss
 *
 * @param {string} fileName - Name of the file to check (e.g., 'styles.css')
 * @returns {boolean} True if file has a supported CSS extension
 *
 * @example
 * isStylelintFile('styles.css')     // true
 * isStylelintFile('index.js')       // false
 * isStylelintFile('theme.scss')     // true
 */
const isStylelintFile = fileName => {
  const ext = path.extname(fileName).slice(1).toLowerCase()
  return STYLELINT_EXTENSION_SET.has(ext)
}

const directoryContainsStylelintFiles = (dir, depth = 0) => {
  if (depth > MAX_STYLELINT_SCAN_DEPTH) {
    return false
  }

  const entries = safeReadDir(dir)
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue
    }

    const entryPath = path.join(dir, entry.name)

    if (entry.isFile() && isStylelintFile(entry.name)) {
      return true
    }

    if (entry.isDirectory()) {
      if (STYLELINT_SCAN_EXCLUDES.has(entry.name)) {
        continue
      }
      if (directoryContainsStylelintFiles(entryPath, depth + 1)) {
        return true
      }
    }
  }

  return false
}

/**
 * Intelligently discovers Stylelint target directories in a project
 *
 * Scans the root directory to find which subdirectories contain CSS/SCSS files
 * and generates optimized glob patterns for Stylelint. Avoids scanning excluded
 * directories like node_modules and skips symbolic links for safety.
 *
 * Algorithm:
 * 1. Scan root directory for CSS files and relevant subdirectories
 * 2. Skip excluded dirs (node_modules, .git, etc.) and symlinks
 * 3. Recursively check subdirs up to MAX_STYLELINT_SCAN_DEPTH
 * 4. Generate specific globs for dirs with CSS files
 * 5. Fall back to default glob if no CSS files found
 *
 * @param {string} rootDir - Root directory to scan
 * @returns {string[]} Array of glob patterns for Stylelint targets
 *
 * @example
 * findStylelintTargets('/project')
 * // Project has CSS in root and src/:
 * // ['**\/*.{css,scss,sass,less,pcss}', 'src/**\/*.{css,scss,sass,less,pcss}']
 *
 * @example
 * findStylelintTargets('/empty-project')
 * // No CSS files found:
 * // ['**\/*.{css,scss,sass,less,pcss}'] (default fallback)
 */
const findStylelintTargets = rootDir => {
  const entries = safeReadDir(rootDir)
  const targets = new Set()
  let hasRootCss = false

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue
    }

    const entryPath = path.join(rootDir, entry.name)

    if (entry.isFile()) {
      if (isStylelintFile(entry.name)) {
        hasRootCss = true
      }
      continue
    }

    if (!entry.isDirectory()) {
      continue
    }

    if (STYLELINT_SCAN_EXCLUDES.has(entry.name)) {
      continue
    }

    if (directoryContainsStylelintFiles(entryPath)) {
      targets.add(entry.name)
    }
  }

  const resolvedTargets = []

  if (hasRootCss) {
    resolvedTargets.push(STYLELINT_EXTENSION_GLOB)
  }

  Array.from(targets)
    .sort()
    .forEach(dir => {
      resolvedTargets.push(`${dir}/**/${STYLELINT_EXTENSION_GLOB}`)
    })

  if (!resolvedTargets.length) {
    return [STYLELINT_DEFAULT_TARGET]
  }

  return resolvedTargets
}

const patternIncludesStylelintExtension = pattern => {
  const lower = pattern.toLowerCase()
  return STYLELINT_EXTENSIONS.some(ext => lower.includes(`.${ext}`))
}

// Input validation and sanitization functions from WFHroulette patterns
const validateAndSanitizeInput = input => {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string')
  }
  // Normalize and trim input
  const normalized = input.trim()
  if (normalized.length === 0) {
    return null
  }
  // Basic sanitization - remove potentially dangerous characters
  const sanitized = normalized.replace(/[<>'"&]/g, '')
  return sanitized
}

/**
 * Parse CLI arguments and return configuration object
 * @param {string[]} rawArgs - Raw command line arguments
 * @returns {Object} Parsed configuration
 */
function parseArguments(rawArgs) {
  const sanitizedArgs = rawArgs
    .map(arg => validateAndSanitizeInput(arg))
    .filter(Boolean)

  // Interactive mode detection - to be handled at execution time
  const isInteractiveRequested = sanitizedArgs.includes('--interactive')

  const isUpdateMode = sanitizedArgs.includes('--update')
  const isValidationMode = sanitizedArgs.includes('--validate')
  const isConfigSecurityMode = sanitizedArgs.includes('--security-config')
  const isDocsValidationMode = sanitizedArgs.includes('--validate-docs')
  const isComprehensiveMode = sanitizedArgs.includes('--comprehensive')
  const isDependencyMonitoringMode =
    sanitizedArgs.includes('--deps') ||
    sanitizedArgs.includes('--dependency-monitoring')
  const isLicenseStatusMode = sanitizedArgs.includes('--license-status')
  const isTelemetryStatusMode = sanitizedArgs.includes('--telemetry-status')
  const isErrorReportingStatusMode = sanitizedArgs.includes(
    '--error-reporting-status'
  )
  const isCheckMaturityMode = sanitizedArgs.includes('--check-maturity')
  const isValidateConfigMode = sanitizedArgs.includes('--validate-config')
  const isDryRun = sanitizedArgs.includes('--dry-run')

  // Custom template directory - use raw args to preserve valid path characters (&, <, >, etc.)
  // Normalize path to prevent traversal attacks and make absolute
  const templateFlagIndex = sanitizedArgs.findIndex(arg => arg === '--template')
  const customTemplatePath =
    templateFlagIndex !== -1 && rawArgs[templateFlagIndex + 1]
      ? path.resolve(rawArgs[templateFlagIndex + 1])
      : null

  // Granular tool disable options
  const disableNpmAudit = sanitizedArgs.includes('--no-npm-audit')
  const disableGitleaks = sanitizedArgs.includes('--no-gitleaks')
  const disableActionlint = sanitizedArgs.includes('--no-actionlint')
  const disableMarkdownlint = sanitizedArgs.includes('--no-markdownlint')
  const disableEslintSecurity = sanitizedArgs.includes('--no-eslint-security')

  return {
    sanitizedArgs,
    isInteractiveRequested,
    isUpdateMode,
    isValidationMode,
    isConfigSecurityMode,
    isDocsValidationMode,
    isComprehensiveMode,
    isDependencyMonitoringMode,
    isLicenseStatusMode,
    isTelemetryStatusMode,
    isErrorReportingStatusMode,
    isCheckMaturityMode,
    isValidateConfigMode,
    isDryRun,
    customTemplatePath,
    disableNpmAudit,
    disableGitleaks,
    disableActionlint,
    disableMarkdownlint,
    disableEslintSecurity,
  }
}

/**
 * Main entry point - wraps everything in async context for interactive mode
 */
;(async function main() {
  // Initial argument parsing
  const args = process.argv.slice(2)
  let parsedConfig = parseArguments(args)

  // Destructure for backward compatibility
  let {
    sanitizedArgs,
    isInteractiveRequested,
    isUpdateMode,
    isValidationMode,
    isConfigSecurityMode,
    isDocsValidationMode,
    isComprehensiveMode,
    isDependencyMonitoringMode,
    isLicenseStatusMode,
    isTelemetryStatusMode,
    isErrorReportingStatusMode,
    isCheckMaturityMode,
    isValidateConfigMode,
    isDryRun,
    customTemplatePath,
    disableNpmAudit,
    disableGitleaks,
    disableActionlint,
    disableMarkdownlint,
    disableEslintSecurity,
  } = parsedConfig

  // Initialize telemetry session (opt-in only, fails silently)
  const telemetry = new TelemetrySession()

  // Handle interactive mode FIRST (before any routing)
  // This must happen before help/dry-run/routing to ensure interactive selections drive behavior
  if (isInteractiveRequested) {
    const prompt = new InteractivePrompt()

    // Check TTY availability
    if (!prompt.isTTY()) {
      console.error(
        '❌ Interactive mode requires a TTY environment (interactive terminal).'
      )
      console.error(
        '   For non-interactive use, please specify flags directly.'
      )
      console.error('   Run with --help to see available options.\n')
      process.exit(1)
    }

    // Run interactive flow
    let interactiveFlags
    try {
      interactiveFlags = await runInteractiveFlow(prompt)
      console.log(
        `\n🚀 Running setup with options: ${interactiveFlags.join(' ')}\n`
      )
    } catch (error) {
      if (error.message.includes('cancelled')) {
        console.log('\n❌ Interactive mode cancelled\n')
        process.exit(0)
      }
      console.error(`❌ Interactive mode error: ${error.message}\n`)
      process.exit(1)
    }

    // Merge interactive flags with original command-line args
    // Remove --interactive flag, keep all other original flags (like --template)
    const originalFlags = args.filter(arg => arg !== '--interactive')
    const mergedFlags = [...originalFlags, ...interactiveFlags]

    // Re-parse with merged flags
    parsedConfig = parseArguments(mergedFlags)

    // Update all configuration variables
    ;({
      sanitizedArgs,
      isInteractiveRequested, // Will be false after re-parse since we filtered it out
      isUpdateMode,
      isValidationMode,
      isConfigSecurityMode,
      isDocsValidationMode,
      isComprehensiveMode,
      isDependencyMonitoringMode,
      isLicenseStatusMode,
      isTelemetryStatusMode,
      isErrorReportingStatusMode,
      isCheckMaturityMode,
      isDryRun,
      customTemplatePath,
      disableNpmAudit,
      disableGitleaks,
      disableActionlint,
      disableMarkdownlint,
      disableEslintSecurity,
    } = parsedConfig)

    console.log('📋 Configuration after interactive selections applied\n')
  }

  // Show telemetry status if requested
  if (isTelemetryStatusMode) {
    showTelemetryStatus()
    process.exit(0)
  }

  // Show error reporting status if requested
  if (isErrorReportingStatusMode) {
    showErrorReportingStatus()
    process.exit(0)
  }

  // Show help if requested
  if (sanitizedArgs.includes('--help') || sanitizedArgs.includes('-h')) {
    console.log(`
🚀 Create Quality Automation Setup

Usage: npx create-quality-automation@latest [options]

SETUP OPTIONS:
  (no args)         Run complete quality automation setup
  --interactive     Interactive mode with guided configuration prompts
  --update          Update existing configuration
  --deps            Add basic dependency monitoring (Free Tier)
  --dependency-monitoring  Same as --deps
  --template <path> Use custom templates from specified directory
  --dry-run         Preview changes without modifying files

VALIDATION OPTIONS:
  --validate        Run comprehensive validation (same as --comprehensive)
  --comprehensive   Run all validation checks
  --security-config Run configuration security checks only
  --validate-docs   Run documentation validation only
  --validate-config Validate .qualityrc.json configuration file
  --check-maturity  Detect and display project maturity level

LICENSE, TELEMETRY & ERROR REPORTING:
  --license-status          Show current license tier and available features
  --telemetry-status        Show telemetry status and opt-in instructions
  --error-reporting-status  Show error reporting status and privacy information

GRANULAR TOOL CONTROL:
  --no-npm-audit         Disable npm audit dependency vulnerability checks
  --no-gitleaks          Disable gitleaks secret scanning
  --allow-latest-gitleaks  Allow unpinned latest gitleaks (NOT RECOMMENDED - supply chain risk)
  --no-actionlint        Disable actionlint GitHub Actions workflow validation
  --no-markdownlint      Disable markdownlint markdown formatting checks
  --no-eslint-security   Disable ESLint security rule checking

EXAMPLES:
  npx create-quality-automation@latest
    → Set up quality automation with all tools

  npx create-quality-automation@latest --deps
    → Add basic dependency monitoring (Dependabot config + weekly updates + GitHub Actions)

  npx create-quality-automation@latest --license-status
    → Show current license tier and upgrade options

  npx create-quality-automation@latest --telemetry-status
    → Show telemetry status and privacy information

  npx create-quality-automation@latest --error-reporting-status
    → Show error reporting status and crash analytics information

  npx create-quality-automation@latest --check-maturity
    → Detect project maturity level (minimal, bootstrap, development, production-ready)

  npx create-quality-automation@latest --validate-config
    → Validate .qualityrc.json configuration file against JSON Schema

  npx create-quality-automation@latest --comprehensive --no-gitleaks
    → Run validation but skip gitleaks secret scanning

  npx create-quality-automation@latest --security-config --allow-latest-gitleaks
    → Run security checks with unpinned gitleaks (NOT RECOMMENDED - supply chain risk)

  npx create-quality-automation@latest --security-config --no-npm-audit
    → Run security checks but skip npm audit

  npx create-quality-automation@latest --dry-run
    → Preview what files and configurations would be created/modified

PRIVACY & TELEMETRY:
  Telemetry and error reporting are OPT-IN only (disabled by default). To enable:
    export CQA_TELEMETRY=true           # Usage tracking (local only)
    export CQA_ERROR_REPORTING=true     # Crash analytics (local only)
  All data stays local (~/.create-quality-automation/)
  No personal information collected. Run --telemetry-status or
  --error-reporting-status for details.

HELP:
  --help, -h        Show this help message
`)
    process.exit(0)
  }

  console.log(
    `🚀 ${isDryRun ? '[DRY RUN] Previewing' : isUpdateMode ? 'Updating' : isDependencyMonitoringMode ? 'Adding dependency monitoring to' : 'Setting up'} Quality Automation...\n`
  )

  // Handle dry-run mode - preview what would be changed
  if (isDryRun) {
    console.log('📋 DRY RUN MODE - No files will be modified\n')
    console.log('The following files would be created/modified:\n')
    console.log('Configuration Files:')
    console.log('  • .prettierrc - Prettier formatting configuration')
    console.log('  • .prettierignore - Files to exclude from formatting')
    console.log('  • eslint.config.cjs - ESLint linting configuration')
    console.log('  • .stylelintrc.json - Stylelint CSS linting configuration')
    console.log(
      '  • .editorconfig - Editor configuration for consistent formatting'
    )
    console.log('  • .nvmrc - Node version specification')
    console.log('  • .npmrc - npm configuration with engine-strict')
    console.log('')
    console.log('Git Hooks (Husky):')
    console.log('  • .husky/pre-commit - Pre-commit hook for lint-staged')
    console.log(
      '  • .husky/pre-push - Pre-push validation (lint, format, tests)'
    )
    console.log('')
    console.log('GitHub Actions:')
    console.log('  • .github/workflows/quality.yml - Quality checks workflow')
    console.log('')
    console.log('Package.json Modifications:')
    console.log(
      '  • Add devDependencies: eslint, prettier, stylelint, husky, lint-staged'
    )
    console.log('  • Add scripts: format, lint, prepare')
    console.log('  • Add lint-staged configuration')
    console.log('  • Add engines requirement (Node >=20)')
    console.log('')
    console.log('✅ Dry run complete - no files were modified')
    console.log('')
    console.log('To apply these changes, run without --dry-run flag:')
    console.log('  npx create-quality-automation@latest')
    process.exit(0)
  }

  // Handle validation-only commands
  async function handleValidationCommands() {
    const validationOptions = {
      disableNpmAudit,
      disableGitleaks,
      disableActionlint,
      disableMarkdownlint,
      disableEslintSecurity,
    }
    const validator = new ValidationRunner(validationOptions)

    if (isConfigSecurityMode) {
      try {
        await validator.runConfigSecurity()
        process.exit(0)
      } catch (error) {
        console.error(
          `\n❌ Configuration security validation failed:\n${error.message}`
        )
        process.exit(1)
      }
    }

    if (isDocsValidationMode) {
      try {
        await validator.runDocumentationValidation()
        process.exit(0)
      } catch (error) {
        console.error(`\n❌ Documentation validation failed:\n${error.message}`)
        process.exit(1)
      }
    }

    if (isComprehensiveMode || isValidationMode) {
      try {
        // Use parallel validation for 3-5x speedup (runs checks concurrently)
        await validator.runComprehensiveCheckParallel()
        process.exit(0)
      } catch (error) {
        console.error(`\n❌ Comprehensive validation failed:\n${error.message}`)
        process.exit(1)
      }
    }
  }

  // Detect Python project
  function detectPythonProject(projectPath) {
    const pythonFiles = [
      'pyproject.toml',
      'requirements.txt',
      'setup.py',
      'Pipfile',
    ]
    return pythonFiles.some(file => fs.existsSync(path.join(projectPath, file)))
  }

  // Detect Rust project
  function detectRustProject(projectPath) {
    return fs.existsSync(path.join(projectPath, 'Cargo.toml'))
  }

  // Detect Ruby project
  function detectRubyProject(projectPath) {
    return fs.existsSync(path.join(projectPath, 'Gemfile'))
  }

  // Handle dependency monitoring (Free/Pro/Enterprise)
  async function handleDependencyMonitoring() {
    const projectPath = process.cwd()
    const license = getLicenseInfo()

    // Detect all supported ecosystems (npm, Python, Ruby, Rust, etc.)
    const hasNpm = hasNpmProject(projectPath)
    const hasPython = detectPythonProject(projectPath)
    const hasRust = detectRustProject(projectPath)
    const hasRuby = detectRubyProject(projectPath)

    if (!hasNpm && !hasPython && !hasRust && !hasRuby) {
      console.error(
        '❌ No supported dependency file found (package.json, pyproject.toml, requirements.txt, Gemfile, Cargo.toml).'
      )
      console.log("💡 Make sure you're in a directory with dependency files.")
      process.exit(1)
    }

    if (hasNpm) console.log('📦 Detected: npm project')
    if (hasPython) console.log('🐍 Detected: Python project')
    if (hasRust) console.log('🦀 Detected: Rust project')
    if (hasRuby) console.log('💎 Detected: Ruby project')
    console.log(`📋 License tier: ${license.tier.toUpperCase()}`)

    const dependabotPath = path.join(projectPath, '.github', 'dependabot.yml')

    // Use premium or basic config based on license tier
    // During free beta (v3.0.0), ALL projects use premium generator
    // After beta: Pro/Enterprise use premium, Free tier uses basic (npm-only)
    const shouldUsePremium =
      license.tier === 'PRO' ||
      license.tier === 'ENTERPRISE' ||
      license.tier === 'FREE' // Free beta: all projects get premium features

    if (shouldUsePremium) {
      console.log(
        '\n🚀 Setting up framework-aware dependency monitoring (Premium)...\n'
      )

      const configData = generatePremiumDependabotConfig({
        projectPath,
        schedule: 'weekly',
      })

      if (configData) {
        const { ecosystems } = configData
        const ecosystemNames = Object.keys(ecosystems)

        if (ecosystemNames.length > 0) {
          console.log('🔍 Detected ecosystems:')

          // Find primary ecosystem and total package count
          let primaryEcosystem = null
          ecosystemNames.forEach(ecoName => {
            const eco = ecosystems[ecoName]
            const frameworks = Object.keys(eco.detected || {})
            const totalPackages = frameworks.reduce((sum, fw) => {
              return sum + (eco.detected[fw]?.count || 0)
            }, 0)

            console.log(`   • ${ecoName}: ${totalPackages} packages`)

            if (eco.primary) {
              primaryEcosystem = ecoName
            }
          })

          if (primaryEcosystem) {
            console.log(`\n🎯 Primary ecosystem: ${primaryEcosystem}`)
          }
        }

        writePremiumDependabotConfig(configData, dependabotPath)
        console.log(
          '\n✅ Created .github/dependabot.yml with framework grouping'
        )

        console.log('\n🎉 Premium dependency monitoring setup complete!')
        console.log('\n📋 What was added (Pro Tier):')
        console.log('   • Framework-aware dependency grouping')
        console.log(
          `   • ${Object.keys(configData.config.updates[0].groups || {}).length} dependency groups created`
        )
        console.log('   • Intelligent update batching (reduces PRs by 60%+)')
        console.log('   • GitHub Actions dependency monitoring')
      }
    } else {
      console.log(
        '\n🔍 Setting up basic dependency monitoring (Free Tier)...\n'
      )

      const dependabotConfig = generateBasicDependabotConfig({
        projectPath,
        schedule: 'weekly',
      })

      if (dependabotConfig) {
        writeBasicDependabotConfig(dependabotConfig, dependabotPath)
        console.log('✅ Created .github/dependabot.yml')
      }

      console.log('\n🎉 Basic dependency monitoring setup complete!')
      console.log('\n📋 What was added (Free Tier):')
      console.log('   • Basic Dependabot configuration for npm packages')
      console.log('   • Weekly dependency updates on Monday 9am')
      console.log('   • GitHub Actions dependency monitoring')

      // Show upgrade message for premium features
      console.log('\n🔒 Premium features now available:')
      console.log(
        '   ✅ Framework-aware package grouping (React, Vue, Angular)'
      )
      console.log('   • Coming soon: Multi-language support (Python, Rust, Go)')
      console.log('   • Planned: Advanced security audit workflows')
      console.log('   • Planned: Custom update schedules and notifications')

      showUpgradeMessage('Framework-Aware Dependency Grouping')
    }

    console.log('\n💡 Next steps:')
    console.log('   • Review and commit .github/dependabot.yml')
    console.log('   • Enable Dependabot alerts in GitHub repository settings')
    console.log(
      '   • Dependabot will start monitoring weekly for dependency updates'
    )
  }

  // Handle license status command
  if (isLicenseStatusMode) {
    showLicenseStatus()
    process.exit(0)
  }

  // Handle check maturity command
  if (isCheckMaturityMode) {
    const { ProjectMaturityDetector } = require('./lib/project-maturity')
    const detector = new ProjectMaturityDetector({
      projectPath: process.cwd(),
      verbose: true,
    })
    detector.printReport()
    process.exit(0)
  }

  // Handle validate config command
  if (isValidateConfigMode) {
    const { validateAndReport } = require('./lib/config-validator')
    const configPath = path.join(process.cwd(), '.qualityrc.json')
    const isValid = validateAndReport(configPath)
    process.exit(isValid ? 0 : 1)
  }

  // Handle dependency monitoring command
  if (isDependencyMonitoringMode) {
    return (async () => {
      try {
        await handleDependencyMonitoring()
        process.exit(0)
      } catch (error) {
        console.error('Dependency monitoring setup error:', error.message)
        process.exit(1)
      }
    })()
  }

  // Run validation commands if requested
  if (
    isValidationMode ||
    isConfigSecurityMode ||
    isDocsValidationMode ||
    isComprehensiveMode
  ) {
    // Handle validation commands and exit
    return (async () => {
      try {
        await handleValidationCommands()
      } catch (error) {
        console.error('Validation error:', error.message)
        process.exit(1)
      }
    })()
  } else {
    // Normal setup flow
    async function runMainSetup() {
      // Record telemetry start event (opt-in only, fails silently)
      telemetry.recordStart({
        mode: isDryRun ? 'dry-run' : isUpdateMode ? 'update' : 'setup',
        hasCustomTemplate: !!customTemplatePath,
        isInteractive: false, // Already handled at this point
      })

      // Check if we're in a git repository
      const gitSpinner = showProgress('Checking git repository...')
      try {
        execSync('git status', { stdio: 'ignore' })
        gitSpinner.succeed('Git repository verified')
      } catch {
        gitSpinner.fail('Not a git repository')
        console.error('❌ This must be run in a git repository')
        console.log('Run "git init" first, then try again.')
        process.exit(1)
      }

      // Validate custom template path BEFORE any mutations
      if (customTemplatePath) {
        if (!fs.existsSync(customTemplatePath)) {
          console.error(
            `❌ Custom template path does not exist: ${customTemplatePath}`
          )
          console.error(
            '\nWhen using --template, the path must exist and be a valid directory.'
          )
          console.error('Please check the path and try again.\n')
          process.exit(1)
        }

        const stats = fs.statSync(customTemplatePath)
        if (!stats.isDirectory()) {
          console.error(
            `❌ Custom template path is not a directory: ${customTemplatePath}`
          )
          console.error(
            '\nThe --template path must be a directory containing template files.'
          )
          console.error('Please provide a valid directory path.\n')
          process.exit(1)
        }

        console.log(`✅ Custom template path validated: ${customTemplatePath}`)
      }

      // Check if package.json exists with validation
      const packageJsonPath = path.join(process.cwd(), 'package.json')
      let packageJson = {}

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
          // Validate JSON content before parsing
          if (packageJsonContent.trim().length === 0) {
            console.error('❌ package.json is empty')
            console.log(
              'Please add valid JSON content to package.json and try again.'
            )
            process.exit(1)
          }

          packageJson = JSON.parse(packageJsonContent)

          // Validate package.json structure
          if (typeof packageJson !== 'object' || packageJson === null) {
            console.error('❌ package.json must contain a valid JSON object')
            console.log('Please fix the package.json structure and try again.')
            process.exit(1)
          }

          // Sanitize package name if present
          if (packageJson.name && typeof packageJson.name === 'string') {
            packageJson.name =
              validateAndSanitizeInput(packageJson.name) || 'my-project'
          }

          console.log('✅ Found existing package.json')
        } catch (error) {
          console.error(`❌ Error parsing package.json: ${error.message}`)
          console.log(
            'Please fix the JSON syntax in package.json and try again.'
          )
          console.log(
            'Common issues: trailing commas, missing quotes, unclosed brackets'
          )
          process.exit(1)
        }
      } else {
        console.log('📦 Creating new package.json')
        const projectName =
          validateAndSanitizeInput(path.basename(process.cwd())) || 'my-project'
        packageJson = {
          name: projectName,
          version: '1.0.0',
          description: '',
          main: 'index.js',
          scripts: {},
        }
      }

      const hasTypeScriptDependency = Boolean(
        (packageJson.devDependencies &&
          packageJson.devDependencies.typescript) ||
          (packageJson.dependencies && packageJson.dependencies.typescript)
      )

      const tsconfigCandidates = ['tsconfig.json', 'tsconfig.base.json']
      const hasTypeScriptConfig = tsconfigCandidates.some(file =>
        fs.existsSync(path.join(process.cwd(), file))
      )

      const usesTypeScript = Boolean(
        hasTypeScriptDependency || hasTypeScriptConfig
      )
      if (usesTypeScript) {
        console.log(
          '🔍 Detected TypeScript configuration; enabling TypeScript lint defaults'
        )
      }

      // Python detection (including in workspace packages for monorepos)
      const pythonCandidates = [
        'pyproject.toml',
        'setup.py',
        'requirements.txt',
        'poetry.lock',
      ]
      const hasPythonConfig = pythonCandidates.some(file =>
        fs.existsSync(path.join(process.cwd(), file))
      )

      /**
       * Recursively check for Python files in directory and subdirectories
       * Limited to 2 levels deep to avoid performance issues in large monorepos
       */
      function hasPythonFilesRecursive(dir, depth = 0, maxDepth = 2) {
        if (depth > maxDepth) return false

        try {
          const entries = safeReadDir(dir)

          // Count .py files in current directory (excluding __pycache__)
          const pyFiles = entries.filter(
            dirent =>
              dirent.isFile() &&
              dirent.name.endsWith('.py') &&
              dirent.name !== '__pycache__'
          )

          // Strong indicators: multiple .py files OR main/app/run patterns
          const hasMultiplePyFiles = pyFiles.length >= 2
          const hasMainPattern = pyFiles.some(
            f =>
              f.name === 'main.py' ||
              f.name === 'app.py' ||
              f.name === 'run.py' ||
              f.name === '__main__.py'
          )

          // Require stronger evidence than a single random .py file
          if (hasMultiplePyFiles || hasMainPattern) return true

          // Check subdirectories (skip node_modules, .git, etc.)
          const skipDirs = ['node_modules', '.git', 'dist', 'build', 'coverage']
          for (const dirent of entries) {
            if (dirent.isDirectory() && !skipDirs.includes(dirent.name)) {
              const subDir = path.join(dir, dirent.name)
              if (hasPythonFilesRecursive(subDir, depth + 1, maxDepth)) {
                return true
              }
            }
          }

          return false
        } catch {
          return false
        }
      }

      const hasPythonFiles = hasPythonFilesRecursive(process.cwd())

      const usesPython = Boolean(hasPythonConfig || hasPythonFiles)
      if (usesPython) {
        console.log(
          '🐍 Detected Python project; enabling Python quality automation'
        )
      }

      const stylelintTargets = findStylelintTargets(process.cwd())
      const usingDefaultStylelintTarget =
        stylelintTargets.length === 1 &&
        stylelintTargets[0] === STYLELINT_DEFAULT_TARGET
      if (!usingDefaultStylelintTarget) {
        console.log(
          `🔍 Detected stylelint targets: ${stylelintTargets.join(', ')}`
        )
      }

      // Add quality automation scripts (conservative: do not overwrite existing)
      console.log('📝 Adding quality automation scripts...')
      const defaultScripts = getDefaultScripts({
        typescript: usesTypeScript,
        stylelintTargets,
      })
      packageJson.scripts = mergeScripts(
        packageJson.scripts || {},
        defaultScripts
      )

      // Add devDependencies
      console.log('📦 Adding devDependencies...')
      const defaultDevDependencies = getDefaultDevDependencies({
        typescript: usesTypeScript,
      })
      packageJson.devDependencies = mergeDevDependencies(
        packageJson.devDependencies || {},
        defaultDevDependencies
      )

      // Add lint-staged configuration
      console.log('⚙️ Adding lint-staged configuration...')
      const defaultLintStaged = getDefaultLintStaged({
        typescript: usesTypeScript,
        stylelintTargets,
        python: usesPython,
      })

      const hasExistingCssPatterns = Object.keys(
        packageJson['lint-staged'] || {}
      ).some(patternIncludesStylelintExtension)

      if (hasExistingCssPatterns) {
        console.log(
          'ℹ️ Detected existing lint-staged CSS globs; preserving current CSS targets'
        )
      }

      packageJson['lint-staged'] = mergeLintStaged(
        packageJson['lint-staged'] || {},
        defaultLintStaged,
        { stylelintTargets },
        patternIncludesStylelintExtension
      )

      // Write updated package.json using @npmcli/package-json
      try {
        const PackageJson = checkNodeVersionAndLoadPackageJson()
        let pkgJson
        if (fs.existsSync(packageJsonPath)) {
          // Load existing package.json
          pkgJson = await PackageJson.load(process.cwd())
          // Update with our changes
          Object.assign(pkgJson.content, packageJson)
        } else {
          // Create new package.json
          pkgJson = await PackageJson.create(process.cwd())
          Object.assign(pkgJson.content, packageJson)
        }

        await pkgJson.save()
        console.log('✅ Updated package.json')
      } catch (error) {
        console.error(`❌ Error writing package.json: ${error.message}`)
        process.exit(1)
      }

      // Ensure Node toolchain pinning in target project
      const nvmrcPath = path.join(process.cwd(), '.nvmrc')
      if (!fs.existsSync(nvmrcPath)) {
        fs.writeFileSync(nvmrcPath, '20\n')
        console.log('✅ Added .nvmrc (Node 20)')
      }

      const npmrcPath = path.join(process.cwd(), '.npmrc')
      if (!fs.existsSync(npmrcPath)) {
        fs.writeFileSync(npmrcPath, 'engine-strict = true\n')
        console.log('✅ Added .npmrc (engine-strict)')
      }

      // Generate .qualityrc.json with detected maturity level
      const qualityrcPath = path.join(process.cwd(), '.qualityrc.json')
      if (!fs.existsSync(qualityrcPath)) {
        const { ProjectMaturityDetector } = require('./lib/project-maturity')
        const detector = new ProjectMaturityDetector({
          projectPath: process.cwd(),
        })
        const detectedMaturity = detector.detect()
        const stats = detector.analyzeProject()

        const qualityConfig = {
          version: '1.0.0',
          maturity: 'auto',
          detected: {
            level: detectedMaturity,
            sourceFiles: stats.totalSourceFiles,
            testFiles: stats.testFiles,
            hasDocumentation: stats.hasDocumentation,
            hasDependencies: stats.hasDependencies,
            detectedAt: new Date().toISOString(),
          },
          checks: {
            prettier: { enabled: true, required: true },
            eslint: { enabled: 'auto', required: false },
            stylelint: { enabled: 'auto', required: false },
            tests: { enabled: 'auto', required: false },
            coverage: { enabled: false, required: false, threshold: 80 },
            'security-audit': { enabled: 'auto', required: false },
            documentation: { enabled: false, required: false },
            lighthouse: { enabled: false, required: false },
          },
          override: {
            comment:
              'Set maturity to a specific level to override auto-detection',
            options: [
              'minimal',
              'bootstrap',
              'development',
              'production-ready',
            ],
          },
        }

        fs.writeFileSync(
          qualityrcPath,
          JSON.stringify(qualityConfig, null, 2) + '\n'
        )
        console.log(`✅ Added .qualityrc.json (detected: ${detectedMaturity})`)

        // Validate the generated config
        const validationResult = validateQualityConfig(qualityrcPath)
        if (!validationResult.valid) {
          console.warn(
            '⚠️  Warning: Generated config has validation issues (this should not happen):'
          )
          validationResult.errors.forEach(error => {
            console.warn(`   - ${error}`)
          })
        }
      } else {
        // Config exists, validate it
        // Temporarily disabled - debugging
        // const validationResult = validateQualityConfig(qualityrcPath)
        // if (!validationResult.valid) {
        //   console.warn(
        //     '⚠️  Warning: Existing .qualityrc.json has validation issues:'
        //   )
        //   validationResult.errors.forEach(error => {
        //     console.warn(`   - ${error}`)
        //   })
        //   console.warn(
        //     '   Setup will continue, but you may want to fix these issues.\n'
        //   )
        // }
      }

      // Load and merge templates (custom + defaults)
      // Enable strict mode when custom template path is explicitly provided
      const templateSpinner = showProgress('Loading templates...')
      const templateLoader = new TemplateLoader({
        verbose: true,
        strict: !!customTemplatePath,
      })

      let templates
      try {
        templates = await templateLoader.mergeTemplates(
          customTemplatePath,
          __dirname
        )
        if (customTemplatePath) {
          templateSpinner.succeed('Custom templates loaded successfully')
        } else {
          templateSpinner.succeed('Default templates loaded')
        }
      } catch (error) {
        templateSpinner.fail('Template loading failed')
        console.error(`❌ Template loading failed: ${error.message}`)
        console.error(
          '\nWhen using --template, the path must exist and be a valid directory.'
        )
        console.error('Please check the path and try again.\n')
        process.exit(1)
      }

      // Create .github/workflows directory if it doesn't exist
      const configSpinner = showProgress('Copying configuration files...')
      const workflowDir = path.join(process.cwd(), '.github', 'workflows')
      if (!fs.existsSync(workflowDir)) {
        fs.mkdirSync(workflowDir, { recursive: true })
        console.log('📁 Created .github/workflows directory')
      }

      // Copy workflow file if it doesn't exist
      const workflowFile = path.join(workflowDir, 'quality.yml')
      if (!fs.existsSync(workflowFile)) {
        const templateWorkflow =
          templateLoader.getTemplate(
            templates,
            path.join('.github', 'workflows', 'quality.yml')
          ) ||
          fs.readFileSync(
            path.join(__dirname, '.github/workflows/quality.yml'),
            'utf8'
          )
        fs.writeFileSync(workflowFile, templateWorkflow)
        console.log('✅ Added GitHub Actions workflow')
      }

      // Copy Prettier config if it doesn't exist
      const prettierrcPath = path.join(process.cwd(), '.prettierrc')
      if (!fs.existsSync(prettierrcPath)) {
        const templatePrettierrc =
          templateLoader.getTemplate(templates, '.prettierrc') ||
          fs.readFileSync(path.join(__dirname, '.prettierrc'), 'utf8')
        fs.writeFileSync(prettierrcPath, templatePrettierrc)
        console.log('✅ Added Prettier configuration')
      }

      // Copy ESLint config if it doesn't exist
      const eslintConfigPath = path.join(process.cwd(), 'eslint.config.cjs')
      const eslintTemplateFile = usesTypeScript
        ? 'eslint.config.ts.cjs'
        : 'eslint.config.cjs'
      const templateEslint =
        templateLoader.getTemplate(templates, eslintTemplateFile) ||
        fs.readFileSync(path.join(__dirname, eslintTemplateFile), 'utf8')

      if (!fs.existsSync(eslintConfigPath)) {
        fs.writeFileSync(eslintConfigPath, templateEslint)
        console.log(
          `✅ Added ESLint configuration${usesTypeScript ? ' (TypeScript-aware)' : ''}`
        )
      } else if (usesTypeScript) {
        const existingConfig = fs.readFileSync(eslintConfigPath, 'utf8')
        if (!existingConfig.includes('@typescript-eslint')) {
          fs.writeFileSync(eslintConfigPath, templateEslint)
          console.log('♻️ Updated ESLint configuration with TypeScript support')
        }
      }

      const legacyEslintrcPath = path.join(process.cwd(), '.eslintrc.json')
      if (fs.existsSync(legacyEslintrcPath)) {
        console.log(
          'ℹ️ Detected legacy .eslintrc.json; ESLint 9 prefers eslint.config.cjs. Consider removing the legacy file after verifying the new config.'
        )
      }

      // Copy Stylelint config if it doesn't exist
      const stylelintrcPath = path.join(process.cwd(), '.stylelintrc.json')
      if (!fs.existsSync(stylelintrcPath)) {
        const templateStylelint =
          templateLoader.getTemplate(templates, '.stylelintrc.json') ||
          fs.readFileSync(path.join(__dirname, '.stylelintrc.json'), 'utf8')
        fs.writeFileSync(stylelintrcPath, templateStylelint)
        console.log('✅ Added Stylelint configuration')
      }

      // Copy .prettierignore if it doesn't exist
      const prettierignorePath = path.join(process.cwd(), '.prettierignore')
      if (!fs.existsSync(prettierignorePath)) {
        const templatePrettierignore =
          templateLoader.getTemplate(templates, '.prettierignore') ||
          fs.readFileSync(path.join(__dirname, '.prettierignore'), 'utf8')
        fs.writeFileSync(prettierignorePath, templatePrettierignore)
        console.log('✅ Added Prettier ignore file')
      }

      // Copy Lighthouse CI config if it doesn't exist
      const lighthousercPath = path.join(process.cwd(), '.lighthouserc.js')
      if (!fs.existsSync(lighthousercPath)) {
        const templateLighthouserc =
          templateLoader.getTemplate(
            templates,
            path.join('config', '.lighthouserc.js')
          ) ||
          fs.readFileSync(
            path.join(__dirname, 'config', '.lighthouserc.js'),
            'utf8'
          )
        fs.writeFileSync(lighthousercPath, templateLighthouserc)
        console.log('✅ Added Lighthouse CI configuration')
      }

      // Copy ESLint ignore if it doesn't exist
      const eslintignorePath = path.join(process.cwd(), '.eslintignore')
      const eslintignoreTemplatePath = path.join(__dirname, '.eslintignore')
      if (
        !fs.existsSync(eslintignorePath) &&
        (templateLoader.hasTemplate(templates, '.eslintignore') ||
          fs.existsSync(eslintignoreTemplatePath))
      ) {
        const templateEslintIgnore =
          templateLoader.getTemplate(templates, '.eslintignore') ||
          fs.readFileSync(eslintignoreTemplatePath, 'utf8')
        fs.writeFileSync(eslintignorePath, templateEslintIgnore)
        console.log('✅ Added ESLint ignore file')
      }

      // Copy .editorconfig if it doesn't exist
      const editorconfigPath = path.join(process.cwd(), '.editorconfig')
      if (!fs.existsSync(editorconfigPath)) {
        const templateEditorconfig =
          templateLoader.getTemplate(templates, '.editorconfig') ||
          fs.readFileSync(path.join(__dirname, '.editorconfig'), 'utf8')
        fs.writeFileSync(editorconfigPath, templateEditorconfig)
        console.log('✅ Added .editorconfig')
      }

      configSpinner.succeed('Configuration files copied')

      // Ensure .gitignore exists with essential entries
      const gitignorePath = path.join(process.cwd(), '.gitignore')
      if (!fs.existsSync(gitignorePath)) {
        const essentialGitignore = `# Dependencies
node_modules/
.pnpm-store/

# Environment variables
.env*

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Build outputs
dist/
build/
.next/
.nuxt/
.output/
.vercel/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Coverage
coverage/
.nyc_output/

# Cache
.cache/
.parcel-cache/
.turbo/
`
        fs.writeFileSync(gitignorePath, essentialGitignore)
        console.log('✅ Added .gitignore with essential entries')
      }

      // Ensure Husky pre-commit hook runs lint-staged
      const huskySpinner = showProgress('Setting up Husky git hooks...')
      try {
        const huskyDir = path.join(process.cwd(), '.husky')
        if (!fs.existsSync(huskyDir)) {
          fs.mkdirSync(huskyDir, { recursive: true })
        }
        const preCommitPath = path.join(huskyDir, 'pre-commit')
        if (!fs.existsSync(preCommitPath)) {
          const hook =
            '#!/bin/sh\n. "$(dirname "$0")/_/husky.sh"\n\n# Run lint-staged on staged files\nnpx --no -- lint-staged\n'
          fs.writeFileSync(preCommitPath, hook)
          fs.chmodSync(preCommitPath, 0o755)
          console.log('✅ Added Husky pre-commit hook (lint-staged)')
        }
      } catch (e) {
        huskySpinner.warn('Could not create Husky pre-commit hook')
        console.warn('⚠️ Could not create Husky pre-commit hook:', e.message)
      }

      // Ensure Husky pre-push hook runs validation checks
      try {
        const huskyDir = path.join(process.cwd(), '.husky')
        if (!fs.existsSync(huskyDir)) {
          fs.mkdirSync(huskyDir, { recursive: true })
        }
        const prePushPath = path.join(huskyDir, 'pre-push')
        if (!fs.existsSync(prePushPath)) {
          const hook = `#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "🔍 Running pre-push validation..."

# Validate command patterns (fast - catches deprecated patterns)
if node -e "const pkg=require('./package.json');process.exit(pkg.scripts['test:patterns']?0:1)" 2>/dev/null; then
  echo "🔍 Validating command patterns..."
  npm run test:patterns || {
    echo "❌ Pattern validation failed! Deprecated patterns detected."
    exit 1
  }
fi

# Run lint (catches errors before CI)
echo "📝 Linting..."
npm run lint || {
  echo "❌ Lint failed! Fix errors before pushing."
  exit 1
}

# Run format check (ensures code style consistency)
echo "✨ Checking formatting..."
npm run format:check || {
  echo "❌ Format check failed! Run 'npm run format' to fix."
  exit 1
}

# Test command execution (CRITICAL - prevents command generation bugs)
if node -e "const pkg=require('./package.json');process.exit(pkg.scripts['test:commands']?0:1)" 2>/dev/null; then
  echo "🧪 Testing command execution..."
  npm run test:commands || {
    echo "❌ Command execution tests failed! Generated commands are broken."
    exit 1
  }
fi

# Run tests if they exist
if node -e "const pkg=require('./package.json');process.exit(pkg.scripts.test?0:1)" 2>/dev/null; then
  echo "🧪 Running unit tests..."
  npm test || {
    echo "❌ Tests failed! Fix failing tests before pushing."
    exit 1
  }
fi

echo "✅ Pre-push validation passed!"
`
          fs.writeFileSync(prePushPath, hook)
          fs.chmodSync(prePushPath, 0o755)
          console.log('✅ Added Husky pre-push hook (validation)')
        }
        huskySpinner.succeed('Husky git hooks configured')
      } catch (e) {
        huskySpinner.warn('Could not create Husky pre-push hook')
        console.warn('⚠️ Could not create Husky pre-push hook:', e.message)
      }

      // Ensure engines/volta pins in target package.json (enforce minimums)
      try {
        if (fs.existsSync(packageJsonPath)) {
          const PackageJson = checkNodeVersionAndLoadPackageJson()
          const pkgJson = await PackageJson.load(process.cwd())

          // Preserve existing engines but enforce Node >=20 minimum
          const existingEngines = pkgJson.content.engines || {}
          pkgJson.content.engines = {
            ...existingEngines,
            node: '>=20', // Always enforce our minimum
          }

          // Preserve existing volta but set our pinned versions
          const existingVolta = pkgJson.content.volta || {}
          pkgJson.content.volta = {
            ...existingVolta,
            node: '20.11.1',
            npm: '10.2.4',
          }

          await pkgJson.save()
          console.log(
            '✅ Ensured engines and Volta pins in package.json (Node >=20 enforced)'
          )
        }
      } catch (e) {
        console.warn(
          '⚠️ Could not update engines/volta in package.json:',
          e.message
        )
      }

      // Python quality automation setup
      if (usesPython) {
        console.log('\n🐍 Setting up Python quality automation...')

        const pythonSpinner = showProgress(
          'Configuring Python quality tools...'
        )

        // Copy pyproject.toml if it doesn't exist
        const pyprojectPath = path.join(process.cwd(), 'pyproject.toml')
        if (!fs.existsSync(pyprojectPath)) {
          const templatePyproject =
            templateLoader.getTemplate(
              templates,
              path.join('config', 'pyproject.toml')
            ) ||
            fs.readFileSync(
              path.join(__dirname, 'config/pyproject.toml'),
              'utf8'
            )
          fs.writeFileSync(pyprojectPath, templatePyproject)
          console.log(
            '✅ Added pyproject.toml with Black, Ruff, isort, mypy config'
          )
        }

        // Copy pre-commit config
        const preCommitPath = path.join(
          process.cwd(),
          '.pre-commit-config.yaml'
        )
        if (!fs.existsSync(preCommitPath)) {
          const templatePreCommit =
            templateLoader.getTemplate(
              templates,
              path.join('config', '.pre-commit-config.yaml')
            ) ||
            fs.readFileSync(
              path.join(__dirname, 'config/.pre-commit-config.yaml'),
              'utf8'
            )
          fs.writeFileSync(preCommitPath, templatePreCommit)
          console.log('✅ Added .pre-commit-config.yaml')
        }

        // Copy requirements-dev.txt
        const requirementsDevPath = path.join(
          process.cwd(),
          'requirements-dev.txt'
        )
        if (!fs.existsSync(requirementsDevPath)) {
          const templateRequirements =
            templateLoader.getTemplate(
              templates,
              path.join('config', 'requirements-dev.txt')
            ) ||
            fs.readFileSync(
              path.join(__dirname, 'config/requirements-dev.txt'),
              'utf8'
            )
          fs.writeFileSync(requirementsDevPath, templateRequirements)
          console.log('✅ Added requirements-dev.txt')
        }

        // Copy Python workflow
        const pythonWorkflowFile = path.join(workflowDir, 'quality-python.yml')
        if (!fs.existsSync(pythonWorkflowFile)) {
          const templatePythonWorkflow =
            templateLoader.getTemplate(
              templates,
              path.join('config', 'quality-python.yml')
            ) ||
            fs.readFileSync(
              path.join(__dirname, 'config/quality-python.yml'),
              'utf8'
            )
          fs.writeFileSync(pythonWorkflowFile, templatePythonWorkflow)
          console.log('✅ Added Python GitHub Actions workflow')
        }

        // Create tests directory if it doesn't exist
        const testsDir = path.join(process.cwd(), 'tests')
        if (!fs.existsSync(testsDir)) {
          fs.mkdirSync(testsDir)
          fs.writeFileSync(path.join(testsDir, '__init__.py'), '')
          console.log('✅ Created tests directory')
        }

        // Add Python helper scripts to package.json if it exists and is a JS/TS project too
        if (fs.existsSync(packageJsonPath)) {
          try {
            const PackageJson = checkNodeVersionAndLoadPackageJson()
            const pkgJson = await PackageJson.load(process.cwd())

            const pythonScripts = {
              'python:format': 'black .',
              'python:format:check': 'black --check .',
              'python:lint': 'ruff check .',
              'python:lint:fix': 'ruff check --fix .',
              'python:type-check': 'mypy .',
              'python:quality':
                'black --check . && ruff check . && isort --check-only . && mypy .',
              'python:test': 'pytest',
            }

            if (!pkgJson.content.scripts) {
              pkgJson.content.scripts = {}
            }
            // Use mergeScripts to preserve existing scripts
            pkgJson.content.scripts = mergeScripts(
              pkgJson.content.scripts,
              pythonScripts
            )
            await pkgJson.save()
            console.log('✅ Added Python helper scripts to package.json')
          } catch (e) {
            console.warn(
              '⚠️ Could not add Python scripts to package.json:',
              e.message
            )
          }
        }

        pythonSpinner.succeed('Python quality tools configured')
      }

      // Generate placeholder test file with helpful documentation
      const testsDir = path.join(process.cwd(), 'tests')
      const testExtension = usesTypeScript ? 'ts' : 'js'
      const placeholderTestPath = path.join(
        testsDir,
        `placeholder.test.${testExtension}`
      )

      if (!fs.existsSync(testsDir)) {
        fs.mkdirSync(testsDir, { recursive: true })
      }

      if (!fs.existsSync(placeholderTestPath)) {
        const placeholderContent = `import { describe, it, expect } from 'vitest'

/**
 * PLACEHOLDER TEST FILE
 *
 * This file ensures your test suite passes even when you're just getting started.
 * Replace these placeholders with real tests as you build your application.
 *
 * Progressive Testing Strategy:
 * 1. Start: Use describe.skip() placeholders (tests pass but are marked as skipped)
 * 2. Planning: Convert to it.todo() when you know what to test
 * 3. Implementation: Write actual test implementations
 * 4. Tighten: Remove --passWithNoTests flag once you have real tests
 *
 * To tighten enforcement, update package.json:
 * - Change: "test": "vitest run --passWithNoTests"
 * - To:     "test": "vitest run" (fails if no tests exist)
 */

describe.skip('Example test suite (placeholder)', () => {
  /**
   * These tests are skipped by default to prevent false positives.
   * Remove .skip and implement these tests when you're ready.
   */

  it.todo('should test core functionality')

  it.todo('should handle edge cases')

  it.todo('should validate error conditions')
})

// Example of a passing test (demonstrates test framework is working)
describe('Test framework validation', () => {
  it('should confirm Vitest is properly configured', () => {
    expect(true).toBe(true)
  })
})

/**
 * Next Steps:
 * 1. Create feature-specific test files (e.g., user.test.${testExtension}, api.test.${testExtension})
 * 2. Move these it.todo() placeholders to appropriate test files
 * 3. Implement actual test logic
 * 4. Delete this placeholder.test.${testExtension} file when you have real tests
 *
 * Resources:
 * - Vitest Docs: https://vitest.dev/guide/
 * - Testing Best Practices: https://github.com/goldbergyoni/javascript-testing-best-practices
 */
`
        fs.writeFileSync(placeholderTestPath, placeholderContent)
        console.log(
          `✅ Added placeholder test file (tests/placeholder.test.${testExtension})`
        )
        console.log(
          '   💡 Replace with real tests as you build your application'
        )
      }

      console.log('\n🎉 Quality automation setup complete!')

      // Record telemetry completion event (opt-in only, fails silently)
      telemetry.recordComplete({
        usesPython,
        usesTypeScript,
        hasStylelintFiles: stylelintTargets.length > 0,
        mode: isDryRun ? 'dry-run' : isUpdateMode ? 'update' : 'setup',
      })

      // Dynamic next steps based on detected languages
      console.log('\n📋 Next steps:')

      if (usesPython && fs.existsSync(packageJsonPath)) {
        console.log('JavaScript/TypeScript setup:')
        console.log('1. Run: npm install')
        console.log('2. Run: npm run prepare')
        console.log('\nPython setup:')
        console.log('3. Run: python3 -m pip install -r requirements-dev.txt')
        console.log('4. Run: pre-commit install')
        console.log('\n5. Commit your changes to activate both workflows')
      } else if (usesPython) {
        console.log('Python setup:')
        console.log('1. Run: python3 -m pip install -r requirements-dev.txt')
        console.log('2. Run: pre-commit install')
        console.log('3. Commit your changes to activate the workflow')
      } else {
        console.log('1. Run: npm install')
        console.log('2. Run: npm run prepare')
        console.log('3. Commit your changes to activate the workflow')
      }
      console.log('\n✨ Your project now has:')
      console.log('  • Prettier code formatting')
      console.log('  • Pre-commit hooks via Husky (lint-staged)')
      console.log('  • Pre-push validation (lint, format, tests)')
      console.log('  • GitHub Actions quality checks')
      console.log('  • Lint-staged for efficient processing')
    } // End of runMainSetup function

    // Run main setup (interactive handling already done at top if requested)
    await runMainSetup()
  } // End of normal setup flow

  // Close the main async function and handle errors
})().catch(error => {
  try {
    // Always show stack trace for debugging
    if (error?.stack) {
      console.error('\n🐛 Error stack trace:')
      console.error(error.stack)
    }

    // Record telemetry failure event (opt-in only, fails silently)
    const telemetry = new TelemetrySession()
    telemetry.recordFailure(error, {
      errorLocation: error?.stack ? error.stack.split('\n')[1] : 'unknown',
    })

    // Capture and report error (opt-in only, fails silently)
    const errorReporter = new ErrorReporter('setup')
    const reportId = errorReporter.captureError(error, {
      operation: 'setup',
      errorLocation: error?.stack ? error.stack.split('\n')[1] : 'unknown',
    })

    // Show friendly error message with category
    errorReporter.promptErrorReport(error)

    // If report was captured, show location
    if (reportId) {
      console.log(`\n📊 Error report saved: ${reportId}`)
      console.log(`View at: ~/.create-quality-automation/error-reports.json`)
    }
  } catch (reportingError) {
    // Error in error reporting - fallback to basic error display
    console.error('\n❌ Setup failed with error:')
    console.error(error?.message || error || 'Unknown error')
    if (error?.stack) {
      console.error('\nStack trace:')
      console.error(error.stack)
    }
    // Show error reporting failure for debugging
    if (process.env.DEBUG) {
      console.error('\n⚠️  Error reporting also failed:')
      console.error(
        reportingError?.stack || reportingError?.message || reportingError
      )
    }
  }

  process.exit(1)
})
