# Contributing to Postrail

Thank you for your interest in contributing! This document provides guidelines for contributing to Postrail.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment.

## Prerequisites

- Node.js 20+ (enforced via `.npmrc`)
- Supabase account
- Anthropic API key (for AI features)

Install dependencies:

```bash
npm install
```

## Development Workflow

1. **Start the dev server**
   ```bash
   npm run dev
   ```

2. **Run quality gates**
   ```bash
   npm run lint
   npm test
   npm run test:coverage
   ```

3. **Run E2E tests**
   ```bash
   npm run test:e2e
   ```

## Code Standards

### TypeScript
- Strict mode enabled
- No `any` types
- Proper error handling

### Formatting
- Prettier for code formatting
- ESLint with security rules
- Husky + lint-staged for pre-commit hooks

### Testing
- Unit tests: Vitest
- E2E tests: Playwright
- Minimum 75% coverage for new code

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(api): add post scheduling endpoint
fix(auth): resolve session refresh issue
docs(readme): update installation steps
test(e2e): add newsletter import tests
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run tests: `npm test && npm run lint`
4. Submit a pull request with clear description
5. Wait for review

## Testing Requirements

- Add tests for new features
- Maintain 75%+ coverage
- Test actual execution, not just structure

## Questions?

Open a GitHub issue or discussion.

## Legal

- [Privacy Policy](https://vibebuildlab.com/privacy-policy)
- [Terms of Service](https://vibebuildlab.com/terms)

---

> **Vibe Build Lab LLC** · [vibebuildlab.com](https://vibebuildlab.com)

