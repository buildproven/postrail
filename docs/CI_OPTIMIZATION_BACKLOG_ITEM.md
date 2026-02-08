# CI Minutes Optimization - Backlog Item

**Issue ID:** DevOps-1
**Priority:** High (Blocking production deployments due to billing)
**Effort:** Small (<4h)
**Value Drivers:** Rev:0 Ret:5 Diff:0 (Retention critical - CI failures block all merges)
**Score:** 5.0 (5÷1)

## Problem Statement

GitHub Actions CI is consuming **3x the free tier limit** (6,000 min/month vs 2,000 min/month free), causing:

- All CI runs blocked with billing errors since Jan 7, 2026
- Unable to merge PRs (required status checks failing)
- $24/month overage charges blocked by $0 spending limit

### Root Cause Analysis

**Duplicate workflows running on every push/PR:**

1. **ci.yml** - Basic quality gates (lint, typecheck, test:fast, build, security)
2. **quality.yml** - Comprehensive checks (DUPLICATES ci.yml + adds gitleaks, qa-architect, XSS scanning, Lighthouse)
3. **quality-python.yml** - Python-specific checks

**Impact per event:**

- Every push to main: 3 workflows × ~5 min each = **15 minutes**
- Every PR: 4 workflows (+ dependabot-auto-merge) × ~5 min = **20 minutes**
- With 20-30 pushes/week: 6,000 min/month

**Key duplication in quality.yml:**

```yaml
# These steps DUPLICATE ci.yml:
- ESLint (both)
- Tests (quality.yml runs full `npm test`, ci.yml runs `test:fast`)
- E2E tests (both - quality.yml even installs Playwright again!)
- Security audit (both)
- Prettier/Stylelint (quality.yml only, but ci.yml implies via lint script)
```

## Proposed Solution

**Make quality.yml a weekly scheduled workflow instead of per-push/PR:**

### Changes Required

**File: `.github/workflows/quality.yml`**

```yaml
# BEFORE:
on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]

# AFTER:
on:
  schedule:
    - cron: '0 2 * * 0'  # Sunday 2am UTC (weekly comprehensive scan)
  workflow_dispatch:      # Allow manual trigger when needed
```

**File: `.github/workflows/quality-python.yml`** (if exists)

```yaml
# Same change - make it weekly or remove if no Python code
on:
  schedule:
    - cron: '0 2 * * 0'
  workflow_dispatch:
```

### Workflow Strategy

| Workflow               | Trigger         | Purpose                                                                  | Runtime   |
| ---------------------- | --------------- | ------------------------------------------------------------------------ | --------- |
| **ci.yml**             | Every push/PR   | Fast quality gates (lint, typecheck, test:fast, build)                   | ~2-3 min  |
| **quality.yml**        | Weekly (Sunday) | Comprehensive security/quality (gitleaks, qa-architect, XSS, Lighthouse) | ~8-10 min |
| **quality-python.yml** | Weekly (Sunday) | Python-specific checks (if applicable)                                   | ~2-3 min  |
| **weekly-audit.yml**   | Weekly (Sunday) | Existing dependency/security audit                                       | ~1-2 min  |

**All weekly workflows can run in parallel on Sunday morning.**

## Expected Impact

### Before (Current State)

- **Push to main**: 15 min (ci.yml + quality.yml + quality-python.yml)
- **PR**: 20 min (add dependabot-auto-merge)
- **Monthly usage**: ~6,000 minutes (3x free tier)
- **Cost**: $24/month overage (blocked, CI fails)

### After (Optimized)

- **Push to main**: 3 min (ci.yml only)
- **PR**: 6 min (ci.yml + dependabot-auto-merge)
- **Weekly scans**: 12 min (quality.yml + quality-python.yml + weekly-audit.yml)
- **Monthly usage**: ~1,500 minutes (under 2,000 free tier)
- **Cost**: $0 ✅
- **Reduction**: **75% fewer CI minutes**

## Implementation Steps

### 1. Update quality.yml

```bash
# Edit .github/workflows/quality.yml
# Change 'on:' trigger to weekly schedule + workflow_dispatch
git add .github/workflows/quality.yml
git commit -m "fix: make quality.yml weekly to reduce CI minutes"
```

### 2. Update quality-python.yml (if exists)

```bash
# Same change as quality.yml
git add .github/workflows/quality-python.yml
git commit -m "fix: make quality-python.yml weekly to reduce CI minutes"
```

### 3. Update README.md

Add badge explanation:

```markdown
## CI/CD

**Fast checks (every push):** Lint, TypeCheck, Tests, Build
**Comprehensive scans (weekly):** Security, Performance, Accessibility, Code Quality

[![CI](https://github.com/org/repo/actions/workflows/ci.yml/badge.svg)](https://github.com/org/repo/actions/workflows/ci.yml)
```

### 4. Verify on next push

```bash
git push
# Check GitHub Actions - should only see ci.yml running, not quality.yml
gh run list --limit 5
```

### 5. Manually trigger quality.yml for verification

```bash
gh workflow run quality.yml
gh run watch
```

### 6. Monitor usage next month

- Check `https://github.com/organizations/buildproven/settings/billing`
- Verify usage stays under 2,000 min/month

## Rollback Plan

If weekly quality scans miss critical issues:

```bash
# Revert to per-push/PR triggers
git revert <commit-hash>
git push
```

**Alternative:** Upgrade to GitHub Team plan ($4/user/month) for 3,000 minutes/month.

## Additional Optimizations (Future)

If still over budget after this change:

1. **Disable CI on archived repos** - 17 private repos share the quota
2. **Use `test:fast` everywhere** - Already done in ci.yml, ensure quality.yml uses it too
3. **Make dependabot PRs skip quality.yml** - Add path filters
4. **Self-hosted runners** - Free minutes, but requires server maintenance
5. **Make repos public** - Unlimited free minutes (if code isn't sensitive)

## References

- **GitHub Billing**: `https://github.com/organizations/buildproven/settings/billing`
- **CI Usage History**: Jan 8-9, 2026 used 401 minutes (200 min/day rate)
- **Free Tier Limit**: 2,000 min/month for private repos
- **Related Commits**:
  - `3d53a5d` - Use test:fast in CI
  - `7bcfb0f` - Disable submodule checkout in CI

## Apply to Other Projects

This same optimization should be applied to **all BuildProven projects** with the same workflow setup:

- postrail ✅ (this repo)
- qa-architect (source of quality.yml template)
- vibelab-claude-setup
- keyflash
- jobrecon
- retireabroad
- All other private repos with CI

**Update qa-architect's template first**, then propagate to consumer repos via:

```bash
# In each project
npx create-qa-architect@latest --update-workflows
```

---

**Last Updated:** 2026-01-09
**Status:** Pending Implementation
**Assigned To:** Brett Stark / Claude Code
