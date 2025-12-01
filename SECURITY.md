# Security Policy

## Automated Security Scanning

This project uses multiple layers of automated security scanning:

### Secret Detection
- **Tool**: Gitleaks
- **Configuration**: `.gitleaks.toml`
- **Coverage**: API keys, passwords, tokens, certificates
- **Pre-commit**: Blocks commits containing secrets
- **CI/CD**: Scans all pull requests

### Dependency Scanning
- **Tool**: npm audit
- **Level**: High and critical vulnerabilities only
- **Auto-fix**: Enabled for compatible updates
- **CI/CD**: Fails builds on high/critical vulnerabilities

### Code Security Scanning
- **Tool**: ESLint security plugin
- **Configuration**: `eslint-security.config.js`
- **Coverage**: Injection attacks, unsafe patterns, crypto issues
- **Pre-commit**: Blocks commits with security violations

### Workflow Security
- **Tool**: actionlint
- **Coverage**: GitHub Actions workflow security issues
- **CI/CD**: Validates workflow syntax and security

## Manual Security Commands

```bash
# Check dependencies for vulnerabilities
npm run security:audit

# Scan for hardcoded secrets
npm run security:secrets

# Validate security configuration
npm run security:config
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
- Run `npm run security:audit` before pushing
- Keep dependencies updated
- Review security scanner output carefully

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
