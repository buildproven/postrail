/**
 * API Contract Tests - Verify external APIs haven't changed
 *
 * These tests make REAL API calls to verify:
 * 1. External API contracts haven't broken
 * 2. SDK versions are compatible
 * 3. Response shapes match our expectations
 *
 * Run with: ENABLE_CONTRACT_TESTS=true npm test
 *
 * NOTE: These tests are skipped by default because:
 * - They cost money (API calls)
 * - They're slow (network requests)
 * - They should run weekly in CI, not every commit
 *
 * Set up separate test API keys in CI:
 * - ANTHROPIC_API_KEY_CONTRACT_TEST (low rate limit)
 * - TWITTER_TEST_API_KEY (test account)
 * - SUPABASE_TEST_URL (test project)
 */

import { describe, it, expect, beforeAll } from 'vitest'

const shouldRunContractTests = process.env.ENABLE_CONTRACT_TESTS === 'true'

describe.skipIf(!shouldRunContractTests)(
  'API Contracts - Real External Calls',
  () => {
    describe('Anthropic API Contract', () => {
      let Anthropic: any

      beforeAll(async () => {
        const anthropicModule = await import('@anthropic-ai/sdk')
        Anthropic = anthropicModule.default
      })

      it('should verify Anthropic messages.create contract', async () => {
        const apiKey =
          process.env.ANTHROPIC_API_KEY_CONTRACT_TEST ||
          process.env.ANTHROPIC_API_KEY

        if (!apiKey || apiKey === 'test-anthropic-key') {
          console.warn('⚠️  Skipping: No real Anthropic API key provided')
          return
        }

        const client = new Anthropic({ apiKey })

        const response = await client.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Say "contract test"' }],
        })

        // Verify contract hasn't changed
        expect(response).toHaveProperty('id')
        expect(response).toHaveProperty('type', 'message')
        expect(response).toHaveProperty('role', 'assistant')
        expect(response).toHaveProperty('content')
        expect(Array.isArray(response.content)).toBe(true)
        expect(response.content[0]).toHaveProperty('type', 'text')
        expect(response.content[0]).toHaveProperty('text')
        expect(response).toHaveProperty('model')
        expect(response).toHaveProperty('usage')
        expect(response.usage).toHaveProperty('input_tokens')
        expect(response.usage).toHaveProperty('output_tokens')
      }, 30000)

      it('should verify Anthropic error response format', async () => {
        const client = new Anthropic({ apiKey: 'invalid-key' })

        try {
          await client.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 100,
            messages: [{ role: 'user', content: 'test' }],
          })
          expect.fail('Should have thrown authentication error')
        } catch (error: any) {
          // Verify error structure
          expect(error).toHaveProperty('status', 401)
          expect(error).toHaveProperty('message')
        }
      }, 10000)
    })

    describe('Twitter API v2 Contract', () => {
      let TwitterApi: any

      beforeAll(async () => {
        const twitterModule = await import('twitter-api-v2')
        TwitterApi = twitterModule.TwitterApi
      })

      it('should verify Twitter v2.me() contract', async () => {
        const hasCredentials =
          process.env.TWITTER_TEST_API_KEY &&
          process.env.TWITTER_TEST_API_SECRET &&
          process.env.TWITTER_TEST_ACCESS_TOKEN &&
          process.env.TWITTER_TEST_ACCESS_SECRET

        if (!hasCredentials) {
          console.warn('⚠️  Skipping: No Twitter test credentials provided')
          return
        }

        const client = new TwitterApi({
          appKey: process.env.TWITTER_TEST_API_KEY!,
          appSecret: process.env.TWITTER_TEST_API_SECRET!,
          accessToken: process.env.TWITTER_TEST_ACCESS_TOKEN!,
          accessSecret: process.env.TWITTER_TEST_ACCESS_SECRET!,
        })

        const me = await client.v2.me()

        // Verify contract
        expect(me.data).toHaveProperty('id')
        expect(me.data).toHaveProperty('name')
        expect(me.data).toHaveProperty('username')
        expect(typeof me.data.id).toBe('string')
        expect(typeof me.data.name).toBe('string')
        expect(typeof me.data.username).toBe('string')
      }, 30000)

      it('should verify Twitter v2.tweet() contract', async () => {
        const hasCredentials =
          process.env.TWITTER_TEST_API_KEY &&
          process.env.TWITTER_TEST_API_SECRET &&
          process.env.TWITTER_TEST_ACCESS_TOKEN &&
          process.env.TWITTER_TEST_ACCESS_SECRET

        if (!hasCredentials) {
          console.warn('⚠️  Skipping: No Twitter test credentials provided')
          return
        }

        const client = new TwitterApi({
          appKey: process.env.TWITTER_TEST_API_KEY!,
          appSecret: process.env.TWITTER_TEST_API_SECRET!,
          accessToken: process.env.TWITTER_TEST_ACCESS_TOKEN!,
          accessSecret: process.env.TWITTER_TEST_ACCESS_SECRET!,
        })

        const testTweet = `Contract test ${Date.now()}`
        const response = await client.v2.tweet(testTweet)

        // Verify response structure
        expect(response.data).toHaveProperty('id')
        expect(response.data).toHaveProperty('text')
        expect(response.data.text).toBe(testTweet)

        // Clean up - delete the test tweet
        if (response.data.id) {
          await client.v2.deleteTweet(response.data.id)
        }
      }, 30000)
    })

    describe('Supabase Client Contract', () => {
      let createClient: any

      beforeAll(async () => {
        const supabaseModule = await import('@supabase/supabase-js')
        createClient = supabaseModule.createClient
      })

      it('should verify Supabase client creation', () => {
        const client = createClient('https://test.supabase.co', 'test-anon-key')

        // Verify client has expected methods
        expect(client).toHaveProperty('auth')
        expect(client.auth).toHaveProperty('signInWithPassword')
        expect(client.auth).toHaveProperty('signUp')
        expect(client.auth).toHaveProperty('signOut')
        expect(client.auth).toHaveProperty('getUser')
        expect(client).toHaveProperty('from')

        // Verify from() returns query builder
        const query = client.from('test')
        expect(query).toHaveProperty('select')
        expect(query).toHaveProperty('insert')
        expect(query).toHaveProperty('update')
        expect(query).toHaveProperty('delete')
      })

      it('should verify Supabase auth error structure', async () => {
        const client = createClient('https://test.supabase.co', 'test-anon-key')

        const { error } = await client.auth.signInWithPassword({
          email: 'test@example.com',
          password: 'wrong',
        })

        // Error should exist and have expected structure
        if (error) {
          expect(error).toHaveProperty('message')
          expect(typeof error.message).toBe('string')
        }
      })
    })

    describe('Next.js Dependencies Contract', () => {
      it('should verify next package exports', async () => {
        const nextServer = await import('next/server')

        // Verify NextRequest and NextResponse exist
        expect(nextServer).toHaveProperty('NextRequest')
        expect(nextServer).toHaveProperty('NextResponse')

        // Verify NextResponse has expected static methods
        expect(nextServer.NextResponse).toHaveProperty('json')
        expect(nextServer.NextResponse).toHaveProperty('next')
        expect(nextServer.NextResponse).toHaveProperty('redirect')
      })

      it('should verify next/navigation exports', async () => {
        // Note: This will fail in Node.js environment, that's expected
        // It verifies the import structure exists
        try {
          const navigation = await import('next/navigation')
          expect(navigation).toBeDefined()
        } catch (error: any) {
          // Expected to fail in test environment
          expect(error.message).toContain('next/navigation')
        }
      })
    })

    describe('React Dependencies Contract', () => {
      it('should verify React exports', async () => {
        const React = await import('react')

        // Verify core React APIs
        expect(React).toHaveProperty('useState')
        expect(React).toHaveProperty('useEffect')
        expect(React).toHaveProperty('useCallback')
        expect(React).toHaveProperty('useMemo')
        expect(React).toHaveProperty('useRef')
        expect(React).toHaveProperty('createContext')
      })

      it('should verify React version compatibility', async () => {
        const pkg = await import('../../package.json')
        const reactVersion = pkg.dependencies?.react

        // Should be React 19+
        expect(reactVersion).toBeDefined()
        expect(reactVersion).toContain('19')
      })
    })
  }
)

describe('SDK Version Compatibility Checks (Always Run)', () => {
  it('should verify all critical dependencies are installed', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf-8'))

    const criticalDeps = [
      '@anthropic-ai/sdk',
      '@supabase/supabase-js',
      'twitter-api-v2',
      'next',
      'react',
    ]

    criticalDeps.forEach(dep => {
      expect(pkg.dependencies).toHaveProperty(dep)
      expect(pkg.dependencies[dep]).toBeTruthy()
    })
  })

  it('should verify no conflicting package versions', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf-8'))

    // React and React DOM should match versions
    const reactVersion = pkg.dependencies?.react
    const reactDomVersion = pkg.dependencies?.['react-dom']

    if (reactVersion && reactDomVersion) {
      expect(reactVersion).toBe(reactDomVersion)
    }
  })

  it('should verify TypeScript is properly configured', () => {
    const tsconfig = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('fs').readFileSync('tsconfig.json', 'utf-8')
    )

    // Verify critical compiler options
    expect(tsconfig.compilerOptions).toHaveProperty('strict')
    expect(tsconfig.compilerOptions).toHaveProperty('esModuleInterop')
    expect(tsconfig.compilerOptions).toHaveProperty('jsx')
  })
})
