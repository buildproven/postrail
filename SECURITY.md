# Security Policy

## Automated Security Controls

- **ESLint (security plugin)**: Runs via lint-staged on commits and in CI (`npm run lint`) to flag injection/unsafe patterns.
- **Dependency scanning**: `npm run security:audit` (npm audit high/critical) and Dependabot alerts on the default branch.
- **Secret detection**: `.gitleaks.toml` present; run manually or in CI when configured.
- **Husky hooks**: Pre-commit runs lint-staged (ESLint/Prettier); pre-push runs smart test strategy unless disabled.

## Manual Security Commands

```bash
# Check dependencies for vulnerabilities
npm run security:audit

# Scan for hardcoded secrets
npm run security:secrets

# Validate security configuration
npm run security:config

# Optional: gitleaks scan (requires gitleaks installed)
gitleaks detect --source .
```

## Reporting Security Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@vibebuildlab.com**

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 48 hours.

## Security Best Practices

### For Developers

- Never commit secrets, API keys, or passwords
- Use environment variables for sensitive configuration
- Run `npm run security:audit` before releases and dependency bumps
- Keep dependencies updated; prefer minimal change surface on infra files
- Review scanner output and fix/annotate findings before merging

### For CI/CD

- All security checks must pass before merge
- Dependency updates require security review
- Secrets stored in secure environment variables
- Regular security audits in automated schedules

## Legal

- [Privacy Policy](https://vibebuildlab.com/privacy-policy)
- [Terms of Service](https://vibebuildlab.com/terms)

---

> **Vibe Build Lab LLC** · [vibebuildlab.com](https://vibebuildlab.com)
