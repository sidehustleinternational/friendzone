#!/bin/bash
# Quick commit script for build 102

echo "Adding changed files..."
git add app.json src/screens/AuthScreen.tsx src/navigation/RootNavigator.tsx

echo "Committing..."
git commit -m "Build 102: Add phone number field and fix profile completion navigation"

echo "Done! Now run: eas build --platform ios --profile production"
