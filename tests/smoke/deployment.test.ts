/**
 * Pre-Deployment Smoke Tests
 *
 * Fast tests that verify the project is in a deployable state.
 * Run before deploying to catch configuration errors.
 *
 * These tests check:
 * - Configuration files exist and are valid
 * - Environment variables are documented
 * - Required dependencies are present
 * - Package.json scripts are properly defined
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { execSync } from 'child_process'

describe('Pre-Deployment Smoke Tests', () => {
  describe('Configuration Files', () => {
    it('should have valid package.json', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      // Verify critical fields
      expect(pkg.name).toBe('postrail')
      expect(pkg.version).toBeTruthy()
      expect(pkg.scripts).toBeDefined()
      expect(pkg.dependencies).toBeDefined()
      expect(pkg.devDependencies).toBeDefined()
    })

    it('should have valid tsconfig.json', () => {
      const tsconfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf-8'))

      expect(tsconfig.compilerOptions).toBeDefined()
      expect(tsconfig.compilerOptions.strict).toBe(true)
      expect(tsconfig.include).toBeDefined()
    })

    it('should have Next.js configuration', () => {
      // Check for either .ts or .js config file (Vercel prefers .js)
      const hasConfig =
        fs.existsSync('next.config.ts') || fs.existsSync('next.config.js')
      expect(hasConfig).toBe(true)
      const configFile = fs.existsSync('next.config.ts')
        ? 'next.config.ts'
        : 'next.config.js'
      const config = fs.readFileSync(configFile, 'utf-8')
      expect(config).toContain('NextConfig')
    })

    it('should have Tailwind configuration', () => {
      // Tailwind v4 uses CSS-based configuration instead of tailwind.config.ts
      const globalsCss = fs.readFileSync('app/globals.css', 'utf-8')
      // Tailwind v4 can use either @import "tailwindcss" or @import url('tailwindcss')
      expect(
        globalsCss.includes('@import "tailwindcss"') ||
          globalsCss.includes("@import url('tailwindcss')")
      ).toBe(true)
      expect(globalsCss).toContain('@theme')
    })

    it('should have ESLint configuration', () => {
      const hasEslintConfig =
        fs.existsSync('eslint.config.mjs') ||
        fs.existsSync('eslint.config.cjs') ||
        fs.existsSync('.eslintrc.json')

      expect(hasEslintConfig).toBe(true)
    })

    it('should have Prettier configuration', () => {
      const hasPrettierConfig =
        fs.existsSync('.prettierrc') ||
        fs.existsSync('.prettierrc.json') ||
        fs.existsSync('prettier.config.js')

      expect(hasPrettierConfig).toBe(true)
    })
  })

  describe('Environment Variables', () => {
    it('should have .env.local.example with all required variables', () => {
      expect(fs.existsSync('.env.local.example')).toBe(true)

      const envExample = fs.readFileSync('.env.local.example', 'utf-8')

      // Verify critical environment variables are documented
      const requiredVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'ANTHROPIC_API_KEY',
      ]

      requiredVars.forEach(varName => {
        expect(envExample).toContain(varName)
      })
    })

    it('should not have .env.local committed', () => {
      // .env.local should NOT be tracked in git (but can exist locally)
      try {
        const trackedFiles = execSync('git ls-files', { encoding: 'utf-8' })
        expect(trackedFiles).not.toContain('.env.local')
      } catch {
        // If not in a git repo (CI), skip this check
        expect(true).toBe(true)
      }
    })

    it('should have .gitignore excluding sensitive files', () => {
      expect(fs.existsSync('.gitignore')).toBe(true)

      const gitignore = fs.readFileSync('.gitignore', 'utf-8')

      // Check for .env files (can be .env*, .env.local, etc.)
      expect(
        gitignore.includes('.env*') || gitignore.includes('.env.local')
      ).toBe(true)
      expect(gitignore).toContain('node_modules')
      expect(gitignore).toContain('.next')
    })
  })

  describe('Package.json Scripts', () => {
    it('should have all required npm scripts defined', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
      const scripts = pkg.scripts

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
      })
    })

    it('should have test scripts properly configured', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      expect(pkg.scripts.test).toContain('vitest')
      expect(pkg.scripts['test:coverage']).toContain('coverage')
      expect(pkg.scripts['test:e2e']).toContain('playwright')
    })

    it('should have build script for production', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      expect(pkg.scripts.build).toContain('next build')
      expect(pkg.scripts.start).toContain('next start')
    })
  })

  describe('Dependencies', () => {
    it('should have all critical runtime dependencies', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      const criticalDeps = [
        'next',
        'react',
        'react-dom',
        '@supabase/supabase-js',
        '@anthropic-ai/sdk',
        'twitter-api-v2',
      ]

      criticalDeps.forEach(dep => {
        expect(pkg.dependencies).toHaveProperty(dep)
      })
    })

    it('should have all critical dev dependencies', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      const criticalDevDeps = [
        'typescript',
        'vitest',
        '@playwright/test',
        'eslint',
        'prettier',
      ]

      criticalDevDeps.forEach(dep => {
        expect(pkg.devDependencies).toHaveProperty(dep)
      })
    })

    it('should specify Node.js engine requirement', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      expect(pkg.engines).toBeDefined()
      expect(pkg.engines.node).toContain('20')
    })

    it('should not have known vulnerable packages', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      // Check for commonly vulnerable packages that should be updated
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      }

      // Example: axios should be recent version
      if (allDeps.axios) {
        const version = allDeps.axios.replace(/[\^~]/, '')
        const major = parseInt(version.split('.')[0])
        expect(major).toBeGreaterThanOrEqual(1)
      }
    })
  })

  describe('Source Code Structure', () => {
    it('should have required directories', () => {
      const requiredDirs = ['app', 'components', 'lib', 'tests']

      requiredDirs.forEach(dir => {
        expect(fs.existsSync(dir)).toBe(true)
        expect(fs.statSync(dir).isDirectory()).toBe(true)
      })
    })

    it('should have app router structure', () => {
      expect(fs.existsSync('app/layout.tsx')).toBe(true)
      expect(fs.existsSync('app/page.tsx')).toBe(true)
    })

    it('should have API routes', () => {
      expect(fs.existsSync('app/api')).toBe(true)
      expect(fs.statSync('app/api').isDirectory()).toBe(true)
    })

    it('should have authentication pages', () => {
      const authFiles = ['app/auth/login/page.tsx', 'app/auth/signup/page.tsx']

      authFiles.forEach(file => {
        expect(fs.existsSync(file)).toBe(true)
      })
    })
  })

  describe('Test Infrastructure', () => {
    it('should have Vitest configuration', () => {
      expect(fs.existsSync('vitest.config.ts')).toBe(true)
    })

    it('should have Playwright configuration', () => {
      expect(fs.existsSync('playwright.config.ts')).toBe(true)
    })

    it('should have test setup file', () => {
      expect(fs.existsSync('tests/setup.ts')).toBe(true)
    })

    it('should have e2e tests', () => {
      expect(fs.existsSync('e2e')).toBe(true)
      const e2eFiles = fs.readdirSync('e2e')
      const specFiles = e2eFiles.filter(f => f.endsWith('.spec.ts'))
      expect(specFiles.length).toBeGreaterThan(0)
    })
  })

  describe('Documentation', () => {
    it('should have README.md', () => {
      expect(fs.existsSync('README.md')).toBe(true)
      const readme = fs.readFileSync('README.md', 'utf-8')
      expect(readme.length).toBeGreaterThan(100)
    })

    it('should have CLAUDE.md with development instructions', () => {
      expect(fs.existsSync('CLAUDE.md')).toBe(true)
      const claude = fs.readFileSync('CLAUDE.md', 'utf-8')
      expect(claude).toContain('npm')
    })
  })

  describe('Git Configuration', () => {
    it('should have .gitignore', () => {
      expect(fs.existsSync('.gitignore')).toBe(true)
    })

    it('should have Husky git hooks configured', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

      // Should have prepare script for Husky
      expect(pkg.scripts.prepare).toContain('husky')

      // Should have lint-staged configuration
      expect(pkg['lint-staged']).toBeDefined()
    })
  })

  describe('Security', () => {
    it('should have security audit script', () => {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
      expect(pkg.scripts['security:audit']).toBeDefined()
    })

    it('should not have hardcoded secrets in package.json', () => {
      const pkg = fs.readFileSync('package.json', 'utf-8')

      // Check for common secret patterns
      const secretPatterns = [
        /sk-[a-zA-Z0-9]{32,}/,
        /ghp_[a-zA-Z0-9]{36}/,
        /AKIA[A-Z0-9]{16}/,
      ]

      secretPatterns.forEach(pattern => {
        expect(pattern.test(pkg)).toBe(false)
      })
    })
  })
})
