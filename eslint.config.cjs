const js = require('@eslint/js')
const globals = require('globals')

let tsPlugin = null
let tsParser = null
let security = null
try {
  tsPlugin = require('@typescript-eslint/eslint-plugin')
  tsParser = require('@typescript-eslint/parser')
} catch {
  // TypeScript tooling not installed yet; fall back to JS-only config.
}

try {
  security = require('eslint-plugin-security')
} catch {
  // Security plugin not installed yet; fall back to basic config
}

const configs = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/coverage/**',
      'test-generation.js',
      'test-full-flow.js',
    ],
  },
  js.configs.recommended,
]

// Add security config if available
if (security) {
  configs.push(security.configs.recommended)
}

// Base rules configuration
const baseRules = {
  // XSS Prevention patterns - critical for web applications
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
}

// Security rules only if plugin is loaded
const securityRules = security
  ? {
      // Security rules from WFHroulette patterns - adjusted for build tools
      'security/detect-object-injection': 'warn', // Build tools often use dynamic object access
      'security/detect-non-literal-regexp': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn', // Build tools may spawn processes
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn', // Build tools need dynamic file operations
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
    }
  : {}

configs.push({
  files: ['**/*.{js,jsx,mjs,cjs,html}'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    globals: {
      ...globals.browser,
      ...globals.node,
      React: 'readonly',
    },
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
  rules: {
    ...baseRules,
    ...securityRules,
  },
})

if (tsPlugin && tsParser) {
  configs.push({
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        React: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...baseRules,
      ...securityRules,
      ...tsPlugin.configs.recommended.rules,
      // Allow any types in test files and specific cases
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  })
}

// Relaxed rules for test files and scripts
configs.push({
  files: [
    '**/*.test.{js,ts,tsx}',
    '**/tests/**/*',
    '**/*.spec.{js,ts,tsx}',
    'scripts/**/*',
    'test-*.js',
  ],
  rules: {
    'security/detect-non-literal-fs-filename': 'off',
    'security/detect-object-injection': 'off',
    'security/detect-unsafe-regex': 'off',
    'security/detect-possible-timing-attacks': 'off',
  },
})

module.exports = configs
