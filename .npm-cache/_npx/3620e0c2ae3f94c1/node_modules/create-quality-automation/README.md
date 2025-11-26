# Create Quality Automation 🚀

Bootstrap quality automation in JavaScript/TypeScript and Python projects with comprehensive tooling. Features GitHub Actions, pre-commit and pre-push hooks, lint-staged processing, security scanning, SEO validation, and freemium dependency monitoring with smart project detection.

## ✨ Features

- **🔧 Prettier Code Formatting** - Consistent code style across your project
- **🪝 Husky Git Hooks** - Pre-commit (lint-staged) and pre-push (validation)
- **⚡ Lint-staged Processing** - Only process changed files for speed
- **✅ Pre-push Validation** - Prevents broken code from reaching CI (lint, format, tests)
- **🤖 GitHub Actions** - Automated quality checks in CI/CD
- **📦 One Command Setup** - `npx create-quality-automation@latest`
- **🔄 TypeScript Smart** - Auto-detects and configures TypeScript projects
- **🐍 Python Support** - Complete Python toolchain with Black, Ruff, isort, mypy, pytest
- **🚢 Lighthouse CI** - SEO and performance checking with configurable thresholds
- **🆕 Modern Tooling** - ESLint 9 flat config, Husky 9, latest dependencies
- **🔒 Security Automation** - Blocking npm audit and hardcoded secrets scanning
- **📊 Dependency Monitoring** - Basic Dependabot config (Free) + Advanced features (Pro/Enterprise)
- **🎨 Custom Templates** - Use organization-specific coding standards with `--template` flag
- **🎯 Progressive Quality (v4.0.0+)** - Adaptive checks based on project maturity - no false failures!

## 🎯 Progressive Quality Automation (NEW!)

**The Problem:** Early-stage projects fail CI/CD checks not because of code quality issues, but because tests, docs, and dependencies haven't been created yet.

**The Solution:** Adaptive quality checks that automatically adjust based on your project's maturity level.

### How It Works

Your project is automatically detected as one of 4 maturity levels:

#### 📌 Minimal (0 source files)

- **Checks:** Only Prettier ✨
- **Use case:** Brand new projects, just got package.json
- **CI Status:** ✅ Green from day one

#### 🚀 Bootstrap (1-2 source files)

- **Checks:** Prettier + ESLint 🔍
- **Use case:** Writing your first components
- **CI Status:** ✅ Linting starts when you add code

#### 🔨 Development (3+ files + tests)

- **Checks:** All linting + Tests + Security 🛡️
- **Use case:** Active development with test infrastructure
- **CI Status:** ✅ Comprehensive checks, still no docs required

#### ✅ Production-Ready (10+ files + docs)

- **Checks:** ALL checks enabled 💯
- **Use case:** Mature projects ready for production
- **CI Status:** ✅ Full quality validation

### Benefits

✅ **No false failures** - CI stays green during early development
✅ **Clear progression** - See which checks activate as you add files
✅ **Reduced noise** - Only see failures that matter for your project stage
✅ **Zero config** - Auto-detection works out of the box
✅ **Manual override** - Force strict mode via config file (see `.qualityrc.json.example` for template)

### Check Your Maturity Level

```bash
npx create-quality-automation@latest --check-maturity
```

**Output:**

```
📊 Project Maturity Report

Maturity Level: Development
Description: Active development - has source files and tests

Project Statistics:
  • Source files: 5
  • Test files: 3
  • Documentation: No
  • Dependencies: Yes

Quality Checks:
  ✅ Required: prettier, eslint, stylelint, tests
  🔵 Optional: security-audit
  ⏭️  Disabled: coverage, documentation

🔨 Development project - most checks enabled.
   Add documentation to enable doc validation.
```

### Manual Override

Copy `.qualityrc.json.example` to create your own quality config file and override auto-detection:

```json
{
  "version": "1.0.0",
  "maturity": "production-ready", // Force all checks
  "checks": {
    "prettier": { "enabled": true, "required": true },
    "eslint": { "enabled": "auto", "required": false },
    "tests": { "enabled": true, "required": true } // Force enable
  }
}
```

### Progressive Testing Strategy

create-quality-automation includes **smart test placeholders** to prevent early-stage project failures:

**✅ What's Included:**

- Test scripts with `--passWithNoTests` flag (CI won't fail on empty test directories)
- Placeholder test files with `describe.skip()` and `it.todo()` examples
- Clear documentation on when to remove placeholders
- CI warnings when test count is low (visibility without blocking)

**📁 Example Generated Test:**

```javascript
// tests/placeholder.test.js
import { describe, it, expect } from 'vitest'

describe.skip('Example test suite (placeholder)', () => {
  it.todo('should test core functionality')
  it.todo('should handle edge cases')
})

describe('Test framework validation', () => {
  it('should confirm Vitest is properly configured', () => {
    expect(true).toBe(true) // Ensures test runner works
  })
})
```

**🎯 Progressive Tightening:**

1. **Start (Lenient):** Tests pass even with placeholders - focus on building features
2. **Development:** Replace `it.todo()` with real tests as you build
3. **Production:** Remove `--passWithNoTests` flag to enforce test coverage

**💡 Tip:** Your CI will show warnings like `⚠️ Only 2 test file(s) found - consider adding more tests` to maintain visibility without blocking development.

## 🚀 Quick Start

### Requirements

- Node.js **20 or higher**
- npm **10+** (installed automatically with Node 20)

> **Troubleshooting**
>
> - Using Volta: `volta install node@20.11.1`
> - Using nvm: `nvm install 20 && nvm use 20`
> - npm cache permission errors (`EPERM` on `~/.npm`): either fix ownership (`sudo chown -R $(id -u):$(id -g) ~/.npm`) or point npm to a writable cache (`npm_config_cache=$PWD/.npm-cache npm install`).

### Environment Variables (Optional)

Configure optional behavior with environment variables:

- `NO_EMOJI=true` - Use text-only mode for screen readers and accessibility (e.g., `[OK]` instead of ✅)
- `SCREEN_READER=true` - Enable screen reader friendly output (same as NO_EMOJI)
- `CQA_TELEMETRY=true` - Enable local usage tracking (opt-in only)
- `CQA_ERROR_REPORTING=true` - Enable local error reporting (opt-in only)

**Example usage:**

```bash
# Run with accessibility mode enabled
NO_EMOJI=true npx create-quality-automation@latest

# Run with telemetry enabled
CQA_TELEMETRY=true npx create-quality-automation@latest
```

### For Any Project (Recommended)

```bash
# Navigate to your project (must be a git repository)
cd your-project/

# Bootstrap quality automation
npx create-quality-automation@latest

# Install new dependencies
npm install

# Set up pre-commit hooks
npm run prepare
```

**That's it!** Your project now has comprehensive quality automation.

### Update Existing Setup

```bash
# Update to latest configurations
npx create-quality-automation@latest --update

# Install any new dependencies
npm install

# Verify everything works
npm run lint
```

### Custom Templates (v2.6.2+)

Use organization-specific coding standards by providing a custom template directory:

```bash
# Use custom templates from a local directory
npx create-quality-automation@latest --template ./my-org-templates

# Custom template directory structure example:
# my-org-templates/
# ├── .prettierrc              # Custom Prettier config
# ├── eslint.config.cjs        # Custom ESLint rules
# ├── .github/
# │   └── workflows/
# │       └── quality.yml      # Custom CI workflow
# └── config/
#     └── pyproject.toml       # Custom Python tooling config

# How it works:
# - Custom templates override package defaults
# - Missing files fall back to package defaults
# - Partial templates supported (override only specific files)
# - Enables consistent standards across organization projects
```

**Use Cases:**

- Enforce organization-specific linting rules across all projects
- Customize CI/CD workflows for your infrastructure
- Maintain company coding style guidelines
- Share best practices across development teams

### Dependency Monitoring (v2.4.0+)

```bash
# Add basic dependency monitoring (FREE TIER)
npx create-quality-automation@latest --deps

# What you get for free:
# ✅ Basic Dependabot configuration for npm packages
# ✅ Weekly dependency updates on Monday 9am (configurable)
# ✅ GitHub Actions dependency monitoring
# ✅ Automatic PR creation for dependency updates
#
# Note: Auto-merge requires manual GitHub Actions workflow setup
# See: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions

# Check your current license tier and features
npx create-quality-automation@latest --license-status
```

#### 🎉 FREE BETA - All Features Unlocked!

> **PREMIUM-001 SHIPPED!** Framework-aware dependency grouping is now available to **everyone for free** during our beta period.
>
> We're collecting feedback before launching paid tiers. **No payment required - no license keys - just run the setup!**

**✨ Available Now - 100% Free During Beta**

- ✅ **Framework-aware dependency grouping for JavaScript/TypeScript** - **LIVE NOW**
  - Automatically groups related dependencies into batched PRs
  - Reduces PR volume by 60%+ for React projects
  - Supports React, Vue, Angular, Svelte ecosystems
  - Testing frameworks (Jest, Vitest, Playwright, Testing Library)
  - Build tools (Vite, Webpack, Turbo, Nx, Rollup, esbuild)
  - Storybook ecosystem grouping
  - Wildcard pattern matching for scoped packages (`@tanstack/*`, `@radix-ui/*`)
  - Intelligent update-type filtering (major vs minor vs patch)
  - Production-ready with comprehensive test coverage

- ✅ **Multi-language dependency monitoring** - **JUST SHIPPED**
  - **Python/Pip**: Django, Flask, FastAPI, Data Science (numpy, pandas, scikit-learn)
  - **Rust/Cargo**: Actix, Rocket, async runtimes (Tokio, async-std), Serde ecosystem
  - **Ruby/Bundler**: Rails, Sinatra, RSpec testing frameworks
  - **Polyglot support**: Single Dependabot config for npm + pip + cargo + bundler
  - Framework-aware grouping across all languages
  - Automatic ecosystem detection from project files

**🚀 Coming This Month - Also Free During Beta**

- 📅 **Advanced security audit workflows** with custom schedules
- 📅 **Breaking change detection** before merging dependency updates

**💰 Future Pricing - Lock in Founder Discount**

When we launch paid tiers (Q1 2026), pricing will be:

- **Pro Tier**: $39/month (advanced features, multi-language support)
- **Enterprise Tier**: $197/month (team features, governance, priority support)

**Beta users who join our waitlist get 50% off for life** ($19.50/mo Pro, $98.50/mo Enterprise)

[**📬 Join Waitlist - Lock in Founder Pricing**](https://tally.so/r/create-quality-automation-beta)

**Example: React Project Dependency Grouping**

```yaml
# Before (Free Tier): 15+ individual PRs for React dependencies
# After (Pro Tier): 3-5 grouped PRs

groups:
  react-core:              # Core React packages
    patterns: [react, react-dom, react-router*]
  react-ecosystem:         # State management, data fetching
    patterns: [@tanstack/*, zustand, swr]
  testing-frameworks:      # All testing tools
    patterns: [jest, @testing-library/*, vitest]
```

### Validation Commands (v2.2.0+)

```bash
# Validate configuration security (detects Next.js/Vite secret exposure)
npx create-quality-automation@latest --security-config

# Validate documentation accuracy (README file references, npm scripts)
npx create-quality-automation@latest --validate-docs

# Run comprehensive validation (security + documentation + more)
npx create-quality-automation@latest --comprehensive

# For existing projects with setup, use npm scripts:
npm run security:config        # Configuration security check
npm run validate:docs          # Documentation validation
npm run validate:comprehensive # Full validation suite
npm run validate:all          # Validation + security audit
```

### New Project from Scratch

```bash
# Create new project
mkdir my-awesome-project && cd my-awesome-project
git init
npm init -y

# Add quality automation
npx create-quality-automation@latest
npm install && npm run prepare

# Start coding with quality tools active!
echo "console.log('Hello, quality world!')" > index.js
git add . && git commit -m "feat: initial commit with quality tools"
```

## 📁 What Gets Added to Your Project

### All Projects (Base Configuration)

```
your-project/
├── .github/
│   └── workflows/
│       └── quality.yml          # GitHub Actions workflow
├── .editorconfig              # Editor defaults
├── .eslintignore              # ESLint ignore patterns
├── .nvmrc                     # Node version pinning
├── .npmrc                     # npm configuration (engine-strict)
├── .prettierrc               # Prettier configuration
├── .prettierignore            # Files to ignore in formatting
├── .stylelintrc.json          # Stylelint CSS/SCSS rules
├── .lighthouserc.js           # Lighthouse CI configuration (SEO/performance)
├── eslint.config.cjs          # ESLint flat config (JavaScript)
├── .husky/                     # Pre-commit hooks (created after npm run prepare)
└── package.json                # Updated with scripts and dependencies
```

### TypeScript Projects (additional files)

```
your-project/
├── eslint.config.ts.cjs       # ESLint flat config with TypeScript support
└── package.json                # Enhanced with TypeScript-aware lint-staged patterns
```

### Python Projects (additional files)

```
your-project/
├── .github/
│   └── workflows/
│       └── quality-python.yml   # Python-specific GitHub Actions
├── .pre-commit-config.yaml     # Python pre-commit hooks
├── pyproject.toml              # Python project configuration
├── requirements-dev.txt        # Python development dependencies
├── tests/
│   └── __init__.py             # Python test package marker
└── package.json                # Python helper scripts (for hybrid projects)
```

## ⚙️ Configuration

### Node Version

- This template pins Node to version 20 for local dev and CI.
- Tools included:
  - `.nvmrc` → auto-switch with `nvm use`
  - `package.json` → `engines.node ">=20"` and Volta pin for Node/npm
  - `.npmrc` → `engine-strict = true` to enforce engine checks

Conservative behavior:

- The setup script adds engines/Volta pins if they are missing, but does not overwrite your existing values.
- This avoids unexpectedly changing repos already pinned to another Node version.

### Prettier Configuration (`.prettierrc`)

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

### Lint-staged Configuration (in `package.json`)

```json
{
  "lint-staged": {
    "package.json": ["prettier --write"],
    "**/*.{js,jsx,mjs,cjs,html}": ["eslint --fix", "prettier --write"],
    "**/*.{css,scss,sass,less,pcss}": ["stylelint --fix", "prettier --write"],
    "**/*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

If the setup script detects TypeScript (via a `typescript` dependency or a `tsconfig` file), the `**/*.{js,jsx,mjs,cjs,html}` pattern automatically expands to include `.ts` and `.tsx`.

The CLI scans your repository for existing CSS, Sass, Less, and PostCSS files so Stylelint targets only the directories you already use. If you have custom CSS globs in `lint-staged`, the setup script keeps them instead of overwriting them with broad defaults.

## 🔧 Customization

### Extending ESLint/Stylelint

- ESLint flat config lives in `eslint.config.cjs`. Adjust the exported array to tweak rules—for example, update the final rule block to warn on console usage:
  ```js
  // eslint.config.cjs
  module.exports = [
    /* ...existing entries... */
    {
      files: ['**/*.{js,jsx,mjs,cjs,html}'],
      rules: {
        // existing rules...
        'no-console': 'warn',
      },
    },
  ]
  ```
  When TypeScript is detected the script writes a variant with `@typescript-eslint`; customize the `files: ['**/*.{ts,tsx}']` block in the same way.
- Stylelint rules live in `.stylelintrc.json`; example to relax specificity:
  ```json
  {
    "extends": ["stylelint-config-standard"],
    "rules": { "no-descending-specificity": null }
  }
  ```

### Adding TypeScript Support

1. Add TypeScript to your project: `npm install --save-dev typescript`
2. Re-run the setup script (`npm run setup` or `node setup.js`) to enable `@typescript-eslint` linting and TypeScript-aware lint-staged patterns.
3. Update workflow to include type checking:
   ```yaml
   - name: TypeScript Check
     run: npx tsc --noEmit
   ```

### Python Project Configuration

The tool automatically detects Python projects and configures appropriate tooling:

**Detection criteria** (any of these):

- `.py` files in the project
- `pyproject.toml` file exists
- `requirements.txt` or `requirements-dev.txt` exists

**Python tools configured**:

- **Black** - Code formatting
- **Ruff** - Fast linting and import sorting
- **isort** - Import statement organization
- **mypy** - Static type checking
- **pytest** - Testing framework

**For Python-only projects**: Uses `.pre-commit-config.yaml` with Python hooks
**For hybrid JS/Python projects**: Adds Python patterns to lint-staged configuration

### Lighthouse CI Configuration

Lighthouse CI provides automated SEO and performance monitoring:

**Features configured**:

- **SEO Score Validation** - Minimum 90% SEO score requirement
- **Performance Budgets** - Core Web Vitals monitoring (FCP, LCP, CLS)
- **Accessibility Checks** - Color contrast, alt text, HTML structure
- **Best Practices** - Meta descriptions, canonical URLs, structured data

**Configuration** (`.lighthouserc.js`):

```javascript
// Performance thresholds
'categories:performance': ['warn', { minScore: 0.8 }]
'categories:seo': ['error', { minScore: 0.9 }]
'first-contentful-paint': ['warn', { maxNumericValue: 2000 }]
'largest-contentful-paint': ['warn', { maxNumericValue: 4000 }]
```

**Usage**: Lighthouse CI runs automatically in GitHub Actions when `.lighthouserc.js` exists

### Security Automation Features

Comprehensive security scanning built into the workflow:

**Vulnerability Detection**:

- **npm audit** - Blocks deployment on high-severity vulnerabilities
- **Hardcoded secrets** - Scans for exposed passwords, API keys, tokens with pinned gitleaks v8.28.0
- **XSS patterns** - Detects dangerous innerHTML, eval, document.write usage
- **Input validation** - Warns about unvalidated user inputs

**Supply Chain Security**:

- **Pinned gitleaks binary** - Uses gitleaks v8.28.0 with verified SHA256 checksum verification
- **Binary resolution fallback** - `GITLEAKS_PATH` → global installation → cached pinned version → fail with clear error
- **Checksum verification** - All downloaded binaries verified against known-good SHA256 hashes before execution
- **No silent fallbacks** - Fails securely instead of falling back to latest unpinned versions
- **Escape hatch** - Use `--allow-latest-gitleaks` flag only when explicitly accepting supply chain risk
- **Reproducible scanning** - Same gitleaks version across all environments eliminates scan drift

**Security patterns checked**:

```bash
# XSS vulnerability patterns
innerHTML.*\${  # Template literal injection
eval\(.*\${     # Code injection via eval
onclick.*\${    # Event handler injection

# Secret detection patterns
password|secret|key|token.*[=:].*['"][^'"]{8,}  # Long credential values
-----BEGIN.*KEY-----                            # PEM private keys
```

### Adding Testing

- The template ships with an integration smoke test (`npm test`) that exercises `setup.js` end-to-end.
- Replace or extend `tests/setup.test.js` with your project’s preferred test runner (Jest, Vitest, Playwright, etc.).
- Keep the `test` script aligned with your chosen framework so CI executes the same checks.

## 📜 Available Scripts

After setup, your project will have these scripts:

### JavaScript/TypeScript

- `npm run format` - Format all files with Prettier
- `npm run format:check` - Check if files are formatted (used in CI)
- `npm run prepare` - Set up Husky hooks (run after npm install)
- `npm run lint` / `npm run lint:fix` - ESLint flat config (auto-extending to TS) + Stylelint
- `npm run security:audit` - Check for security vulnerabilities
- `npm run security:secrets` - Scan for hardcoded secrets
- `npm run security:config` - Check configuration security (Next.js/Vite secret exposure)
- `npm run lighthouse:ci` - Run Lighthouse CI performance/SEO checks
- `npm test` - Runs the bootstrap regression test (customize per project)

### Enhanced Validation (v2.2.0+)

- `npm run validate:pre-push` - Pre-push validation (lint + format + tests) - used by git hook
- `npm run validate:docs` - Validate documentation accuracy (README file references, npm scripts)
- `npm run validate:comprehensive` - Run all validation checks (security + documentation)
- `npm run validate:all` - Full validation suite including security audit

### Python (added to hybrid projects)

- `npm run python:format` - Format Python code with Black
- `npm run python:lint` - Lint Python code with Ruff
- `npm run python:type-check` - Type check with mypy
- `npm run python:test` - Run Python tests with pytest

## 🪝 Git Hooks (Husky)

This tool automatically sets up two Husky git hooks to enforce quality before code leaves your machine:

### Pre-commit Hook (`.husky/pre-commit`)

Runs **lint-staged** on staged files only:

- ✅ ESLint --fix on JS/TS files
- ✅ Stylelint --fix on CSS/SCSS files
- ✅ Prettier --write on all staged files
- ⚡ **Fast** - only processes files you changed

**When it runs:** Before every `git commit`

### Pre-push Hook (`.husky/pre-push`)

Runs **comprehensive validation** before pushing to remote:

- ✅ **Pattern Validation** - `npm run test:patterns` (if available) - Catches deprecated command patterns
- ✅ **Linting** - `npm run lint` (ESLint + Stylelint)
- ✅ **Formatting** - `npm run format:check` (Prettier)
- ✅ **Command Execution** - `npm run test:commands` (if available) - Validates generated commands actually work
- ✅ **Unit Tests** - `npm test` (if test script exists)
- 🚫 **Blocks push** if any check fails

**When it runs:** Before every `git push`

**Why this matters:** Catches errors locally before CI runs, saving time and preventing broken builds from reaching your team. The hook intelligently detects which scripts are available and only runs what exists.

**Cross-platform:** Uses Node.js for script detection (works on Windows, Mac, Linux).

### Bypassing Hooks (Emergency Only)

```bash
# Skip pre-commit (not recommended)
git commit --no-verify

# Skip pre-push (not recommended)
git push --no-verify
```

⚠️ **Warning:** Bypassing hooks defeats the purpose of quality automation. Only use in genuine emergencies.

### Manual Validation

Test what the pre-push hook will run:

```bash
npm run validate:pre-push
```

## 🤖 GitHub Actions Workflows

### Trigger Conditions

Both workflows run on:

- Push to `main`, `master`, or `develop` branches
- Pull requests to those branches

### JavaScript/TypeScript Workflow (`quality.yml`)

**Code Quality Steps**:

- ✅ **Node.js Setup** - Uses Node 20 with npm caching
- ✅ **Dependency Installation** - Smart npm ci/install detection
- ✅ **Prettier Check** - Enforces consistent formatting
- ✅ **ESLint** - JavaScript/TypeScript linting with zero warnings
- ✅ **Stylelint** - CSS/SCSS/Sass/Less/PostCSS validation

**Security Steps**:

- ✅ **Security Audit** - npm audit with high-severity blocking
- ✅ **Hardcoded Secrets Detection** - Pattern matching for exposed credentials
- ✅ **XSS Vulnerability Scanning** - innerHTML, eval, document.write patterns
- ✅ **Input Validation Analysis** - Unvalidated user input warnings

**Performance & SEO** (when configured):

- ✅ **Lighthouse CI** - Automated SEO score validation and Core Web Vitals

### Python Workflow (`quality-python.yml`)

**Code Quality Steps**:

- ✅ **Python Setup** - Uses Python 3.9+ with pip caching
- ✅ **Dependency Installation** - Installs from requirements-dev.txt
- ✅ **Black Formatting** - Code style enforcement
- ✅ **Ruff Linting** - Fast Python linting and import sorting
- ✅ **mypy Type Checking** - Static type validation
- ✅ **pytest Execution** - Test suite validation

**Security Steps**:

- ✅ **Python Security Patterns** - Python-specific vulnerability detection

## 🛠️ Troubleshooting

### "husky not found" Error

Run `npm run prepare` after installing dependencies.

### Prettier Conflicts with Other Formatters

Add conflicting formatters to `.prettierignore` or configure them to work together.

### GitHub Actions Not Running

Ensure your repository has Actions enabled in Settings > Actions.

### Vercel Runtime (Note)

- Prefer auto‑detection of Node from `package.json` `engines` when deploying to Vercel.
- Avoid hard‑coding a `runtime` value in `vercel.json` unless confirmed against current Vercel docs — incorrect values can break deploys.
- The template pins Node 20 for local/CI via `.nvmrc`, `engines`, and optional Volta; this is independent of Vercel’s runtime.

## 🔄 Updating

To update an existing project:

```bash
npx create-quality-automation@latest --update
npm install
```

The tool safely merges new configurations without overwriting your customizations.

## 🤝 Contributing

Want to improve this template?

1. Fork the repository
2. Make your changes
3. Test with a sample project
4. Submit a pull request

## 📄 License

MIT License - feel free to use in any project!

## 🙋‍♂️ Support

If you run into issues:

1. Check the **[Troubleshooting Guide](./TROUBLESHOOTING.md)** for common problems and solutions
2. Review the GitHub Actions logs
3. Open an issue in this repository

---

**Made with ❤️ to make code quality effortless**
