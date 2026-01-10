# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please report it responsibly.

### For Critical/High Severity Issues

**Please do not report security vulnerabilities through public GitHub issues.**

Instead:

1. **GitHub Security Advisories** (Preferred): Report via [GitHub Security Advisories](https://github.com/vibebuildlab/postrail/security/advisories/new)
2. **Email**: security@vibebuildlab.com

Include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You should receive a response within 48 hours.

### For Low/Medium Severity Issues

You may open a public GitHub issue if the vulnerability:

- Has no known active exploits
- Does not expose sensitive data
- Has a straightforward fix

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

## Security Best Practices

### For Self-Hosters

- Use strong, unique values for `ENCRYPTION_KEY` and `COOKIE_SECRET`
- Never commit `.env` files to version control
- Keep dependencies updated regularly
- Enable rate limiting in production (`RATE_LIMIT_MODE=redis`)
- Use HTTPS for all deployments

### For Contributors

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

> **Vibe Build Lab LLC** - [vibebuildlab.com](https://vibebuildlab.com)
