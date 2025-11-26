#!/bin/bash
# Daily Git sync protocol - prevents divergent branch issues
# Run this before starting any development work

set -e

echo "🔄 Git Daily Sync Protocol"
echo "=========================="

# 1. Check current status
echo "📍 Current status:"
git status --short

# 2. Fetch latest from all remotes
echo ""
echo "📥 Fetching from remote..."
git fetch origin

# 3. Check for unpushed local commits
UNPUSHED=$(git log --oneline origin/$(git branch --show-current)..HEAD 2>/dev/null | wc -l)
if [ "$UNPUSHED" -gt 0 ]; then
    echo "⚠️  You have $UNPUSHED unpushed commit(s):"
    git log --oneline origin/$(git branch --show-current)..HEAD
    echo ""
    echo "🚀 Pushing local commits..."
    git push
fi

# 4. Check if we're behind remote
BEHIND=$(git log --oneline HEAD..origin/$(git branch --show-current) 2>/dev/null | wc -l)
if [ "$BEHIND" -gt 0 ]; then
    echo "📥 You are $BEHIND commit(s) behind remote. Pulling..."
    git pull --rebase
fi

# 5. Final status
echo ""
echo "✅ Git sync complete!"
echo "📊 Final status:"
git status --short

# 6. Show recent activity
echo ""
echo "📈 Recent activity (last 5 commits):"
git log --oneline --graph -5

echo ""
echo "🎯 Repository is now synchronized and ready for development"