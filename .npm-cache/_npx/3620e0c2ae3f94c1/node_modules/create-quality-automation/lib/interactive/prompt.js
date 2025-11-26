'use strict'

const readline = require('readline')

/**
 * Interactive prompt utility using Node.js readline
 * Handles user input with TTY detection for CI safety
 */
class InteractivePrompt {
  constructor(options = {}) {
    this.input = options.input || process.stdin
    this.output = options.output || process.stdout
  }

  /**
   * Check if running in a TTY environment
   * @returns {boolean} True if TTY (interactive terminal)
   */
  isTTY() {
    return Boolean(this.input.isTTY && this.output.isTTY)
  }

  /**
   * Ask a single question and get user input
   * @param {string} question - The question to ask
   * @returns {Promise<string>} User's answer
   */
  async ask(question) {
    if (!this.isTTY()) {
      throw new Error('Interactive mode requires a TTY environment')
    }

    return new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: this.input,
        output: this.output,
      })

      rl.question(question, answer => {
        rl.close()
        resolve(answer.trim())
      })

      rl.on('SIGINT', () => {
        rl.close()
        reject(new Error('User cancelled interactive mode'))
      })
    })
  }

  /**
   * Ask a yes/no question
   * @param {string} question - The question to ask
   * @param {boolean} defaultValue - Default value if user just presses Enter
   * @returns {Promise<boolean>} True for yes, false for no
   */
  async confirm(question, defaultValue = false) {
    const defaultHint = defaultValue ? ' [Y/n]' : ' [y/N]'
    const answer = await this.ask(question + defaultHint + ' ')

    if (answer === '') {
      return defaultValue
    }

    const normalized = answer.toLowerCase()
    return normalized === 'y' || normalized === 'yes'
  }

  /**
   * Present a multiple choice question
   * @param {string} question - The question to ask
   * @param {Array<{value: string, label: string}>} choices - Available choices
   * @returns {Promise<string>} Selected choice value
   */
  async select(question, choices) {
    const choiceList = choices
      .map((choice, index) => `  ${index + 1}) ${choice.label}`)
      .join('\n')

    const fullQuestion = `${question}\n${choiceList}\n\nEnter your choice (1-${choices.length}): `
    const answer = await this.ask(fullQuestion)

    const choiceIndex = parseInt(answer, 10) - 1
    if (
      isNaN(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= choices.length
    ) {
      throw new Error(
        `Invalid choice: ${answer}. Please enter a number between 1 and ${choices.length}`
      )
    }

    return choices[choiceIndex].value
  }

  /**
   * Present a multi-select question (checkboxes)
   * @param {string} question - The question to ask
   * @param {Array<{value: string, label: string}>} choices - Available choices
   * @returns {Promise<Array<string>>} Array of selected choice values
   */
  async multiSelect(question, choices) {
    const choiceList = choices
      .map((choice, index) => `  ${index + 1}) ${choice.label}`)
      .join('\n')

    const fullQuestion =
      `${question}\n${choiceList}\n\n` +
      `Enter your choices (comma-separated, e.g., "1,3,5" or press Enter for none): `

    const answer = await this.ask(fullQuestion)

    if (answer === '') {
      return []
    }

    const selections = answer
      .split(',')
      .map(s => s.trim())
      .map(s => parseInt(s, 10) - 1)
      .filter(index => !isNaN(index) && index >= 0 && index < choices.length)

    return selections.map(index => choices[index].value)
  }
}

module.exports = { InteractivePrompt }
