# LetterFlow Dependency Audit - Quick Reference

## Critical Issues (Fix Immediately)

### 1. Update ESLint Config Version Mismatch

```bash
npm install --save-dev eslint-config-next@16.0.3
npm run lint
```

**Reason:** Next.js is 16.0.3 but eslint-config-next is 15.1.4 (one major version behind)

---

## Remove Unused Dependencies

```bash
npm uninstall cheerio                  # 60KB - HTML parser (unused)
npm uninstall @hookform/resolvers      # 25KB - Form validation (unused)
npm uninstall date-fns                 # 80KB - Date manipulation (unused)
```

**Total savings:** ~165KB  
**Breaking changes:** None

---

## Evaluate Next-Auth Strategy

**Current:** 5.0.0-beta.30 (unstable)  
**Stable:** 4.24.13

**Decision:**

- Keep beta only if actively building OAuth features
- Switch to v4.24.13 for production stability

---

## Optional Minor Updates (Non-Breaking)

```bash
npm install @anthropic-ai/sdk@0.70.1
npm install @supabase/supabase-js@2.84.0
npm install lucide-react@0.554.0
```

---

## Security Status

- 8 low-severity vulnerabilities (dev-only in @lhci/cli)
- No critical or high-severity issues
- Action: Monitor @lhci/cli for fixes

---

## Dependency Health Score: 7.5/10

### Green (Healthy)

- Next.js 16.0.3 ✅
- React 19.0.0 ✅
- TypeScript 5.x ✅
- All core frameworks latest

### Yellow (Needs Attention)

- next-auth beta ⚠️
- 3 unused dependencies ⚠️

### Red (Critical)

- eslint-config-next version mismatch 🔴

---

## Timeline

- **Phase 1 (Today):** Fix eslint-config, remove unused deps
- **Phase 2 (This week):** Update minor versions
- **Phase 3 (This month):** Decide on next-auth strategy

---

## See Full Report

See `letterflow_dependency_audit.md` for complete analysis
