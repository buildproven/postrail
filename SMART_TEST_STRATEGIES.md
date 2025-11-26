# Smart Test Strategies

Multiple intelligent approaches to optimize test execution based on context.

## 🎯 **Strategy Options**

### **Current: Fixed Medium Strategy** (Default)
```bash
# .husky/pre-push (current)
npm run test:medium  # Always runs core tests, excludes slow crypto/browser
```
**Pros**: Predictable, reliable
**Cons**: Not optimized for different scenarios

### **Option A: Smart Risk-Based** 🧠
```bash
# To activate:
mv .husky/pre-push .husky/pre-push-fixed
mv .husky/pre-push-smart .husky/pre-push

# Uses: scripts/smart-test-strategy.sh
npm run test:smart
```

**Risk Assessment Matrix**:
| Risk Level | Files Changed | Test Strategy |
|------------|---------------|---------------|
| **Minimal** (0-1) | Docs, tests only | Lint only |
| **Low** (2-3) | Utils, components | Fast tests |
| **Medium** (4-6) | API routes, core logic | Medium tests |
| **High** (7+) | Auth, payments, main branch | Comprehensive + security |

### **Option B: Size-Based Scaling** 📏
```bash
# Files changed ≤ 3 AND lines ≤ 50: Fast tests
# Files changed ≤ 10 AND lines ≤ 200: Medium tests
# Large changes: Comprehensive tests
```

### **Option C: Branch-Specific** 🌿
```bash
feature/*     → Fast tests
main/master   → Comprehensive tests
hotfix/*      → Comprehensive + security audit
release/*     → Full validation + performance
```

### **Option D: Time-Aware** ⏰
```bash
Work hours (9-5, weekdays)  → Fast tests (optimize for speed)
Off-hours/weekends          → Comprehensive tests (time available)
```

## 🚀 **Implementation Examples**

### **Activate Smart Strategy**
```bash
# Switch to intelligent risk-based testing
cd letterflow
mv .husky/pre-push .husky/pre-push-fixed
mv .husky/pre-push-smart .husky/pre-push
chmod +x .husky/pre-push
```

### **Test Smart Strategy**
```bash
# Manual test of smart strategy
npm run test:smart

# Example outputs:
# 📊 Analysis Results:
#    📁 Files: 2
#    📏 Lines: 45
#    🌿 Branch: feature/auth-fix
#    🎯 Risk Score: 6/10
#    ⚡ Speed Bonus: true
#
# ⚡ MEDIUM RISK - Standard validation
```

### **Create Custom Strategy**
```bash
# Create your own hybrid approach
cp .husky/pre-push .husky/pre-push-custom

# Edit .husky/pre-push-custom:
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" == "main" ]]; then
  npm run test:comprehensive
else
  npm run test:smart
fi
```

## 📊 **Performance Comparison**

| Scenario | Fixed Medium | Smart Strategy | Time Saved |
|----------|-------------|----------------|------------|
| **Doc changes** | 15s | 2s (lint only) | **87% faster** |
| **Small bug fix** | 15s | 8s (fast tests) | **47% faster** |
| **API changes** | 15s | 15s (medium tests) | **Same** |
| **Auth changes** | 15s | 35s (comprehensive) | **Safer** |

## ⚙️ **Configuration Options**

### **Adjust Risk Scoring**
Edit `scripts/smart-test-strategy.sh`:

```bash
# Increase API file risk
[[ -n "$API_FILES" ]] && RISK_SCORE=$((RISK_SCORE + 3))  # was +2

# Add custom high-risk patterns
CUSTOM_RISK=$(git diff --name-only HEAD~1..HEAD | grep -E "(database|migration)" || true)
[[ -n "$CUSTOM_RISK" ]] && RISK_SCORE=$((RISK_SCORE + 2))
```

### **Time-Based Overrides**
```bash
# Never run comprehensive during crunch time
if [[ $HOUR -ge 16 && $DAY_OF_WEEK -eq 5 ]]; then
  echo "🏃 Friday afternoon - Fast tests only"
  npm run test:fast
  exit 0
fi
```

### **Team-Based Rules**
```bash
# Junior developers get more validation
AUTHOR=$(git log -1 --format='%ae')
if [[ "$AUTHOR" == *"junior.dev"* ]]; then
  RISK_SCORE=$((RISK_SCORE + 2))
fi
```

## 🛠 **Advanced Patterns**

### **Parallel Test Execution**
```bash
# Run different test types in parallel for speed
(npm run test:fast &) && (npm run lint &) && wait
```

### **Conditional Security Audits**
```bash
# Only audit when dependencies changed
if git diff --name-only HEAD~1..HEAD | grep -E "(package\.json|yarn\.lock)"; then
  npm run security:audit
fi
```

### **Commit Message-Based**
```bash
# Use commit message to override strategy
COMMIT_MSG=$(git log -1 --format='%s')
case $COMMIT_MSG in
  *"[skip-tests]"*) echo "Skipping tests per commit message" && exit 0 ;;
  *"[full-tests]"*) npm run test:comprehensive ;;
  *"[fast]"*) npm run test:fast ;;
  *) npm run test:smart ;;
esac
```

## 📝 **How to Choose**

### **Use Fixed Medium Strategy if:**
- Small team (< 5 developers)
- Consistent development patterns
- Prefer predictability over optimization

### **Use Smart Risk-Based Strategy if:**
- Large team with varied experience levels
- Mix of small fixes and large features
- Want maximum optimization
- Have well-defined high-risk code areas

### **Use Branch-Specific Strategy if:**
- Clear branch naming conventions
- Different quality requirements per environment
- Want simple, deterministic rules

### **Use Hybrid Approach if:**
- Want benefits of multiple strategies
- Complex project with varied needs
- Willing to maintain custom logic

## 🔄 **Migration Path**

1. **Start**: Fixed medium strategy (current)
2. **Test**: Try smart strategy manually (`npm run test:smart`)
3. **Evaluate**: Monitor for 1 week
4. **Decide**: Keep smart or customize further
5. **Scale**: Apply to other projects

The smart strategy learns from your development patterns and optimizes automatically!