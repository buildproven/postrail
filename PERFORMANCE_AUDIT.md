# Performance Audit: PostRail

**Date:** 2026-01-08

## Executive Summary

Performance audit identified critical optimizations needed for production. Current bundle includes 356KB largest chunk (uncompressed) and 1MB og-image.png. Database queries are well-optimized with parallel fetching. Key improvements focus on:

1. Image optimization (1MB → 44KB already exists)
2. Code splitting and lazy loading
3. Caching strategies
4. Font optimization

---

## Bundle Analysis

### Current State (Uncompressed)

| Chunk                | Size  | Component             |
| -------------------- | ----- | --------------------- |
| a053c0cdba2d3846.js  | 356KB | Largest vendor bundle |
| 97d681e001d2d602.js  | 220KB | Secondary vendor      |
| 15bbb942908c70c1.js  | 200KB | Third vendor          |
| 070fc08e66e1eae3.css | 53KB  | Main CSS bundle       |

**Total JS:** ~1.5MB uncompressed across all chunks

### Estimated Gzipped Sizes

- Initial bundle: ~100-150KB (Target: <100KB) ✗
- Total page weight: ~300-400KB (Target: <500KB) ✓

---

## Critical Issues

### 1. Image Optimization - CRITICAL

**Issue:** og-image.png is 1MB (uncompressed PNG)

**Current:**

- `/public/og-image.png` - 1MB
- `/public/og-image.jpg` - 88KB
- `/public/og-image.webp` - 44KB ✓ (BEST)

**Fix:** Use WebP in metadata, keep JPG fallback
**Impact:** 95% reduction in OG image size

### 2. Font Loading

**Issue:** Google Fonts loaded synchronously (blocking render)

**Current:** `layout.tsx` imports Geist fonts from Google
**Fix:** Preload fonts, use font-display: swap
**Impact:** Reduce FCP by ~200-500ms

### 3. No Image Component Usage

**Issue:** No Next.js Image components found - missing automatic optimization
**Fix:** Add Next.js Image for any dynamic images
**Impact:** Automatic WebP conversion, lazy loading, responsive images

### 4. Large Vendor Bundles

**Issue:** 356KB largest chunk suggests heavy dependencies
**Likely culprits:**

- @anthropic-ai/sdk
- @tiptap (rich text editor)
- @radix-ui components
- lucide-react icons

**Fix:** Dynamic imports for heavy components
**Impact:** Reduce initial bundle by 30-50%

---

## Database Performance - GOOD ✓

### Already Optimized

1. **Parallel queries** in dashboard (`Promise.all`)
2. **Proper SELECT projection** (only needed columns)
3. **RLS filtering** (database-level security)
4. **Pagination** (LIMIT 100 on newsletters)

### No N+1 Queries Found ✓

All queries properly use joins (`newsletters!inner(user_id)`)

---

## Optimization Plan

### Phase 1: Quick Wins (30 min)

1. ✓ Update metadata to use WebP OG image
2. ✓ Add font preloading and display:swap
3. ✓ Add resource hints (preconnect)
4. ✓ Enable Gzip/Brotli via headers

### Phase 2: Code Splitting (1-2 hours)

1. Dynamic import rich text editor (TipTap)
2. Dynamic import analytics charts
3. Lazy load dashboard components
4. Split vendor chunks

### Phase 3: Caching Strategy (1 hour)

1. Static generation for landing page
2. ISR for dashboard (revalidate: 60)
3. API route caching headers
4. CDN cache configuration

### Phase 4: Advanced (2-3 hours)

1. Service worker for offline support
2. Prefetching for dashboard routes
3. Image optimization pipeline
4. Bundle analyzer + tree shaking

---

## Caching Strategy

### Static Pages (force-static)

- `/` (landing page)
- `/auth/*` (login, signup)

### Dynamic Pages (ISR)

- `/dashboard/*` - revalidate: 60s

### API Routes

- `GET /api/health` - Cache-Control: public, s-maxage=60
- `GET /api/trial-status` - Cache-Control: private, max-age=300

---

## Estimated Impact

| Metric          | Current   | Target    | Status          |
| --------------- | --------- | --------- | --------------- |
| **Bundle Size** | ~1.5MB    | ~800KB    | Needs work      |
| **Initial JS**  | ~150KB gz | <100KB gz | Needs splitting |
| **OG Image**    | 1MB       | 44KB      | Ready (WebP)    |
| **Database**    | Optimized | N/A       | ✓ Good          |
| **FCP**         | Unknown   | <1.5s     | Need fonts fix  |
| **LCP**         | Unknown   | <2.5s     | Need testing    |

---

## Next Steps

1. Implement Phase 1 fixes (this session)
2. Run Lighthouse audit after Phase 1
3. Implement code splitting based on Lighthouse results
4. Deploy to staging and re-test
5. Iterate until Lighthouse > 90

---

## Tools Used

- `npm run build` - Production build analysis
- `du -sh` - File size inspection
- Manual code review - Database query patterns
- Next.js build output - Route analysis
