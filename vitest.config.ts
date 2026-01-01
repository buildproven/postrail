import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/*.spec.ts'],
    env: {
      COOKIE_SECRET: 'test-cookie-secret-for-hmac-signing',
    },
    // Performance: use threads with max parallelism
    pool: 'threads',
    maxConcurrency: 10,
    maxWorkers: 4,
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'app/api/**/*.{ts,tsx}', // Only API routes, not pages
        'lib/**/*.{ts,tsx}', // All lib code
        'components/**/*.{ts,tsx}', // All components
      ],
      exclude: [
        'tests/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/node_modules/**',
        '**/*.config.{ts,js}',
        '**/types/**',
        'app/(auth)/**', // Exclude auth pages
        'app/(dashboard)/**', // Exclude dashboard pages
        'app/layout.tsx', // Exclude root layout
        'app/page.tsx', // Exclude home page
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
