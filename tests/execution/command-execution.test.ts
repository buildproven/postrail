/**
 * Command Execution Tests - Verify npm scripts actually work in isolation
 *
 * Based on: https://github.com/brettstark73/create-qa-architect/.../TEST_STRATEGY_AUDIT.md
 *
 * Key insight: "Your tests verify that configurations exist, but don't verify they actually work"
 *
 * These tests run commands in isolated temporary directories to catch:
 * - Broken ESLint configs (like the 12,258 test project that missed a deprecated flag)
 * - Build failures in fresh environments
 * - Missing dependencies
 * - Deprecated CLI flags
 */

import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Command Execution - Isolated Environment', () => {
  /**
   * Creates an isolated test environment by copying project to temp directory
   */
  function createIsolatedEnv(): string {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postrail-test-'))

    // Copy essential configuration files
    const filesToCopy = [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'next.config.ts',
      'tailwind.config.ts',
      'postcss.config.mjs',
      'eslint.config.cjs',
      'eslint.config.mjs',
      '.eslintignore',
      'vitest.config.ts',
      '.prettierrc',
      '.prettierignore',
    ]

    filesToCopy.forEach(file => {
      if (fs.existsSync(file)) {
        fs.copyFileSync(file, path.join(tmpDir, file))
      }
    })

    // Copy source directories
    const dirsToCopy = ['app', 'components', 'lib', 'tests', 'e2e']
    dirsToCopy.forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.cpSync(dir, path.join(tmpDir, dir), { recursive: true })
      }
    })

    return tmpDir
  }

  /**
   * Installs dependencies in isolated environment
   */
  function installDependencies(tmpDir: string): void {
    execSync('npm ci --prefer-offline --no-audit', {
      cwd: tmpDir,
      stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'test' },
    })
  }

  it('should run npm run lint successfully in fresh directory', async () => {
    const tmpDir = createIsolatedEnv()

    try {
      installDependencies(tmpDir)

      // Run lint - THIS is the actual test
      const output = execSync('npm run lint', {
        cwd: tmpDir,
        encoding: 'utf-8',
        env: { ...process.env, CI: 'true' },
      })

      // Verify no errors
      expect(output).not.toContain('✖')
      expect(output).not.toContain('error')
    } finally {
      // Cleanup
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 180000) // 3 minute timeout for npm install + lint

  it('should run npm run format:check successfully', async () => {
    const tmpDir = createIsolatedEnv()

    try {
      installDependencies(tmpDir)

      // Run format check
      execSync('npm run format:check', {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      })

      // If we get here, formatting passed (throws on failure)
      expect(true).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 180000)

  it('should run npm test successfully in isolation', async () => {
    const tmpDir = createIsolatedEnv()

    try {
      installDependencies(tmpDir)

      // Run tests
      const output = execSync('npm test', {
        cwd: tmpDir,
        encoding: 'utf-8',
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
          ANTHROPIC_API_KEY: 'test-anthropic-key',
        },
      })

      // Verify tests passed
      expect(output).toContain('PASS')
      expect(output).not.toContain('FAIL')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 240000) // 4 minutes for npm install + tests

  it('should verify lint:fix command works without breaking code', async () => {
    const tmpDir = createIsolatedEnv()

    try {
      installDependencies(tmpDir)

      // Run lint:fix
      execSync('npm run lint:fix', {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: 'pipe',
      })

      // Verify files are still valid TypeScript
      const testFile = path.join(tmpDir, 'app/page.tsx')
      if (fs.existsSync(testFile)) {
        const content = fs.readFileSync(testFile, 'utf-8')
        expect(content.length).toBeGreaterThan(0)
        // Should still have valid React/Next.js structure
        expect(content).toContain('export default')
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 180000)

  it('should verify package.json scripts are all valid commands', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    const scripts = pkg.scripts

    // Verify critical scripts exist
    const requiredScripts = [
      'dev',
      'build',
      'start',
      'lint',
      'test',
      'format',
      'format:check',
    ]

    requiredScripts.forEach(script => {
      expect(scripts).toHaveProperty(script)
      expect(scripts[script]).toBeTruthy()
      expect(typeof scripts[script]).toBe('string')
    })
  })

  it('should verify all scripts use valid npm/node commands', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    const scripts = pkg.scripts

    // Check for common mistakes
    Object.values(scripts).forEach(command => {
      // Should not have undefined variables
      expect(command).not.toContain('undefined')
      expect(command).not.toContain('$undefined')

      // Should not have syntax errors like unclosed quotes
      const quoteCount = (command as string).split('"').length - 1
      expect(quoteCount % 2).toBe(0) // Even number of quotes
    })
  })
})

describe('Build Command - Production Readiness', () => {
  it('should build production bundle without errors', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postrail-build-'))

    try {
      // Copy project
      const filesToCopy = [
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'next.config.ts',
        'tailwind.config.ts',
        'postcss.config.mjs',
      ]

      filesToCopy.forEach(file => {
        if (fs.existsSync(file)) {
          fs.copyFileSync(file, path.join(tmpDir, file))
        }
      })

      const dirsToCopy = ['app', 'components', 'lib', 'public']
      dirsToCopy.forEach(dir => {
        if (fs.existsSync(dir)) {
          fs.cpSync(dir, path.join(tmpDir, dir), { recursive: true })
        }
      })

      // Install and build
      execSync('npm ci --prefer-offline --no-audit', {
        cwd: tmpDir,
        stdio: 'pipe',
      })

      execSync('npm run build', {
        cwd: tmpDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        },
      })

      // Verify .next directory exists with expected structure
      expect(fs.existsSync(path.join(tmpDir, '.next'))).toBe(true)
      expect(fs.existsSync(path.join(tmpDir, '.next/server'))).toBe(true)

      // Verify build created static files
      const nextDir = path.join(tmpDir, '.next')
      const files = fs.readdirSync(nextDir)
      expect(files.length).toBeGreaterThan(0)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  }, 300000) // 5 minutes for build
})
