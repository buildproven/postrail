#!/bin/bash

set -e

echo "🚀 PostRail Performance Check"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if production build exists
if [ ! -d ".next" ]; then
  echo "📦 Building production bundle..."
  npm run build
  echo ""
fi

# Bundle size check
echo "📊 Bundle Size Analysis"
echo "----------------------"
TOTAL_JS=$(find .next/static/chunks -name "*.js" -exec du -ch {} + | grep total | awk '{print $1}')
TOTAL_CSS=$(find .next/static/chunks -name "*.css" -exec du -ch {} + | grep total | awk '{print $1}')

echo "  JS Bundles: $TOTAL_JS (target: <1.5MB uncompressed)"
echo "  CSS: $TOTAL_CSS (target: <100KB)"
echo ""

# Check for large chunks
echo "🔍 Large Chunks (>100KB):"
find .next/static/chunks -name "*.js" -exec du -h {} \; | awk '$1 ~ /[0-9]{3}K|[0-9]M/ {print "  ⚠️  " $2 " - " $1}'
echo ""

# Check image sizes
echo "🖼️  Image Optimization"
echo "---------------------"
if [ -f "public/og-image.webp" ]; then
  OG_SIZE=$(du -h public/og-image.webp | awk '{print $1}')
  echo -e "  ${GREEN}✓${NC} og-image.webp: $OG_SIZE (target: <100KB)"
else
  echo -e "  ${RED}✗${NC} og-image.webp not found"
fi
echo ""

# Check for missing optimizations
echo "⚙️  Configuration Check"
echo "---------------------"

# Check if compression is enabled
if grep -q "compress: true" next.config.js; then
  echo -e "  ${GREEN}✓${NC} Compression enabled"
else
  echo -e "  ${YELLOW}⚠${NC}  Compression not enabled in next.config.js"
fi

# Check for static optimization
if grep -q "force-static" app/page.tsx; then
  echo -e "  ${GREEN}✓${NC} Landing page is static"
else
  echo -e "  ${YELLOW}⚠${NC}  Landing page not static"
fi

# Check for ISR on dashboard
if grep -q "revalidate" app/dashboard/page.tsx; then
  echo -e "  ${GREEN}✓${NC} Dashboard uses ISR"
else
  echo -e "  ${YELLOW}⚠${NC}  Dashboard not using ISR"
fi

# Check for font optimization
if grep -q "display: 'swap'" app/layout.tsx; then
  echo -e "  ${GREEN}✓${NC} Font display optimization"
else
  echo -e "  ${YELLOW}⚠${NC}  Font display not optimized"
fi

# Check for preconnect
if grep -q "preconnect" app/layout.tsx; then
  echo -e "  ${GREEN}✓${NC} Resource hints (preconnect)"
else
  echo -e "  ${YELLOW}⚠${NC}  Missing resource hints"
fi

echo ""
echo "📝 Next Steps:"
echo "  1. Run: npm run dev"
echo "  2. Open: http://localhost:3000"
echo "  3. Chrome DevTools → Lighthouse → Run Analysis"
echo "  4. Target: Performance > 90"
echo ""
echo "🎯 Optimization Goals:"
echo "  • LCP < 2.5s"
echo "  • FID < 100ms"
echo "  • CLS < 0.1"
echo "  • Total bundle < 500KB gzipped"
echo ""
