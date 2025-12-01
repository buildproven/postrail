#!/bin/bash
# Smart Test Strategy - Postrail
# Generated pattern from create-qa-architect
# https://www.aibuilderlab.com/cqa
set -e

echo "🧠 Analyzing changes for optimal test strategy..."

# Environment variable overrides
if [[ "$SKIP_SMART" == "1" ]]; then
  echo "⚠️  SKIP_SMART=1 - Running comprehensive tests"
  npm run test:comprehensive
  exit 0
fi

if [[ "$FORCE_COMPREHENSIVE" == "1" ]]; then
  echo "🔴 FORCE_COMPREHENSIVE=1 - Running all tests"
  npm run test:comprehensive
  exit 0
fi

if [[ "$FORCE_MINIMAL" == "1" ]]; then
  echo "⚪ FORCE_MINIMAL=1 - Running lint only"
  npm run lint && npm run format:check
  exit 0
fi

# Collect metrics
CHANGED_FILES=$(git diff --name-only HEAD~1..HEAD | wc -l | tr -d ' ')
CHANGED_LINES=$(git diff --stat HEAD~1..HEAD | tail -1 | grep -o '[0-9]* insertions' | grep -o '[0-9]*' || echo "0")
CURRENT_BRANCH=$(git branch --show-current)
HOUR=$(date +%H)
DAY_OF_WEEK=$(date +%u)

# Risk assessment - SaaS/Web Application patterns
HIGH_RISK_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "(auth|payment|security|crypto|api/generate|api/scrape|middleware)" || true)
API_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "api/|routes/|endpoints/" || true)
SECURITY_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "(auth|security|crypto|payment|billing|ssrf|rate-limit)" || true)
CONFIG_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "(package\.json|husky|\.env|tsconfig)" || true)
TEST_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "test|spec|__tests__" || true)

# Calculate risk score (0-10)
RISK_SCORE=0

# File-based risk
[[ -n "$HIGH_RISK_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 4))
[[ -n "$SECURITY_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 3))
[[ -n "$API_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 2))
[[ -n "$CONFIG_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 2))

# Size-based risk
[[ $CHANGED_FILES -gt 10 ]] && RISK_SCORE=$((RISK_SCORE + 2))
[[ $CHANGED_LINES -gt 200 ]] && RISK_SCORE=$((RISK_SCORE + 2))

# Branch-based risk
case $CURRENT_BRANCH in
  main|master|production) RISK_SCORE=$((RISK_SCORE + 3)) ;;
  hotfix/*) RISK_SCORE=$((RISK_SCORE + 4)) ;;
  release/*) RISK_SCORE=$((RISK_SCORE + 2)) ;;
esac

# Time pressure adjustment (strip leading zeros)
HOUR_NUM=$((10#$HOUR))
if [[ $HOUR_NUM -ge 9 && $HOUR_NUM -le 17 && $DAY_OF_WEEK -le 5 ]]; then
  echo "⏰ Work hours - Optimizing for speed"
  SPEED_BONUS=true
else
  SPEED_BONUS=false
fi

# Decision logic
# NOTE: test:e2e is ALWAYS excluded from pre-push (run in CI only)
# - test:e2e: Requires browser setup, CI has better Playwright infrastructure
# These run in GitHub Actions on every PR and push to main

echo "📊 Analysis Results:"
echo "   📁 Files: $CHANGED_FILES"
echo "   📏 Lines: $CHANGED_LINES"
echo "   🌿 Branch: $CURRENT_BRANCH"
echo "   🎯 Risk Score: $RISK_SCORE/10"
echo "   ⚡ Speed Bonus: $SPEED_BONUS"
echo ""

if [[ $RISK_SCORE -ge 7 ]]; then
  echo "🔄 HIGH RISK - Comprehensive validation (pre-push)"
  echo "   • All unit tests + smoke + security audit"
  echo "   • (e2e tests run in CI only)"
  npm run test:all && npm run test:smoke && npm run security:audit
elif [[ $RISK_SCORE -ge 4 ]]; then
  echo "⚡ MEDIUM RISK - Standard validation"
  echo "   • Core tests + smoke tests (excludes slow crypto/browser)"
  npm run test:medium
elif [[ $RISK_SCORE -ge 2 || "$SPEED_BONUS" == "false" ]]; then
  echo "🚀 LOW RISK - Fast validation"
  echo "   • Unit tests only (excludes integration/real tests)"
  npm run test:fast
else
  echo "✨ MINIMAL RISK - Lint only"
  echo "   • Code quality checks only"
  npm run lint && npm run format:check
fi

echo ""
echo "💡 Tip: Run 'npm run test:comprehensive' locally for full validation"
echo "💎 Smart Test Strategy powered by create-qa-architect"