#!/bin/bash

# Intelligent Test Strategy - Combines multiple factors
set -e

echo "🧠 Analyzing commit for optimal test strategy..."

# Collect metrics
CHANGED_FILES=$(git diff --name-only HEAD~1..HEAD | wc -l | tr -d ' ')
CHANGED_LINES=$(git diff --stat HEAD~1..HEAD | tail -1 | grep -o '[0-9]* insertions' | grep -o '[0-9]*' || echo "0")
CURRENT_BRANCH=$(git branch --show-current)
HOUR=$(date +%H)
DAY_OF_WEEK=$(date +%u)

# Risk assessment
HIGH_RISK_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "(auth|payment|security|crypto|api/generate|api/scrape)" || true)
API_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "api/" || true)
TEST_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "test|spec" || true)
CONFIG_FILES=$(git diff --name-only HEAD~1..HEAD | grep -E "(package\.json|husky|\.env)" || true)

# Calculate risk score (0-10)
RISK_SCORE=0

# File-based risk
[[ -n "$HIGH_RISK_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 4))
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
echo "📊 Analysis Results:"
echo "   📁 Files: $CHANGED_FILES"
echo "   📏 Lines: $CHANGED_LINES"
echo "   🌿 Branch: $CURRENT_BRANCH"
echo "   🎯 Risk Score: $RISK_SCORE/10"
echo "   ⚡ Speed Bonus: $SPEED_BONUS"
echo ""

if [[ $RISK_SCORE -ge 7 ]]; then
  echo "🔄 HIGH RISK - Comprehensive validation required"
  echo "   • All tests + security audit + performance checks"
  npm run test:comprehensive
  npm run security:audit
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