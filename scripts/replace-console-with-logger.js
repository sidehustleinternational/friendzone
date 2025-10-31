#!/usr/bin/env node

/**
 * Script to replace console.log with logger throughout the codebase
 * This improves security by sanitizing sensitive data in logs
 */

const fs = require('fs');
const path = require('path');

// Files to process (all remaining files with console calls)
const FILES_TO_PROCESS = [
  // Already processed
  'src/services/firebase.ts',
  'src/services/locationService.ts',
  'src/services/locationServiceV2.ts',
  'src/services/notificationService.ts',
  'src/screens/AddFriendsScreen.tsx',
  'src/screens/HomesScreen.tsx',
  'src/screens/FriendsScreen.tsx',
  'src/screens/ProfileScreen.tsx',
  'src/screens/AuthScreen.tsx',
  'src/services/phoneAuth.ts',
  'src/services/appleAuth.ts',
  'src/services/googleAuth.ts',
  // Remaining files
  'src/navigation/RootNavigator.tsx',
  'src/navigation/MainTabNavigator.tsx',
  'src/screens/HomesScreenSimple.tsx',
  'src/screens/SplashScreen.tsx',
  'src/screens/HomesScreenExact.tsx',
  'src/screens/SelectFriendsScreen.tsx',
  'src/screens/OnboardingScreen.tsx',
  'src/screens/SelectZonesScreen.tsx',
  'src/screens/HelpSupportScreen.tsx',
  'src/screens/BroadcastScreen.tsx',
  'src/screens/AddFriendsScreenTest.tsx',
  'src/screens/TestScreen.tsx',
  'src/screens/AddFriendsScreenNew.tsx',
  'src/services/geocoding.ts',
  'src/services/locationDecryption.ts',
  'src/services/location.ts',
  'src/services/smsService.ts',
  'src/services/configService.ts',
  'src/services/friendNotificationService.ts',
  'src/services/emailAuth.ts',
];

function addLoggerImport(content, filePath) {
  // Check if logger is already imported
  if (content.includes("from '../utils/logger'") || content.includes("from './utils/logger'")) {
    return content;
  }

  // Determine the correct relative path to logger
  const depth = filePath.split('/').length - 2; // -2 for 'src' and filename
  const relativePath = '../'.repeat(depth) + 'utils/logger';

  // Find the last import statement
  const lines = content.split('\n');
  let lastImportIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ') && !lines[i].includes('import type')) {
      lastImportIndex = i;
    }
    // Stop at first non-import, non-comment line
    if (lines[i].trim() && 
        !lines[i].trim().startsWith('import ') && 
        !lines[i].trim().startsWith('//') &&
        !lines[i].trim().startsWith('/*') &&
        !lines[i].trim().startsWith('*')) {
      break;
    }
  }

  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, `import { logger } from '${relativePath}';`);
    return lines.join('\n');
  }

  // If no imports found, add at the top after any comments
  let insertIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('//') && 
        !lines[i].trim().startsWith('/*') &&
        !lines[i].trim().startsWith('*') &&
        lines[i].trim() !== '') {
      insertIndex = i;
      break;
    }
  }
  
  lines.splice(insertIndex, 0, `import { logger } from '${relativePath}';`);
  return lines.join('\n');
}

function replaceConsoleCalls(content) {
  // Replace console.log with logger.debug
  content = content.replace(/console\.log\(/g, 'logger.debug(');
  
  // Replace console.error with logger.error
  content = content.replace(/console\.error\(/g, 'logger.error(');
  
  // Replace console.warn with logger.warn
  content = content.replace(/console\.warn\(/g, 'logger.warn(');
  
  // Replace console.info with logger.info
  content = content.replace(/console\.info\(/g, 'logger.info(');
  
  return content;
}

function processFile(filePath) {
  const fullPath = path.join(process.cwd(), filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  File not found: ${filePath}`);
    return { processed: false, changes: 0 };
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Count console calls before replacement
  const consoleLogCount = (content.match(/console\.log\(/g) || []).length;
  const consoleErrorCount = (content.match(/console\.error\(/g) || []).length;
  const consoleWarnCount = (content.match(/console\.warn\(/g) || []).length;
  const consoleInfoCount = (content.match(/console\.info\(/g) || []).length;
  const totalChanges = consoleLogCount + consoleErrorCount + consoleWarnCount + consoleInfoCount;

  if (totalChanges === 0) {
    console.log(`✓ ${filePath} - No console calls found`);
    return { processed: false, changes: 0 };
  }

  // Add logger import
  let newContent = addLoggerImport(content, filePath);
  
  // Replace console calls
  newContent = replaceConsoleCalls(newContent);
  
  // Write back to file
  fs.writeFileSync(fullPath, newContent, 'utf8');
  
  console.log(`✅ ${filePath} - Replaced ${totalChanges} console calls`);
  console.log(`   - console.log: ${consoleLogCount}`);
  console.log(`   - console.error: ${consoleErrorCount}`);
  console.log(`   - console.warn: ${consoleWarnCount}`);
  console.log(`   - console.info: ${consoleInfoCount}`);
  
  return { processed: true, changes: totalChanges };
}

// Main execution
console.log('🔧 Replacing console calls with logger...\n');

let totalProcessed = 0;
let totalChanges = 0;

for (const file of FILES_TO_PROCESS) {
  const result = processFile(file);
  if (result.processed) {
    totalProcessed++;
    totalChanges += result.changes;
  }
}

console.log('\n' + '='.repeat(50));
console.log(`✅ Complete! Processed ${totalProcessed} files`);
console.log(`📊 Total console calls replaced: ${totalChanges}`);
console.log('='.repeat(50));
console.log('\n⚠️  IMPORTANT: Review changes with "git diff" before committing');
console.log('💡 Test the app to ensure logging works correctly\n');
