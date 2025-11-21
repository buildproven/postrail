# LetterFlow - Comprehensive Dependency Audit Report

**Audit Date:** November 21, 2025  
**Project:** LetterFlow v0.1.0  
**Node Version Required:** v20+  
**Total Dependencies:** 301 production + 865 development = 1,166 total  
**Security Vulnerabilities:** 8 low severity (no critical/high)

---

## Executive Summary

The LetterFlow project has a **solid foundation with modern frameworks** but requires:

1. **3 unused dependencies** to remove (reducing attack surface & bundle size)
2. **1 critical version mismatch** (eslint-config-next)
3. **1 package on beta** (next-auth needs evaluation)
4. **8 low-severity vulnerabilities** via transitive dependencies (mostly in dev tooling)
5. **Multiple minor updates available** (non-breaking)

---

## CRITICAL ISSUES (Must Fix)

### 1. ESLint Config Version Mismatch

**Severity:** HIGH  
**Issue Type:** Version Conflict  
**Status:** Actively breaking

| Item               | Current | Latest | Match           |
| ------------------ | ------- | ------ | --------------- |
| Next.js            | 16.0.3  | 16.0.3 | ✅              |
| eslint-config-next | 15.1.4  | 16.0.3 | ❌ **MISMATCH** |

**Impact:**

- ESLint rules may not align with Next.js 16 features
- Possible false positives/negatives in linting
- Could mask configuration issues

**Recommended Action:** Update `eslint-config-next` to 16.0.3

```bash
npm install --save-dev eslint-config-next@16.0.3
```

**Migration Effort:** Minimal (patch-level difference, likely no breaking changes)  
**Breaking Changes:** None expected

---

## HIGH PRIORITY UPDATES

### 2. Next-Auth on Beta Version

**Severity:** MEDIUM  
**Package:** next-auth  
**Current Version:** 5.0.0-beta.30  
**Latest Stable:** 4.24.13  
**Status:** Using unstable pre-release

**Issue Type:** Beta/Unstable Version

**Risks:**

- Breaking changes possible before v5 stable release
- Limited production track record
- No guarantees on API stability
- May receive sudden breaking updates

**Recommendation:**

- **Option A (Risk-Tolerant):** Continue with beta IF tracking breaking changes carefully
- **Option B (Conservative):** Downgrade to stable v4.24.13

```bash
# Option A: Stay on beta (watch for updates)
npm install next-auth@5.0.0-beta.30

# Option B: Use stable version
npm install next-auth@4.24.13
```

**Migration Effort:** If switching to v4: High (API differences)  
**Breaking Changes:** v5 is major version change from v4

---

## UNUSED DEPENDENCIES (Remove These)

### 3A. Cheerio (HTML Parser)

**Current Version:** 1.1.2  
**Issue Type:** Unused Dependency  
**Severity:** MEDIUM

**Finding:** This package is listed in package.json but NOT imported anywhere in the codebase.

```
Search Results:
- ✗ app/ files
- ✗ lib/ files
- ✗ api routes
- ✗ components
- ✗ tests
```

**Use Case:** Would be used for DOM manipulation/CSS selectors  
**Actual Usage:** JSDOM + @mozilla/readability are used instead (more appropriate)

**Recommended Action:** Remove

```bash
npm uninstall cheerio
```

**Impact:**

- Reduces bundle size (~60KB)
- Reduces attack surface (fewer dependencies to audit)
- Simplifies dependency tree
- No code changes required

**Migration Effort:** None (not used)

---

### 3B. @hookform/resolvers

**Current Version:** 5.2.2  
**Issue Type:** Unused Dependency  
**Severity:** MEDIUM

**Finding:** Listed in package.json but NOT imported anywhere.

```
Search Results:
- ✗ All .ts files
- ✗ All .tsx files
- ✗ Form components
- ✗ Tests
```

**Use Case:** Used to integrate form validation libraries (Zod, Yup, etc.) with React Hook Form  
**Actual Usage:** Zod is imported directly in tests, React Hook Form for form management

**Recommended Action:** Remove (unless planned for future OAuth)

```bash
npm uninstall @hookform/resolvers
```

**Impact:**

- Reduces bundle size (~25KB)
- Removes validation schema middleware layer
- No code changes required

**Migration Effort:** None (not used)  
**Breaking Changes:** None

---

### 3C. date-fns

**Current Version:** 4.1.0  
**Issue Type:** Unused Dependency  
**Severity:** MEDIUM

**Finding:** Listed in package.json but NOT used in any code.

```
Search Results:
- ✗ No imports of date-fns
- ✗ No formatDate/parseDate calls
- ✗ No date manipulation
```

**Use Case:** Date formatting and manipulation (e.g., post scheduling)  
**Actual Usage:** None currently (likely reserved for future scheduling feature)

**Recommended Action:** Remove (re-add when scheduling feature built)

```bash
npm uninstall date-fns
```

**Impact:**

- Reduces bundle size (~80KB)
- Simplifies dependency tree
- Feature for future use (easily re-added)

**Migration Effort:** None (not used)

---

## SECURITY VULNERABILITIES (Low Severity)

### 4. Vulnerable Transitive Dependencies

**Total:** 8 low severity vulnerabilities  
**Severity Level:** LOW (no critical/high)  
**Risk:** Minimal for production use

**Vulnerable Chain:**

```
@lhci/cli@0.14.0
├── lighthouse
│   ├── @sentry/node
│   │   └── cookie <0.7.0 (CVE: GHSA-pxg6-pf52-xh8x)
│   └── @sentry/node
│       └── cookie <0.7.0
├── inquirer
│   └── external-editor
│       └── tmp <=0.2.3 (CVE: GHSA-52f5-9888-hmc6)
└── tmp (direct)
    └── tmp <=0.2.3
```

**CVE Details:**

| CVE                 | Package       | Severity | Impact                                    | CVSS |
| ------------------- | ------------- | -------- | ----------------------------------------- | ---- |
| GHSA-pxg6-pf52-xh8x | cookie <0.7.0 | Low      | OOB chars in cookie name/path/domain      | 0.0  |
| GHSA-52f5-9888-hmc6 | tmp <=0.2.3   | Low      | Symlink arbitrary file write (local only) | 2.5  |

**Context:**

- Both CVEs require local/admin access
- Affect development dependencies only (@lhci/cli for performance testing)
- Not in production code path
- Would fix with `npm audit fix --force` but breaks @lhci/cli

**Recommended Action:**

1. Short-term: Accept (low severity, dev-only)
2. Long-term: Monitor @lhci/cli updates for vulnerability fix

**Migration Effort:** Low  
**Breaking Changes:** @lhci/cli would upgrade to 0.1.0 (breaking)

---

## AVAILABLE UPDATES (Non-Breaking)

### 5A. Minor Version Updates

| Package               | Current | Latest  | Type  | Breaking? |
| --------------------- | ------- | ------- | ----- | --------- |
| @anthropic-ai/sdk     | 0.69.0  | 0.70.1  | Minor | No        |
| @supabase/supabase-js | 2.81.1  | 2.84.0  | Minor | No        |
| react                 | 19.0.0  | 19.2.0  | Patch | No        |
| react-hook-form       | 7.66.0  | 7.66.1  | Patch | No        |
| lucide-react          | 0.553.0 | 0.554.0 | Patch | No        |
| @tiptap/\*            | 3.10.7  | 3.11.0  | Patch | No        |

**Recommended Action:** Update for bug fixes and improvements

```bash
npm install @anthropic-ai/sdk@0.70.1
npm install @supabase/supabase-js@2.84.0
npm install lucide-react@0.554.0
```

**Migration Effort:** Minimal (backward compatible)  
**Breaking Changes:** None

---

## FRAMEWORKS & CORE DEPENDENCIES (Healthy)

### 5B. Core Stack Status

| Package          | Current | Latest | Status    | Notes                               |
| ---------------- | ------- | ------ | --------- | ----------------------------------- |
| next             | 16.0.3  | 16.0.3 | ✅ Latest | Very recent (App Router, Turbopack) |
| react            | 19.0.0  | 19.2.0 | ✅ Latest | Modern with hooks support           |
| typescript       | ^5      | 5.9.3  | ✅ Latest | TypeScript 5.x available            |
| tailwindcss      | 3.4.1   | 3.4.1  | ✅ Latest | Modern CSS framework                |
| @playwright/test | 1.56.1  | 1.56.1 | ✅ Latest | E2E testing                         |
| vitest           | 4.0.9   | 4.0.9  | ✅ Latest | Unit testing                        |
| prettier         | 3.3.3   | 3.3.3  | ✅ Latest | Code formatting                     |
| eslint           | 9       | 9.39.1 | ✅ Latest | Latest ESLint                       |

**Summary:** Core frameworks are at or very close to latest versions ✅

---

## DEPENDENCY FRESHNESS ANALYSIS

### Age & Maintenance Status

**Actively Maintained (Green):**

- ✅ @anthropic-ai/sdk - Anthropic (actively updated)
- ✅ Next.js/React - Vercel/Meta (constantly updated)
- ✅ @supabase/\* - Supabase (actively maintained)
- ✅ Playwright - Microsoft (actively maintained)
- ✅ Zod - Collin Topping (v4 stable)
- ✅ Vitest - Vue ecosystem (active)
- ✅ tailwindcss - Tailwind Labs (active)
- ✅ twitter-api-v2 - Actively updated
- ✅ @upstash/\* - Upstash (active)

**Mature/Stable (Requires Monitoring):**

- ⚠️ next-auth@5.0.0-beta.30 - Not production-ready
- ⚠️ @mozilla/readability - Stable, minimal updates needed
- ⚠️ @tiptap/\* - Editor libraries (mature)

**Potentially Abandoned:**

- ❓ Cheerio - Last checked: used in legacy projects, not needed here
- ❓ @hookform/resolvers - Mature but not used

---

## LICENSE COMPLIANCE CHECK

### License Review

| Package           | License    | Status  | Notes      |
| ----------------- | ---------- | ------- | ---------- |
| Next.js           | MIT        | ✅ Safe | Permissive |
| React             | MIT        | ✅ Safe | Permissive |
| TypeScript        | Apache 2.0 | ✅ Safe | Permissive |
| Supabase          | MIT        | ✅ Safe | Permissive |
| @anthropic-ai/sdk | MIT        | ✅ Safe | Permissive |
| Twitter API V2    | Apache 2.0 | ✅ Safe | Permissive |
| Tailwind CSS      | MIT        | ✅ Safe | Permissive |
| Vitest            | MIT        | ✅ Safe | Permissive |
| Playwright        | Apache 2.0 | ✅ Safe | Permissive |
| Prettier          | MIT        | ✅ Safe | Permissive |
| ESLint            | MIT        | ✅ Safe | Permissive |

**Summary:** All licenses are permissive (MIT, Apache 2.0) - ✅ No conflicts

---

## BUNDLE SIZE IMPACT

### Large Dependencies to Monitor

| Package                | Approximate Size | Impact | Included In             |
| ---------------------- | ---------------- | ------ | ----------------------- |
| Next.js                | ~500KB           | High   | Production build        |
| React                  | ~40KB            | High   | Production              |
| Playwright             | ~180MB           | High   | Dev-only (node_modules) |
| Lighthouse             | ~2MB             | Medium | Dev-only (@lhci/cli)    |
| Vitest                 | ~200KB           | Medium | Dev-only                |
| **Cheerio** (if used)  | ~60KB            | Low    | Unused!                 |
| **date-fns** (if used) | ~80KB            | Medium | Unused!                 |

**Optimization Opportunity:**
Removing the 3 unused dependencies would save ~165KB in node_modules (if not hoisted)

---

## PEER DEPENDENCY STATUS

### Checking Compatibility Matrix

All peer dependencies are correctly satisfied:

- ✅ React 19.0.0 compatible with react-dom 19.0.0
- ✅ Next.js 16 compatible with React 19
- ✅ TypeScript ^5 compatible with all packages
- ✅ Tailwind 3.4.1 compatible with PostCSS 8

---

## DEPRECATED PACKAGES

### Current Status

✅ **No deprecated packages detected**

All packages in use are:

- Actively maintained
- Not on deprecation roadmap
- Have active alternatives if needed

---

## RECOMMENDED ACTION PLAN

### Phase 1: Immediate (This Week)

**Priority 1: Fix Version Mismatch**

```bash
# Critical: Update eslint-config-next to match Next.js version
npm install --save-dev eslint-config-next@16.0.3
npm run lint  # Verify no new issues
```

**Priority 2: Remove Unused Dependencies**

```bash
# Remove unused packages
npm uninstall cheerio
npm uninstall @hookform/resolvers
npm uninstall date-fns

# Verify nothing breaks
npm test
npm run build
```

**Priority 3: Update Minor Versions**

```bash
npm install @anthropic-ai/sdk@0.70.1
npm install @supabase/supabase-js@2.84.0
npm install lucide-react@0.554.0
```

### Phase 2: Short-term (This Month)

**Evaluate next-auth Beta:**

```
Decision Matrix:
- If no new Auth features needed: Downgrade to next-auth@4.24.13
- If building OAuth: Continue with beta, track releases weekly
- If deploying to production: Recommend downgrade to stable v4
```

**Rationale:**

```
Beta Concerns:
❌ Breaking changes possible before stable release
❌ Limited production track record
❌ No LTS guarantees
❌ API instability possible

Stable Benefits:
✅ Battle-tested in production
✅ LTS support guarantee
✅ Larger ecosystem of examples/support
✅ Predictable update schedule
```

**Implementation (if downgrading):**

```bash
npm install next-auth@4.24.13
# Would require testing as v4→v5 is breaking
```

**Migration Effort:** High (would need API updates)

### Phase 3: Long-term (Next Quarter)

**TypeScript Updates:**

```
Current: "typescript": "^5"  (allows up to 5.9.3)
Option: Pin to "^5.6" for stability
Benefits: Security patches, performance improvements
```

**Monitoring:**

```
- Weekly: Check for @anthropic-ai/sdk updates (frequent)
- Monthly: Review npm audit results
- Quarterly: Major version update assessment
- Continuously: Monitor next-auth beta status
```

---

## SUMMARY TABLE

| Issue                       | Type             | Severity | Action                    | Effort  |
| --------------------------- | ---------------- | -------- | ------------------------- | ------- |
| eslint-config-next mismatch | Version Conflict | HIGH     | Update to 16.0.3          | 5 min   |
| Cheerio unused              | Remove           | MEDIUM   | npm uninstall             | 2 min   |
| @hookform/resolvers unused  | Remove           | MEDIUM   | npm uninstall             | 2 min   |
| date-fns unused             | Remove           | MEDIUM   | npm uninstall             | 2 min   |
| next-auth beta              | Evaluate         | MEDIUM   | Decide on v4 vs v5        | 30 min  |
| 8 low vulnerabilities       | Security         | LOW      | Monitor @lhci/cli updates | Passive |
| Minor version updates       | Update           | LOW      | Update optional packages  | 10 min  |

---

## RISK ASSESSMENT

### Overall Dependency Health: 7.5/10

**Strengths:**

- ✅ Using latest frameworks (Next.js 16, React 19)
- ✅ Good mix of stable & modern tools
- ✅ All licenses compatible
- ✅ No critical/high vulnerabilities
- ✅ Active ecosystem (not abandoning packages)

**Weaknesses:**

- ⚠️ next-auth on beta (production risk)
- ⚠️ eslint-config-next mismatch
- ⚠️ 3 unused dependencies (attack surface)
- ⚠️ 8 low vulnerabilities in dev tooling

**Mitigation:**

1. Fix eslint-config-next immediately
2. Remove unused deps (low risk, high benefit)
3. Evaluate next-auth strategy this sprint
4. Continue regular npm audits (monthly)

---

## IMPLEMENTATION CHECKLIST

- [ ] Update eslint-config-next to 16.0.3
- [ ] Run `npm run lint` and verify no new errors
- [ ] Remove cheerio: `npm uninstall cheerio`
- [ ] Remove @hookform/resolvers: `npm uninstall @hookform/resolvers`
- [ ] Remove date-fns: `npm uninstall date-fns`
- [ ] Run full test suite: `npm test && npm run test:e2e`
- [ ] Review and update minor versions (anthropic-ai-sdk, supabase-js)
- [ ] Discuss next-auth strategy with team
- [ ] Update package-lock.json and commit
- [ ] Set up monthly npm audit reminder

---

## ADDITIONAL NOTES

### Future Considerations

**When Building Features:**

- Scheduling feature: Re-add date-fns (or use native Date/Temporal API)
- Form validation schema: May want @hookform/resolvers again if using multiple validators
- DOM scraping: Keep @mozilla/readability (excellent choice)

**Production Deployment:**

- Keep Playwright in devDependencies only
- Remove @lhci/cli if not using Lighthouse CI
- Monitor next-auth for v5 stable release

**Repository Health:**

- Current state: Good foundation, minor cleanup needed
- Recommendation: Implement this audit's changes before major features
- Timeline: 1-2 hours to implement all recommendations
