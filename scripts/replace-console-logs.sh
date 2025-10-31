#!/bin/bash

# Script to replace console.log with logger throughout the codebase
# This improves security by sanitizing sensitive data in logs

echo "🔧 Replacing console.log with logger in critical files..."

# Files to process (most sensitive first)
FILES=(
  "src/services/firebase.ts"
  "src/services/locationService.ts"
  "src/services/locationServiceV2.ts"
  "src/services/notificationService.ts"
  "src/screens/AddFriendsScreen.tsx"
  "src/screens/HomesScreen.tsx"
  "src/screens/FriendsScreen.tsx"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    
    # Replace console.log with logger.debug
    sed -i '' 's/console\.log(/logger.debug(/g' "$file"
    
    # Replace console.error with logger.error (keep as is, already correct)
    # sed -i '' 's/console\.error(/logger.error(/g' "$file"
    
    # Replace console.warn with logger.warn
    sed -i '' 's/console\.warn(/logger.warn(/g' "$file"
    
    # Replace console.info with logger.info
    sed -i '' 's/console\.info(/logger.info(/g' "$file"
    
    echo "✅ $file processed"
  else
    echo "⚠️  $file not found, skipping"
  fi
done

echo ""
echo "✅ Console.log replacement complete!"
echo ""
echo "⚠️  IMPORTANT: You must add this import to each file:"
echo "   import { logger } from '../utils/logger';"
echo ""
echo "Run 'git diff' to review changes before committing."
