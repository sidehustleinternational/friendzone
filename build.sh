#!/bin/bash
set -e

# Get current branch
BRANCH=$(git branch --show-current)

echo "🌳 Current branch: $BRANCH"

# Warn if building from main
if [ "$BRANCH" = "main" ]; then
  echo ""
  echo "⚠️  WARNING: You are building from MAIN branch!"
  echo "   This should only be done for production releases."
  echo "   For testing new features, use a feature branch instead."
  echo ""
  read -p "Are you sure you want to build from main? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo "❌ Build cancelled"
    exit 1
  fi
fi

echo "🔄 Pulling latest changes from GitHub..."
git pull origin $BRANCH

echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "📦 Current build number:"
CURRENT=$(grep '"buildNumber"' app.json | grep -o '[0-9]*')
echo "  Build $CURRENT"

NEXT=$((CURRENT + 1))
echo ""
echo "🆙 Incrementing to Build $NEXT..."

# Check if running on Mac or Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
  # Mac requires empty string after -i
  sed -i '' "s/\"buildNumber\": \"$CURRENT\"/\"buildNumber\": \"$NEXT\"/" app.json
else
  # Linux (Codespaces)
  sed -i "s/\"buildNumber\": \"$CURRENT\"/\"buildNumber\": \"$NEXT\"/" app.json
fi

# Get the last commit message for context
LAST_COMMIT=$(git log -1 --pretty=%B origin/$BRANCH | head -1)

echo ""
echo "💾 Committing build number..."
git add app.json
git commit -m "Build $NEXT [$BRANCH]: $LAST_COMMIT"
git push origin $BRANCH

echo ""
echo "🏗️  Starting EAS build for iOS..."
echo "  Build: $NEXT"
echo "  Branch: $BRANCH"
echo "  Last change: $LAST_COMMIT"
echo ""

# Show what features are in this build
echo "📋 Features in this build:"
if grep -q "mergeFriendsWithRequests" src/screens/FriendsScreen.tsx 2>/dev/null; then
  echo "  ✅ Merged friends (no duplicates)"
else
  echo "  ❌ Merged friends (not included)"
fi

if grep -q "proximityAlertEnabled" src/types/index.ts 2>/dev/null; then
  echo "  ✅ Proximity detection"
else
  echo "  ❌ Proximity detection (not included)"
fi

if grep -q "broadcastDuration" src/screens/BroadcastScreen.tsx 2>/dev/null; then
  echo "  ✅ Broadcast timer"
else
  echo "  ❌ Broadcast timer (not included)"
fi

echo ""

eas build --platform ios --profile production

echo ""
echo "✅ Build $NEXT started successfully!"
echo "📱 Check TestFlight in ~15-20 minutes"
