#!/bin/bash
# Check test coverage for new features
# Run manually or via pre-commit hook (warning only)

set -e

YELLOW='\033[1;33m'
NC='\033[0m'

warnings=0

echo "🔍 Checking test coverage..."

# Find source files without corresponding test files
for file in $(find src -name "*.ts" -o -name "*.tsx" 2>/dev/null | grep -v "\.test\." | grep -v "\.d\.ts" || true); do
  # Skip layout, page, and config files (Next.js conventions)
  if [[ "$file" == *"/layout."* ]] || [[ "$file" == *"/page."* ]] || [[ "$file" == *".config."* ]]; then
    continue
  fi

  # Skip API routes (tested via integration tests)
  if [[ "$file" == *"/api/"* ]]; then
    continue
  fi

  # Check for corresponding test file
  test_file="${file%.*}.test.${file##*.}"

  if [ ! -f "$test_file" ] && [ ! -f "tests/unit/$(basename ${file%.*}).test.ts" ]; then
    # Only warn for lib/ and components/ (core business logic)
    if [[ "$file" == *"/lib/"* ]] || [[ "$file" == *"/components/"* ]]; then
      echo -e "${YELLOW}⚠️  May need test: $file${NC}"
      ((warnings++)) || true
    fi
  fi
done

if [ $warnings -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠️  $warnings file(s) in lib/ or components/ may need tests${NC}"
  echo "   Run: pnpm test:coverage to check actual coverage"
else
  echo "✅ All core files appear to have tests"
fi

exit 0
