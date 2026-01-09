# Performance Quick Reference - PostRail

**TL;DR:** All optimizations applied. Ready for Lighthouse testing. Expected score: 85-95.

---

## Optimizations Applied ✓

| #   | Optimization      | Impact              | File                     |
| --- | ----------------- | ------------------- | ------------------------ |
| 1   | WebP Images       | 50% size reduction  | `app/layout.tsx`         |
| 2   | Font display:swap | ~200-500ms FCP gain | `app/layout.tsx`         |
| 3   | Preconnect hints  | ~70-320ms saved     | `app/layout.tsx`         |
| 4   | Static landing    | CDN delivery        | `app/page.tsx`           |
| 5   | ISR dashboard     | 60s cache           | `app/dashboard/page.tsx` |
| 6   | Compression       | 74% size reduction  | `next.config.js`         |

---

## Performance Check

```bash
bash scripts/performance-check.sh
```

**Expected Output:**

- ✓ Compression enabled
- ✓ Landing page is static
- ✓ Dashboard uses ISR
- ✓ Font display optimization
- ✓ Resource hints (preconnect)
- ✓ og-image.webp: 44K

---

## Bundle Sizes

| Asset     | Uncompressed | Gzipped    | Status            |
| --------- | ------------ | ---------- | ----------------- |
| JS        | 1.4MB        | ~400KB     | ✓ Good            |
| CSS       | 56KB         | ~12KB      | ✓ Good            |
| Images    | 44KB         | ~40KB      | ✓ Good            |
| **Total** | **1.5MB**    | **~420KB** | **✓ Under 500KB** |

---

## Core Web Vitals Targets

| Metric | Target | Estimated  |
| ------ | ------ | ---------- |
| LCP    | <2.5s  | 1.5-2.0s ✓ |
| FID    | <100ms | 50-100ms ✓ |
| CLS    | <0.1   | 0.02 ✓     |

---

## Lighthouse Test

### Local Testing

1. `npm run build`
2. `npm run start`
3. Open Chrome DevTools → Lighthouse
4. Select "Desktop" mode
5. Click "Analyze page load"

### CI Testing

```bash
npm run lighthouse:ci
```

### Expected Scores

- Performance: 85-95
- Accessibility: 90-100
- Best Practices: 95-100
- SEO: 100

---

## Files Modified

**Core (6):**

- `app/layout.tsx` - Fonts, images, resource hints
- `app/page.tsx` - Static generation
- `app/dashboard/page.tsx` - ISR (60s)
- `app/dashboard/analytics/page.tsx` - ISR (300s)
- `next.config.js` - Compression, cache headers
- `app/api/health/route.ts` - API caching

**Docs (3):**

- `PERFORMANCE_AUDIT.md` - Full audit
- `PERFORMANCE_OPTIMIZATIONS.md` - Detailed changes
- `PERFORMANCE_SUMMARY.md` - Executive summary

**Config (2):**

- `lighthouserc.js` - Lighthouse CI config
- `scripts/performance-check.sh` - Quick check script

---

## Pre-Deploy Checklist

- [x] Images optimized (WebP)
- [x] Fonts optimized (display:swap)
- [x] Caching configured
- [x] Compression enabled
- [x] Database queries parallel
- [x] Code splitting (TipTap lazy loaded)
- [ ] Lighthouse > 90 (pending test)
- [ ] Deploy to staging
- [ ] Production env vars set
- [ ] Real user monitoring enabled

---

## If Lighthouse < 90

### Debugging Steps

1. **Check Network Tab**
   - Large resources?
   - Missing compression?
   - Slow API calls?

2. **Check Performance Tab**
   - Long tasks?
   - Layout shifts?
   - Render-blocking resources?

3. **Run Bundle Analyzer**

   ```bash
   npm install --save-dev @next/bundle-analyzer
   ANALYZE=true npm run build
   ```

4. **Check Coverage Tool**
   - Unused CSS?
   - Unused JavaScript?

---

## Common Issues & Fixes

| Issue        | Fix                                       |
| ------------ | ----------------------------------------- |
| LCP > 2.5s   | Check font loading, largest image         |
| FID > 100ms  | Reduce JavaScript, use web workers        |
| CLS > 0.1    | Set image dimensions, avoid layout shifts |
| Large bundle | Code splitting, tree shaking              |
| Slow TTFB    | Check ISR/SSG, database queries           |

---

## Documentation

- **Full Audit:** `PERFORMANCE_AUDIT.md`
- **Optimizations:** `PERFORMANCE_OPTIMIZATIONS.md`
- **Summary:** `PERFORMANCE_SUMMARY.md`
- **This Guide:** `PERFORMANCE_QUICK_REFERENCE.md`

---

**Status:** READY FOR TESTING ✓
**Confidence:** HIGH
**Next Step:** Run Lighthouse

---

_Last updated: 2026-01-08_
