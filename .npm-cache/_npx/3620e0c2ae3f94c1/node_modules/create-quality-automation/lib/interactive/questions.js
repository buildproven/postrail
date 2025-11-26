'use strict'

/**
 * Question definitions and answer parsing for interactive mode
 */

/**
 * Generate question definitions for interactive flow
 * @returns {Array<Object>} Array of question objects
 */
function generateQuestions() {
  return [
    {
      name: 'operationMode',
      type: 'select',
      message: 'What would you like to do?',
      choices: [
        {
          value: 'setup',
          label: 'Full quality automation setup (recommended)',
        },
        { value: 'update', label: 'Update existing configuration' },
        { value: 'validate', label: 'Run validation checks only' },
      ],
    },
    {
      name: 'dependencyMonitoring',
      type: 'confirm',
      message: 'Include basic dependency monitoring (Free Tier)?',
      default: true,
    },
    {
      name: 'dryRun',
      type: 'confirm',
      message: 'Preview changes without modifying files (dry-run mode)?',
      default: false,
    },
    {
      name: 'toolExclusions',
      type: 'multiSelect',
      message: 'Disable any specific validation tools?',
      choices: [
        {
          value: 'npm-audit',
          label: 'npm audit (dependency vulnerability checks)',
        },
        { value: 'gitleaks', label: 'gitleaks (secret scanning)' },
        {
          value: 'actionlint',
          label: 'actionlint (GitHub Actions workflow validation)',
        },
        {
          value: 'markdownlint',
          label: 'markdownlint (markdown formatting checks)',
        },
        { value: 'eslint-security', label: 'ESLint security rules' },
      ],
    },
  ]
}

/**
 * Parse user answers into CLI flags
 * @param {Object} answers - User's answers to questions
 * @returns {Array<string>} Array of CLI flags
 */
function parseAnswers(answers) {
  const flags = []

  // Operation mode
  if (answers.operationMode === 'update') {
    flags.push('--update')
  } else if (answers.operationMode === 'validate') {
    flags.push('--comprehensive')
  }
  // 'setup' mode is default (no flag needed)

  // Dependency monitoring
  if (answers.dependencyMonitoring) {
    flags.push('--deps')
  }

  // Dry-run mode
  if (answers.dryRun) {
    flags.push('--dry-run')
  }

  // Tool exclusions
  if (Array.isArray(answers.toolExclusions)) {
    answers.toolExclusions.forEach(tool => {
      flags.push(`--no-${tool}`)
    })
  }

  return flags
}

/**
 * Run interactive prompt flow
 * @param {InteractivePrompt} prompt - Prompt instance
 * @returns {Promise<Array<string>>} Array of CLI flags based on answers
 */
async function runInteractiveFlow(prompt) {
  const questions = generateQuestions()
  const answers = {}

  console.log('\n🚀 Interactive Quality Automation Setup\n')

  for (const question of questions) {
    try {
      if (question.type === 'confirm') {
        answers[question.name] = await prompt.confirm(
          question.message,
          question.default
        )
      } else if (question.type === 'select') {
        answers[question.name] = await prompt.select(
          question.message,
          question.choices
        )
      } else if (question.type === 'multiSelect') {
        answers[question.name] = await prompt.multiSelect(
          question.message,
          question.choices
        )
      }
    } catch (error) {
      // Handle user cancellation or other errors
      if (error.message.includes('cancelled')) {
        console.log('\n\n❌ Interactive mode cancelled by user\n')
        process.exit(0)
      }
      throw error
    }
  }

  console.log('\n✅ Configuration complete!\n')

  return parseAnswers(answers)
}

module.exports = {
  generateQuestions,
  parseAnswers,
  runInteractiveFlow,
}
