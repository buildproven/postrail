# Test Performance Optimization Strategy

## Current Performance Analysis

**Total Test Time**: ~30+ seconds for full suite
**Major Bottlenecks**:
- Crypto operations: 10.17s (real encryption/decryption)
- Browser tests: 7.57s (real DOM rendering)
- Network tests: 3.55s (real HTTP requests)
- Component tests: 1.4s+ (React mounting)

## Three-Tier Test Strategy

### 🚀 Tier 1: Fast Pre-Commit (< 5 seconds)
**Purpose**: Immediate feedback on common issues
**Triggers**: `git commit` via Husky pre-commit hook

```bash
# .husky/pre-commit
npx --no -- lint-staged  # Only staged files
```

**What Runs**:
- ESLint (staged files only)
- Prettier check (staged files only)
- TypeScript compilation check
- **No tests** - just linting and formatting

### ⚡ Tier 2: Medium Pre-Push (< 15 seconds)
**Purpose**: Core functionality validation before sharing
**Triggers**: `git push` via Husky pre-push hook

```bash
# .husky/pre-push-optimized
echo "🧪 Running core tests..."
npm run test:fast || {
  echo "❌ Core tests failed! Fix failing tests before pushing."
  exit 1
}
```

**New npm Scripts**:
```json
{
  "test:fast": "vitest run --exclude='**/*.{real,crypto,browser}.test.{ts,tsx}'",
  "test:unit-only": "vitest run tests/lib tests/api --exclude='**/*.real.test.ts'",
  "test:smoke-only": "vitest run tests/smoke"
}
```

**What Runs**:
- Unit tests with mocks (~300 tests in <10s)
- API tests with mocked dependencies
- Smoke/deployment tests
- **Excludes**: `.real.test.ts`, crypto, browser tests

### 🔄 Tier 3: Full CI/CD (30+ seconds)
**Purpose**: Comprehensive validation before production
**Triggers**: GitHub Actions on PR/merge to main

```yaml
# .github/workflows/comprehensive-tests.yml
- name: Full Test Suite
  run: |
    npm run test:all
    npm run test:e2e
```

**What Runs**:
- Complete test suite including:
  - Real crypto operations
  - Real browser testing
  - Real network requests
  - Integration tests
  - E2E tests

## File Organization by Speed

### Fast Tests (Keep in pre-push)
```
tests/
├── api/
│   ├── generate-posts.test.ts      # Mocked
│   ├── scrape.test.ts              # Mocked
│   └── twitter-connect.test.ts     # Mocked
├── lib/
│   ├── rbac.test.ts                # Fast unit tests
│   └── supabase/                   # Mocked clients
└── smoke/
    └── deployment.test.ts          # Fast config checks
```

### Slow Tests (CI/CD only)
```
tests/
├── api/
│   ├── *.real.test.ts              # Real HTTP requests
│   └── scrape.real.test.ts         # 3.5+ seconds
├── lib/
│   └── crypto.test.ts              # 10+ seconds
├── components/
│   └── *.real.test.tsx             # Browser rendering
└── integration/
    └── *.test.ts                   # Full flows
```

## Performance Optimizations

### 1. Crypto Test Optimization
**Problem**: Real encryption taking 10+ seconds
**Solution**: Mock crypto operations in fast tests, real tests in CI only

```typescript
// tests/lib/crypto.fast.test.ts (new file)
vi.mock('@/lib/crypto', () => ({
  encrypt: vi.fn().mockResolvedValue('mock-encrypted'),
  decrypt: vi.fn().mockResolvedValue('mock-decrypted')
}))
```

### 2. Browser Test Optimization
**Problem**: TwitterSetupGuide taking 7+ seconds
**Solution**: Split into fast unit tests + slow integration tests

```typescript
// tests/components/TwitterSetupGuide.unit.test.tsx (new)
// Fast: Test component logic without full DOM rendering

// tests/components/TwitterSetupGuide.real.test.tsx (existing)
// Slow: Full browser testing in CI only
```

### 3. Network Test Optimization
**Problem**: Real HTTP requests taking 3+ seconds
**Solution**: Comprehensive mocking for fast tests

```typescript
// tests/api/scrape.test.ts (existing - keep mocked)
// tests/api/scrape.real.test.ts (existing - CI only)
```

## Implementation Steps

### Step 1: Reorganize Package.json Scripts
```json
{
  "scripts": {
    "test": "npm run test:fast",
    "test:fast": "vitest run --exclude='**/*.{real,crypto,e2e}.test.{ts,tsx}' --exclude='tests/lib/crypto.test.ts'",
    "test:medium": "npm run test:fast && npm run test:smoke",
    "test:slow": "vitest run tests/lib/crypto.test.ts tests/**/*.real.test.ts",
    "test:all": "vitest run",
    "test:ci": "npm run test:all && npm run test:e2e"
  }
}
```

### Step 2: Update Husky Hooks
```bash
# .husky/pre-push
echo "⚡ Running optimized pre-push tests..."
npm run test:medium || {
  echo "❌ Tests failed! Run 'npm run test:all' locally for full validation."
  exit 1
}
```

### Step 3: GitHub Actions Workflow
- Fast tests on PR creation (< 15 seconds)
- Full tests on PR merge (30+ seconds)
- Crypto/browser tests only in CI environment

## Expected Performance Improvements

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| Pre-commit | 30s+ | 2s | **15x faster** |
| Pre-push | 30s+ | 12s | **2.5x faster** |
| CI/CD | 30s+ | 35s | Comprehensive |

## Monitoring

Track test performance with:
```bash
# Add to package.json
"test:perf": "time npm run test:fast",
"test:breakdown": "vitest run --reporter=verbose | grep -E '(✓|✗).*[0-9]+ms'"
```

This strategy provides:
- ✅ **Immediate feedback** for developers (< 5s)
- ✅ **Confidence before pushing** (< 15s)
- ✅ **Comprehensive validation** in CI/CD (full suite)
- ✅ **No compromises** on test coverage