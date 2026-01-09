#!/bin/bash
set -e

# Local CI verification script
# Runs all checks that GitHub Actions CI would run
# Use this when GitHub Actions billing issues prevent CI from running

echo "🔍 Running local CI checks..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0

run_check() {
  local name="$1"
  local command="$2"

  echo -e "${YELLOW}▶ $name${NC}"
  if eval "$command"; then
    echo -e "${GREEN}✓ $name passed${NC}"
    echo ""
  else
    echo -e "${RED}✗ $name failed${NC}"
    echo ""
    FAILED=1
  fi
}

# 1. Lint
run_check "Lint" "npm run lint"

# 2. Type Check
run_check "Type Check" "npx tsc --noEmit"

# 3. Unit Tests (fast)
run_check "Unit Tests" "NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key ANTHROPIC_API_KEY=test-api-key ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef npm run test:fast"

# 4. Build
run_check "Build" "NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key ANTHROPIC_API_KEY=test-api-key ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef npm run build"

# 5. Security Audit (informational only)
echo -e "${YELLOW}▶ Security Audit${NC}"
if npm audit --audit-level=high; then
  echo -e "${GREEN}✓ Security Audit passed${NC}"
else
  echo -e "${YELLOW}⚠ Security Audit found issues (non-blocking)${NC}"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All CI checks passed locally${NC}"
  echo ""
  echo "Safe to merge even if GitHub Actions billing is blocking CI."
  exit 0
else
  echo -e "${RED}✗ Some CI checks failed${NC}"
  echo ""
  echo "Fix issues before merging."
  exit 1
fi
