# Performance Degradation Runbook

Use this runbook when Lighthouse scores drop below 90 or Core Web Vitals turn red.

---

## Alert Conditions

### Critical (Immediate Action)

- Lighthouse Performance < 70
- LCP > 4.0s
- FID/INP > 300ms
- CLS > 0.25
- TTFB > 1.5s

### Warning (Review within 24h)

- Lighthouse Performance 70-90
- LCP 2.5-4.0s
- FID/INP 100-300ms
- CLS 0.1-0.25
- TTFB 800ms-1.5s

---

## Quick Diagnostics (5 min)

### 1. Run Performance Check

```bash
cd /Users/brettstark/Projects/postrail
bash scripts/performance-check.sh
```

**Look for:**

- Bundle size increases
- Missing optimizations
- Large new chunks

### 2. Check Recent Changes

```bash
git log --oneline -20
git diff HEAD~5 -- '*.tsx' '*.ts' '*.css'
```

**Red flags:**

- New large dependencies
- Removed lazy loading
- New synchronous API calls
- Image additions

### 3. Quick Lighthouse Run

```bash
npm run build
npm run start
# Open http://localhost:3000 in Chrome
# DevTools → Lighthouse → Analyze
```

**Record:**

- Performance score
- LCP value
- TBT value
- CLS value

---

## Deep Diagnostics (30 min)

### Step 1: Bundle Analysis

```bash
# Install analyzer if not present
npm install --save-dev @next/bundle-analyzer

# Run analysis
ANALYZE=true npm run build
```

**Check for:**

- New large chunks (>200KB)
- Duplicate dependencies
- Unexpected imports
- Large vendor bundles

**Common issues:**

- `@anthropic-ai/sdk` in client bundle
- Multiple date libraries (date-fns + moment)
- Full lucide-react instead of tree-shaken icons
- Chart libraries not lazy loaded

### Step 2: Coverage Analysis

**Chrome DevTools:**

1. Open app in Chrome
2. DevTools → Coverage tab
3. Click record
4. Navigate through app
5. Stop recording

**Look for:**

- Red bars (unused code) > 50%
- Large unused CSS files
- Unused JavaScript modules

### Step 3: Network Waterfall

**Chrome DevTools → Network:**

1. Disable cache
2. Throttle: Fast 3G
3. Reload page
4. Record waterfall

**Check for:**

- Render-blocking resources
- Large resources (>100KB)
- Slow API responses (>500ms)
- Missing compression
- No caching headers

### Step 4: Performance Trace

**Chrome DevTools → Performance:**

1. Click record
2. Reload page
3. Wait for full load
4. Stop recording

**Analyze:**

- Long tasks (>50ms)
- Layout shifts
- Script evaluation time
- Paint timing

---

## Common Issues & Fixes

### Issue: Large Bundle (>500KB gzipped)

**Diagnosis:**

```bash
ANALYZE=true npm run build
```

**Fixes:**

1. **Lazy load heavy components**

   ```tsx
   const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
     loading: () => <Loading />,
     ssr: false,
   })
   ```

2. **Tree shake icons**

   ```tsx
   // ❌ Bad
   import { Loader2, Check, X } from 'lucide-react'

   // ✅ Good (if individual exports available)
   import Loader2 from 'lucide-react/dist/esm/icons/loader-2'
   ```

3. **Remove duplicate dependencies**
   ```bash
   npm dedupe
   npm prune
   ```

---

### Issue: LCP > 2.5s

**Diagnosis:**

- Largest Contentful Paint element is slow to load

**Common causes:**

1. **Large image**
   - Check image size
   - Convert to WebP
   - Add responsive srcset

2. **Slow font loading**
   - Verify `display: 'swap'`
   - Add font preload
   - Check font file size

3. **Slow server response**
   - Check TTFB
   - Review database queries
   - Enable ISR/SSG

**Fixes:**

```tsx
// app/layout.tsx
const font = Font({
  display: 'swap',    // ✓ Prevent FOIT
  preload: true,      // ✓ Load early
})

// Optimize images
<Image
  src="/hero.webp"
  priority              // ✓ Preload hero images
  width={1200}
  height={630}
/>

// Enable ISR
export const revalidate = 60  // ✓ Cache for 60s
```

---

### Issue: FID/INP > 100ms

**Diagnosis:**

- Main thread blocked by JavaScript

**Common causes:**

1. **Heavy JavaScript execution**
   - Large bundle parse/compile time
   - Expensive React renders
   - Synchronous API calls

2. **No code splitting**
   - All code loaded upfront
   - No lazy loading

**Fixes:**

```tsx
// 1. Debounce expensive operations
const debouncedSearch = useMemo(() => debounce(searchFn, 300), [])

// 2. Use web workers for heavy computation
const worker = new Worker('./heavy-task.worker.ts')

// 3. Split code
const Analytics = dynamic(() => import('./Analytics'))

// 4. Virtualize long lists
import { VirtualList } from 'react-virtual'
```

---

### Issue: CLS > 0.1

**Diagnosis:**

- Unexpected layout shifts

**Common causes:**

1. **Images without dimensions**
2. **Dynamic content insertion**
3. **Web fonts loading**

**Fixes:**

```tsx
// 1. Set image dimensions
<Image
  src="/image.jpg"
  width={800}        // ✓ Prevent shift
  height={600}       // ✓ Reserve space
/>

// 2. Reserve space for dynamic content
<div className="min-h-[400px]">
  {loading ? <Skeleton /> : <Content />}
</div>

// 3. Use font display swap
const font = Font({
  display: 'swap',   // ✓ Prevent layout shift
})
```

---

### Issue: Slow TTFB (>800ms)

**Diagnosis:**

- Server response time slow

**Common causes:**

1. **Sequential database queries**
2. **No caching**
3. **Dynamic rendering when static would work**

**Fixes:**

```tsx
// 1. Parallel queries
const [data1, data2] = await Promise.all([fetch1(), fetch2()])

// 2. Enable ISR
export const revalidate = 60

// 3. Use static generation
export const dynamic = 'force-static'

// 4. Add API caching
return Response.json(data, {
  headers: {
    'Cache-Control': 'public, s-maxage=60',
  },
})
```

---

## Rollback Procedure

If recent changes caused degradation:

### 1. Identify Breaking Commit

```bash
git log --oneline -20
# Find suspect commit
```

### 2. Quick Rollback

```bash
git revert <commit-hash>
git push origin main
```

### 3. Deploy Previous Version

```bash
# On Vercel
vercel rollback <deployment-url>

# Or redeploy previous commit
git checkout <good-commit>
git push origin HEAD:production --force
```

### 4. Investigate & Fix

```bash
# Create branch from broken commit
git checkout -b fix/performance-regression <broken-commit>

# Fix issue
# ...

# Test
npm run build
bash scripts/performance-check.sh

# Deploy to staging
git push origin fix/performance-regression

# Run Lighthouse CI
npm run lighthouse:ci
```

---

## Prevention

### Pre-Commit Checks

```bash
# .husky/pre-commit
npm run type-check
npm run lint
npm run test:fast
```

### Pre-Deploy Checks

```bash
# CI/CD pipeline
npm run build
npm run test
npm run lighthouse:ci  # Fail if score < 90
```

### Regular Monitoring

- Daily: Check Vercel Analytics
- Weekly: Run Lighthouse CI
- Monthly: Full performance audit

---

## Escalation

### Performance < 70

1. Create incident ticket
2. Notify team in #engineering
3. Begin investigation immediately
4. Consider rollback if user-facing

### Performance 70-90

1. Create task ticket
2. Schedule fix within sprint
3. Document findings

---

## Resources

### Internal

- Performance Audit: `PERFORMANCE_AUDIT.md`
- Optimizations: `PERFORMANCE_OPTIMIZATIONS.md`
- Quick Reference: `PERFORMANCE_QUICK_REFERENCE.md`
- Checklist: `.github/PERFORMANCE_CHECKLIST.md`

### External

- [Core Web Vitals](https://web.dev/vitals/)
- [Next.js Performance](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
- [Lighthouse Scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring/)

---

**On-Call Contact:** @performance-team
**Escalation Path:** Engineering Manager → CTO
**SLA:** Critical issues < 1h, Warnings < 24h

---

_Last Updated: 2026-01-08_
