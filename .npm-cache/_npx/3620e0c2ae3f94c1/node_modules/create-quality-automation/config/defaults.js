'use strict'
/* eslint-disable security/detect-object-injection */

const STYLELINT_EXTENSIONS = ['css', 'scss', 'sass', 'less', 'pcss']
const DEFAULT_STYLELINT_TARGET = `**/*.{${STYLELINT_EXTENSIONS.join(',')}}`

const baseScripts = {
  format: 'prettier --write .',
  'format:check': 'prettier --check .',
  test: 'vitest run --passWithNoTests',
  'test:watch': 'vitest',
  'test:coverage': 'vitest run --coverage',
  'security:audit': 'npm audit --audit-level high',
  'security:secrets':
    "node -e \"const fs=require('fs');const content=fs.readFileSync('package.json','utf8');if(/[\\\"\\'][a-zA-Z0-9+/]{20,}[\\\"\\']/.test(content)){console.error('❌ Potential hardcoded secrets in package.json');process.exit(1)}else{console.log('✅ No secrets detected in package.json')}\"",
  'security:config': 'npx create-quality-automation@latest --security-config',
  'lighthouse:ci': 'lhci autorun',
  'lighthouse:upload': 'lhci upload',
  'validate:docs': 'npx create-quality-automation@latest --validate-docs',
  'validate:comprehensive':
    'npx create-quality-automation@latest --comprehensive',
  'validate:all': 'npm run validate:comprehensive && npm run security:audit',
  'validate:pre-push':
    'npm run test:patterns --if-present && npm run lint && npm run format:check && npm run test:commands --if-present && npm test --if-present',
}

const normalizeStylelintTargets = stylelintTargets => {
  const targets = Array.isArray(stylelintTargets)
    ? stylelintTargets.filter(Boolean)
    : []
  if (!targets.length) {
    return [DEFAULT_STYLELINT_TARGET]
  }
  return [...new Set(targets)]
}

const stylelintBraceGroup = stylelintTargets => {
  const targets = normalizeStylelintTargets(stylelintTargets)
  if (targets.length === 1) {
    return targets[0]
  }
  return `{${targets.join(',')}}`
}

const baseLintScripts = ({ stylelintTargets }) => {
  const stylelintTarget = stylelintBraceGroup(stylelintTargets)
  return {
    lint: `eslint . && stylelint "${stylelintTarget}" --allow-empty-input`,
    'lint:fix': `eslint . --fix && stylelint "${stylelintTarget}" --fix --allow-empty-input`,
  }
}

const baseDevDependencies = {
  husky: '^9.1.4',
  'lint-staged': '^15.2.10',
  prettier: '^3.3.3',
  eslint: '^9.12.0',
  'eslint-plugin-security': '^3.0.1',
  globals: '^15.9.0',
  stylelint: '^16.8.0',
  'stylelint-config-standard': '^37.0.0',
  '@lhci/cli': '^0.14.0',
  vitest: '^2.1.8',
  '@vitest/coverage-v8': '^2.1.8',
}

const typeScriptDevDependencies = {
  '@typescript-eslint/eslint-plugin': '^8.9.0',
  '@typescript-eslint/parser': '^8.9.0',
}

const baseLintStaged = (patterns, stylelintTargets, usesPython = false) => {
  const lintStaged = {
    'package.json': ['prettier --write'],
    [patterns]: ['eslint --fix', 'prettier --write'],
    '**/*.{json,md,yml,yaml}': ['prettier --write'],
  }

  normalizeStylelintTargets(stylelintTargets).forEach(target => {
    lintStaged[target] = ['stylelint --fix', 'prettier --write']
  })

  // Add Python lint-staged support if Python is detected
  if (usesPython) {
    lintStaged['**/*.py'] = [
      'black --check --diff',
      'ruff check --fix',
      'isort --check-only --diff',
    ]
  }

  return lintStaged
}

const JS_LINT_STAGED_PATTERN = '**/*.{js,jsx,mjs,cjs,html}'
const TS_LINT_STAGED_PATTERN = '**/*.{js,jsx,ts,tsx,mjs,cjs,html}'

const clone = value => JSON.parse(JSON.stringify(value))

function getDefaultScripts({ stylelintTargets } = {}) {
  return {
    ...clone(baseScripts),
    ...baseLintScripts({ stylelintTargets }),
  }
}

function getDefaultDevDependencies({ typescript } = {}) {
  const devDeps = { ...clone(baseDevDependencies) }
  if (typescript) {
    Object.assign(devDeps, typeScriptDevDependencies)
  }
  return devDeps
}

function getDefaultLintStaged({ typescript, stylelintTargets, python } = {}) {
  const pattern = typescript ? TS_LINT_STAGED_PATTERN : JS_LINT_STAGED_PATTERN
  return clone(baseLintStaged(pattern, stylelintTargets, python))
}

module.exports = {
  getDefaultDevDependencies,
  getDefaultLintStaged,
  getDefaultScripts,
  STYLELINT_EXTENSIONS,
}
