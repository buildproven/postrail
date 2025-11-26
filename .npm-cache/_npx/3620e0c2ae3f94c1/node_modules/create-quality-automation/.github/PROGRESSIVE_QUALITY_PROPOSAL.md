# Progressive Quality Automation - Design Proposal

## Problem Statement

Early-stage projects often fail CI/CD quality checks not because of code quality issues, but because project assets haven't been created yet:

- **ESLint** fails when there are no source files to lint
- **Test coverage** fails when test infrastructure doesn't exist
- **Documentation validation** fails when docs aren't written
- **Security audits** fail on empty `package.json` with no dependencies
- **Lighthouse CI** fails when no web assets exist

This creates noise, discourages adoption, and makes it unclear which failures are "real" vs. expected.

## Proposed Solution: Adaptive Quality Checks

### Strategy 1: Project Maturity Detection

Automatically detect project maturity level and adjust checks accordingly.

#### Maturity Levels

```javascript
{
  "minimal": {
    // Just package.json, maybe README
    "indicators": ["package.json exists", "< 5 total files", "no src/ or lib/"],
    "checks": ["prettier", "basic-lint"]
  },

  "bootstrap": {
    // Has some source files, no tests yet
    "indicators": ["src/ or lib/ exists", "< 3 source files", "no test files"],
    "checks": ["prettier", "eslint", "stylelint", "format-check"]
  },

  "development": {
    // Active development, has tests
    "indicators": ["≥ 3 source files", "test files exist", "has dependencies"],
    "checks": ["all linting", "security-basic", "documentation-basic"]
  },

  "production-ready": {
    // Full project with tests, docs, dependencies
    "indicators": ["has tests", "has docs", "has CI config", "≥ 10 source files"],
    "checks": ["all checks enabled"]
  }
}
```

#### Implementation Example

```javascript
// lib/project-maturity.js
class ProjectMaturityDetector {
  detect(projectPath) {
    const stats = this.analyzeProject(projectPath)

    if (stats.totalSourceFiles === 0) return 'minimal'
    if (stats.totalSourceFiles < 3 && stats.testFiles === 0) return 'bootstrap'
    if (stats.testFiles > 0 && stats.totalSourceFiles >= 3) return 'development'
    if (
      stats.hasDocumentation &&
      stats.hasTests &&
      stats.totalSourceFiles >= 10
    ) {
      return 'production-ready'
    }

    return 'development' // default
  }

  analyzeProject(projectPath) {
    return {
      totalSourceFiles: this.countSourceFiles(projectPath),
      testFiles: this.countTestFiles(projectPath),
      hasDocumentation: this.hasDocumentation(projectPath),
      hasTests: this.hasTests(projectPath),
      hasDependencies: this.hasDependencies(projectPath),
    }
  }
}
```

### Strategy 2: Graceful Check Degradation

Each check should gracefully handle "nothing to check" scenarios.

#### Current State

```yaml
# ❌ FAILS on empty projects
- name: ESLint
  run: npx eslint . --max-warnings=0
```

#### Proposed Improvement

```yaml
# ✅ PASSES on empty projects with informative message
- name: ESLint
  run: |
    # Count source files
    SOURCE_COUNT=$(find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/.git/*" | wc -l)

    if [ "$SOURCE_COUNT" -eq 0 ]; then
      echo "⏭️ No source files found - skipping ESLint"
      echo "This is expected for new projects. Add source files to enable linting."
      exit 0
    fi

    echo "🔍 Linting $SOURCE_COUNT source files..."
    npx eslint . --max-warnings=0
```

### Strategy 3: Progressive Enablement Configuration

Add a `.qualityrc.json` file that tracks which checks are "ready" for the project.

```json
{
  "version": "1.0",
  "maturity": "auto",
  "checks": {
    "prettier": { "enabled": true, "required": true },
    "eslint": { "enabled": "auto", "required": false },
    "stylelint": { "enabled": "auto", "required": false },
    "tests": { "enabled": false, "required": false },
    "coverage": { "enabled": false, "required": false, "threshold": 80 },
    "security-audit": { "enabled": "auto", "required": false },
    "documentation": { "enabled": false, "required": false },
    "lighthouse": { "enabled": false, "required": false }
  },
  "auto-enable": {
    "eslint": { "when": "sourceFiles >= 1" },
    "tests": { "when": "testFiles >= 1" },
    "coverage": { "when": "testFiles >= 3" },
    "security-audit": { "when": "dependencies >= 1" },
    "documentation": { "when": "docs/ exists OR README.md >= 100 lines" }
  }
}
```

### Strategy 4: Smart GitHub Actions Workflow

Update `quality.yml` to use maturity detection:

```yaml
name: Quality Checks

on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]

jobs:
  detect-maturity:
    runs-on: ubuntu-latest
    outputs:
      maturity: ${{ steps.detect.outputs.maturity }}
      source-count: ${{ steps.detect.outputs.source-count }}
      test-count: ${{ steps.detect.outputs.test-count }}
      has-deps: ${{ steps.detect.outputs.has-deps }}

    steps:
      - uses: actions/checkout@v5

      - name: Detect Project Maturity
        id: detect
        run: |
          # Count source files
          SOURCE_COUNT=$(find . -type f \( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" ! -path "*/.git/*" | wc -l)

          # Count test files
          TEST_COUNT=$(find . -type f \( -name "*.test.js" -o -name "*.test.ts" -o -name "*.spec.js" -o -name "*.spec.ts" \) ! -path "*/node_modules/*" | wc -l)

          # Check for dependencies
          HAS_DEPS="false"
          if [ -f package.json ] && grep -q '"dependencies"' package.json; then
            HAS_DEPS="true"
          fi

          # Determine maturity
          MATURITY="minimal"
          if [ "$SOURCE_COUNT" -ge 10 ] && [ "$TEST_COUNT" -ge 3 ]; then
            MATURITY="production-ready"
          elif [ "$SOURCE_COUNT" -ge 3 ] && [ "$TEST_COUNT" -ge 1 ]; then
            MATURITY="development"
          elif [ "$SOURCE_COUNT" -ge 1 ]; then
            MATURITY="bootstrap"
          fi

          echo "maturity=$MATURITY" >> $GITHUB_OUTPUT
          echo "source-count=$SOURCE_COUNT" >> $GITHUB_OUTPUT
          echo "test-count=$TEST_COUNT" >> $GITHUB_OUTPUT
          echo "has-deps=$HAS_DEPS" >> $GITHUB_OUTPUT

          echo "📊 Project Maturity: $MATURITY"
          echo "   Source files: $SOURCE_COUNT"
          echo "   Test files: $TEST_COUNT"
          echo "   Has dependencies: $HAS_DEPS"

  # Core checks - ALWAYS run (project must pass these)
  core-checks:
    runs-on: ubuntu-latest
    needs: detect-maturity

    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci || npm install

      - name: Prettier check
        run: npm run format:check

  # Linting checks - run if source files exist
  linting:
    runs-on: ubuntu-latest
    needs: detect-maturity
    if: needs.detect-maturity.outputs.source-count > 0

    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci || npm install

      - name: ESLint
        run: npx eslint . --max-warnings=0

      - name: Stylelint
        run: npx stylelint "**/*.{css,scss,sass,less,pcss}" --allow-empty-input

  # Security checks - run if dependencies exist
  security:
    runs-on: ubuntu-latest
    needs: detect-maturity
    if: needs.detect-maturity.outputs.has-deps == 'true'

    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci || npm install

      - name: Security audit
        run: npm audit --audit-level high

      - name: Check for hardcoded secrets
        run: |
          # ... existing secret detection logic

  # Test checks - run if test files exist
  tests:
    runs-on: ubuntu-latest
    needs: detect-maturity
    if: needs.detect-maturity.outputs.test-count > 0

    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci || npm install

      - name: Run tests
        run: npm test

  # Advanced checks - only for production-ready projects
  advanced:
    runs-on: ubuntu-latest
    needs: detect-maturity
    if: needs.detect-maturity.outputs.maturity == 'production-ready'

    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci || npm install

      - name: Documentation validation
        run: npx create-quality-automation@latest --validate-docs

      - name: Lighthouse CI
        if: hashFiles('.lighthouserc.js', '.lighthouserc.json', 'lighthouserc.js') != ''
        run: npx lhci autorun
        continue-on-error: true
```

## Implementation Plan

### Phase 1: Foundation (Week 1)

1. **Create `lib/project-maturity.js`**
   - Implement maturity detection logic
   - Add source file counting
   - Add test file counting
   - Add dependency detection

2. **Create `.qualityrc.json` template**
   - Define configuration schema
   - Add to setup.js output
   - Document usage

3. **Add CLI command for maturity check**
   ```bash
   npx create-quality-automation@latest --check-maturity
   ```

### Phase 2: Workflow Updates (Week 2)

1. **Update `.github/workflows/quality.yml`**
   - Add `detect-maturity` job
   - Split checks into conditional jobs
   - Add informative skip messages

2. **Update pre-commit hooks**
   - Add graceful degradation to lint-staged
   - Skip checks with no files to process

3. **Add setup.js option for maturity level**
   ```bash
   npx create-quality-automation@latest --maturity=minimal
   npx create-quality-automation@latest --maturity=auto  # default
   ```

### Phase 3: Documentation & Testing (Week 3)

1. **Create test fixtures**
   - Minimal project (just package.json)
   - Bootstrap project (1-2 source files, no tests)
   - Development project (source + tests)
   - Production-ready project (full setup)

2. **Integration tests**
   - Test each maturity level
   - Verify correct checks run
   - Verify graceful skipping

3. **Update documentation**
   - Add PROGRESSIVE_QUALITY.md guide
   - Update CLAUDE.md with new approach
   - Add examples to README

## Benefits

### For New Projects

- **No false failures** - Checks only run when there's something to check
- **Clear progression** - Developers see which checks will activate as they add files
- **Less noise** - CI/CD stays green during early development

### For Existing Projects

- **Backward compatible** - Auto-detection means no config changes needed
- **Opt-in strictness** - Can set `maturity: "production-ready"` to force all checks
- **Gradual adoption** - Can enable checks one at a time via `.qualityrc.json`

### For Maintainers

- **Better UX** - Reduces confusion and support requests
- **Professional polish** - Shows thoughtful design
- **Competitive advantage** - Most quality tools don't have this

## Alternative Approaches Considered

### 1. Manual Check Enablement

**Approach**: Require users to manually enable each check via config.

**Pros**: Complete control, no magic

**Cons**: Requires configuration burden, easy to forget checks, poor DX

**Decision**: Rejected - Auto-detection is better UX

### 2. Warning-Only Mode

**Approach**: Run all checks but return warnings instead of errors for early projects.

**Pros**: Simple implementation

**Cons**: Still creates noise, unclear which warnings matter, pollutes CI logs

**Decision**: Rejected - Clean skips are clearer than warnings

### 3. Time-Based Activation

**Approach**: Enable checks based on project age (e.g., full checks after 30 days).

**Pros**: Automatic progression

**Cons**: Arbitrary, doesn't reflect actual project state, can't work for fast-paced projects

**Decision**: Rejected - File-based detection is more accurate

## Open Questions

1. **Should we add a "learning mode"?**
   - First 10 commits run checks but don't block?
   - Could help teams understand what's needed

2. **Should maturity level be visible in PR checks?**
   - Add a badge showing current maturity?
   - "This project is in BOOTSTRAP mode - 2/10 checks active"

3. **Should we auto-upgrade maturity?**
   - When test files are added, auto-enable test checks?
   - Or require explicit opt-in via `.qualityrc.json`?

4. **How to handle monorepos?**
   - Detect maturity per package?
   - Or at root level?

## Next Steps

1. **User Feedback** - Gather feedback on this proposal
2. **Prototype** - Build Phase 1 implementation
3. **Test** - Validate with real projects at different maturity levels
4. **Iterate** - Refine based on testing
5. **Release** - Ship as v3.2.0 with full documentation

---

**Author**: Claude (AI Assistant)
**Date**: 2025-11-19
**Status**: PROPOSAL - Awaiting feedback
