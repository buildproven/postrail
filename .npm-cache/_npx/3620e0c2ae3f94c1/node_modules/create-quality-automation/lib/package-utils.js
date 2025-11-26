'use strict'

/**
 * Package.json merge utilities
 * Shared between setup script and tests to avoid duplication
 */

/**
 * Merge scripts into package.json, preserving existing ones
 * @param {Object} initialScripts - Existing scripts object
 * @param {Object} defaultScripts - Default scripts to add
 * @returns {Object} Merged scripts object
 */
function mergeScripts(initialScripts = {}, defaultScripts) {
  const scripts = { ...initialScripts }
  Object.entries(defaultScripts).forEach(([name, command]) => {
    if (!scripts[name]) {
      scripts[name] = command
    }
  })

  // Ensure husky command is present in prepare script
  const prepareScript = scripts.prepare
  if (!prepareScript) {
    scripts.prepare = 'husky'
  } else if (prepareScript.includes('husky install')) {
    scripts.prepare = prepareScript.replace(/husky install/g, 'husky')
  } else if (!prepareScript.includes('husky')) {
    scripts.prepare = `${prepareScript} && husky`
  }

  return scripts
}

/**
 * Merge devDependencies into package.json, preserving existing ones
 * @param {Object} initialDevDeps - Existing devDependencies object
 * @param {Object} defaultDevDeps - Default devDependencies to add
 * @returns {Object} Merged devDependencies object
 */
function mergeDevDependencies(initialDevDeps = {}, defaultDevDeps) {
  const devDeps = { ...initialDevDeps }
  Object.entries(defaultDevDeps).forEach(([dependency, version]) => {
    if (!devDeps[dependency]) {
      devDeps[dependency] = version
    }
  })
  return devDeps
}

/**
 * Merge lint-staged configuration, preserving existing patterns
 * @param {Object} existing - Existing lint-staged config
 * @param {Object} defaults - Default lint-staged config
 * @param {Object} options - Merge options
 * @param {Function} patternChecker - Function to check if a pattern matches certain criteria
 * @returns {Object} Merged lint-staged config
 */
function mergeLintStaged(
  existing = {},
  defaults,
  options = {},
  patternChecker = null
) {
  const merged = { ...existing }
  const stylelintTargets = options.stylelintTargets || []
  const stylelintTargetSet = new Set(stylelintTargets)

  // Check if existing config has CSS patterns
  const hasExistingCssPatterns =
    patternChecker && Object.keys(existing).some(patternChecker)

  Object.entries(defaults).forEach(([pattern, commands]) => {
    const isStylelintPattern = stylelintTargetSet.has(pattern)
    if (isStylelintPattern && hasExistingCssPatterns) {
      return // Skip stylelint patterns if existing CSS patterns exist
    }

    if (!merged[pattern]) {
      merged[pattern] = commands
      return
    }

    // Merge commands for existing patterns

    const existingCommands = Array.isArray(merged[pattern])
      ? [...merged[pattern]]
      : [merged[pattern]]

    const newCommands = [...existingCommands]
    commands.forEach(command => {
      if (!newCommands.includes(command)) {
        newCommands.push(command)
      }
    })

    merged[pattern] = newCommands
  })

  return merged
}

/**
 * Detect which package manager is being used in the project
 * @param {string} projectPath - Path to the project directory
 * @returns {string} Package manager name: 'pnpm', 'yarn', 'bun', or 'npm'
 */
function detectPackageManager(projectPath = process.cwd()) {
  const fs = require('fs')
  const path = require('path')

  // Check for lockfiles in order of preference
  if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
    return 'pnpm'
  }
  if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
    return 'yarn'
  }
  if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) {
    return 'bun'
  }
  if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) {
    return 'npm'
  }

  // Check package.json for packageManager field (Corepack)
  const packageJsonPath = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (packageJson.packageManager) {
        // Format: "pnpm@8.0.0" or "yarn@3.0.0"
        const pmName = packageJson.packageManager.split('@')[0]
        if (['pnpm', 'yarn', 'bun', 'npm'].includes(pmName)) {
          return pmName
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Default to npm if no lockfile found
  return 'npm'
}

/**
 * Get install command for detected package manager
 * @param {string} packageManager - Package manager name
 * @param {boolean} frozen - Use frozen/immutable lockfile (CI mode)
 * @returns {string} Install command
 */
function getInstallCommand(packageManager, frozen = true) {
  const commands = {
    pnpm: frozen ? 'pnpm install --frozen-lockfile' : 'pnpm install',
    yarn: frozen ? 'yarn install --frozen-lockfile' : 'yarn install',
    bun: frozen ? 'bun install --frozen-lockfile' : 'bun install',
    npm: frozen ? 'npm ci' : 'npm install',
  }

  return commands[packageManager] || 'npm install'
}

/**
 * Get audit command for detected package manager
 * @param {string} packageManager - Package manager name
 * @returns {string} Audit command
 */
function getAuditCommand(packageManager) {
  const commands = {
    pnpm: 'pnpm audit',
    yarn: 'yarn audit',
    bun: 'bun audit', // Bun has audit support
    npm: 'npm audit',
  }

  return commands[packageManager] || 'npm audit'
}

module.exports = {
  mergeScripts,
  mergeDevDependencies,
  mergeLintStaged,
  detectPackageManager,
  getInstallCommand,
  getAuditCommand,
}
