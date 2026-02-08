# Contributing to Postrail

Thank you for your interest in contributing! Postrail is an open source project and we welcome contributions from the community.

## License

By contributing to this project, you agree that your contributions will be licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment.

## Prerequisites

- Node.js 20+ (enforced via `.npmrc`)
- Supabase account (for database)
- Anthropic API key (for AI features)

Install dependencies:

```bash
npm install
```

## Development Workflow

1. **Fork the repository**

   ```bash
   git clone https://github.com/buildproven/postrail.git
   cd postrail
   ```

2. **Create a branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Start the dev server**

   ```bash
   npm run dev
   ```

4. **Run quality gates**

   ```bash
   npm run lint
   npm test
   npm run test:coverage
   ```

5. **Run E2E tests**
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

## Reporting Issues

- Check existing issues before creating a new one
- Use issue templates when available
- Include reproduction steps for bugs

## Getting Help

- Open a GitHub issue or discussion
- Check the [documentation](./docs/)

## Legal

- [Privacy Policy](https://buildproven.ai/privacy-policy)
- [Terms of Service](https://buildproven.ai/terms)

---

> **BuildProven LLC** - [buildproven.ai](https://buildproven.ai)
