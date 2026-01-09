# Performance Optimization Checklist

Use this checklist when optimizing performance or reviewing performance-related PRs.

## Pre-Optimization Baseline

- [ ] Run `npm run build` and record bundle sizes
- [ ] Run Lighthouse and record scores
- [ ] Document current Core Web Vitals
- [ ] Note any performance bottlenecks

## Image Optimization

- [x] All images in WebP format (with fallbacks)
- [x] OG images < 100KB
- [x] Icons optimized (PNG or SVG)
- [ ] All images have width/height attributes (CLS prevention)
- [ ] Lazy loading for below-fold images
- [ ] Use Next.js Image component where applicable

## Font Optimization

- [x] Fonts use `display: 'swap'`
- [x] Fonts have `preload: true`
- [x] Font files are subset (latin only)
- [ ] Variable fonts considered (if applicable)
- [ ] Font fallbacks defined in CSS

## Resource Hints

- [x] `dns-prefetch` for external domains
- [x] `preconnect` for critical origins (fonts, APIs)
- [ ] `prefetch` for likely next navigation
- [ ] `preload` for critical resources

## Code Splitting

- [x] Heavy components dynamically imported
- [x] TipTap editor lazy loaded
- [ ] Analytics libraries lazy loaded
- [ ] Third-party scripts defer/async
- [ ] Route-based code splitting

## Caching Strategy

### Static Assets

- [x] `/_next/static/*` - 1 year immutable
- [x] `/public/*` images - 1 year immutable
- [x] Compression enabled (Gzip/Brotli)

### Pages

- [x] Landing page: `force-static`
- [x] Auth pages: Static
- [x] Dashboard: ISR with 60s revalidate
- [x] Analytics: ISR with 300s revalidate

### API Routes

- [x] Health check: 60s cache
- [ ] Trial status: Private cache
- [ ] Public endpoints: Public cache

## Database Optimization

- [x] Parallel queries with `Promise.all()`
- [x] No N+1 queries (proper joins)
- [x] SELECT only needed columns
- [x] Pagination on large datasets (LIMIT)
- [ ] Database indexes on frequently queried columns
- [ ] Connection pooling configured

## Build Optimization

- [x] Production build tested
- [x] Bundle size < 500KB gzipped
- [x] TypeScript type checking passes
- [ ] No unused dependencies
- [ ] Tree shaking enabled
- [ ] Minification enabled

## Performance Monitoring

### Development

- [x] Performance check script: `scripts/performance-check.sh`
- [x] Bundle analysis: `npm run build`
- [ ] Coverage tool for unused code

### Production

- [ ] Lighthouse CI configured
- [ ] Real User Monitoring (RUM) enabled
- [ ] Core Web Vitals tracking
- [ ] Error monitoring (Sentry)
- [ ] API performance monitoring

## Core Web Vitals Targets

- [ ] LCP < 2.5s (Largest Contentful Paint)
- [ ] FID < 100ms (First Input Delay)
- [ ] INP < 200ms (Interaction to Next Paint)
- [ ] CLS < 0.1 (Cumulative Layout Shift)
- [ ] FCP < 1.8s (First Contentful Paint)
- [ ] TTFB < 800ms (Time to First Byte)

## Lighthouse Scores

- [ ] Performance: > 90
- [ ] Accessibility: > 90
- [ ] Best Practices: > 90
- [ ] SEO: > 90

## Testing

- [x] All tests pass: `npm run test:fast`
- [x] Type checking: `npm run type-check`
- [ ] E2E tests: `npm run test:e2e`
- [ ] Lighthouse CI: `npm run lighthouse:ci`

## Documentation

- [x] Performance audit document created
- [x] Optimization details documented
- [x] Quick reference guide created
- [x] This checklist completed

## Deployment

### Staging

- [ ] Deploy to staging environment
- [ ] Run Lighthouse on staging URL
- [ ] Verify Core Web Vitals
- [ ] Test on real devices

### Production

- [ ] Production env vars set
- [ ] CDN configured
- [ ] Upstash Redis connected
- [ ] Sentry monitoring enabled
- [ ] First deploy performance baseline recorded
- [ ] Real user metrics monitored for 7 days

## Common Performance Issues

### If LCP > 2.5s

- [ ] Check largest image size and loading
- [ ] Verify font loading not blocking render
- [ ] Check server response time (TTFB)
- [ ] Consider image CDN

### If FID/INP > 100ms

- [ ] Reduce JavaScript bundle size
- [ ] Remove unused JavaScript
- [ ] Use web workers for heavy tasks
- [ ] Debounce/throttle event handlers

### If CLS > 0.1

- [ ] Set explicit dimensions on all images
- [ ] Reserve space for dynamic content
- [ ] Avoid inserting content above fold
- [ ] Use `transform` instead of layout properties

### If Total Bundle > 500KB

- [ ] Run bundle analyzer
- [ ] Remove duplicate dependencies
- [ ] Lazy load heavy components
- [ ] Tree shake unused code

## Regular Maintenance

### Weekly

- [ ] Monitor bundle size in CI
- [ ] Review performance metrics
- [ ] Check for dependency updates

### Monthly

- [ ] Run full Lighthouse audit
- [ ] Review Core Web Vitals trends
- [ ] Update performance baseline
- [ ] Identify new optimization opportunities

### Quarterly

- [ ] Major dependency updates
- [ ] Performance architecture review
- [ ] User feedback on perceived performance
- [ ] Competitive performance analysis

---

**Last Updated:** 2026-01-08
**Next Review:** 2026-02-08
