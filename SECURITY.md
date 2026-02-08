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

1. **GitHub Security Advisories** (Preferred): Report via [GitHub Security Advisories](https://github.com/buildproven/postrail/security/advisories/new)
2. **Email**: security@buildproven.ai

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

### For Independent Deployments

If you deploy PostRail to your own cloud account:

- Use strong, unique values for `ENCRYPTION_KEY` and `COOKIE_SECRET`
- Never commit `.env` files to version control
- Keep dependencies updated regularly
- Enable rate limiting in production (`RATE_LIMIT_MODE=redis`)
- Use HTTPS for all deployments
- Set up your own Supabase project with proper RLS policies
- Secure your API keys (Anthropic, Upstash) as environment variables

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

- [Privacy Policy](https://buildproven.ai/privacy-policy)
- [Terms of Service](https://buildproven.ai/terms)

---

> **BuildProven LLC** · [buildproven.ai](https://buildproven.ai)
