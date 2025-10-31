# Apple Sign-In Fix - Build 206

## Problem
Apple Sign-In was failing with `auth/network-request-failed` error on physical iOS devices, causing users to get stuck on the "Welcome to FriendZone" screen.

## Root Cause
**Services ID was not configured in Apple Developer Console**

Apple Sign-In requires a Services ID to be registered in Apple Developer Console and configured with the Firebase authentication domain. Without this, Apple rejects the sign-in request before it even reaches Firebase.

## Investigation Steps
1. ✅ Verified Firebase API key was correct (`AIzaSyACgplq_hJ9epBB559LZ_1D8_pjIw33XJo`)
2. ✅ Confirmed API key had no application restrictions
3. ✅ Verified API key had correct API restrictions (Identity Toolkit, Token Service, Firestore)
4. ✅ Confirmed Firebase Console had Apple Sign-In enabled
5. ❌ **FOUND: No Services ID existed in Apple Developer Console**

## Solution Implemented

### 1. Created Services ID in Apple Developer Console
- **Identifier:** `com.jamiegoldstein.FriendZone.signin`
- **Sign In with Apple:** Enabled
- **Domain:** `homer-323fe.firebaseapp.com`
- **Return URL:** `https://homer-323fe.firebaseapp.com/__/auth/handler`

Note: Had to use `.signin` suffix because `com.jamiegoldstein.FriendZone` was already taken by the iOS App ID.

### 2. Updated Firebase Console
- **Location:** Authentication > Providers > Apple
- **Changed Services ID from:** `com.jamiegoldstein.FriendZone`
- **Changed Services ID to:** `com.jamiegoldstein.FriendZone.signin`

### 3. Added Firestore Logging
Enhanced `src/utils/logger.ts` to write debug and error logs to Firestore `debugLogs` collection for remote debugging on physical devices.

**Changes:**
- Import Firestore functions
- Added `writeToFirestore()` function
- Modified `logger.debug()` to write to Firestore
- Modified `logger.error()` to write to Firestore
- Sanitizes sensitive data before writing

## Files Modified

### Build 204-205 (Enhanced Logging)
- `src/services/appleAuth.ts` - Added detailed logging around `signInWithCredential`
- `src/navigation/RootNavigator.tsx` - Added comprehensive auth flow logging

### Build 206 (Firestore Logging)
- `src/utils/logger.ts` - Added Firestore logging capability

## Testing Instructions

1. **Wait 5 minutes** for Apple/Firebase changes to propagate
2. **Delete the app** from iPhone
3. **Install Build 206** from TestFlight
4. **Open the app** and click "Continue with Apple"
5. **Complete Face ID/Touch ID**
6. **Check Firestore debugLogs:**
   - Go to: https://console.firebase.google.com/project/homer-323fe/firestore/data/debugLogs
   - Look for recent logs with Apple Sign-In flow

## Expected Behavior After Fix

### Success Path:
1. User clicks "Continue with Apple"
2. Apple authentication modal appears
3. User completes Face ID/Touch ID
4. Firebase receives valid credential
5. User is signed in successfully
6. App navigates to main screen (or onboarding if first time)

### Logs to Look For:
- `🔐 Firebase credential created, attempting sign in...`
- `✅ Firebase authentication successful`
- `✅ User signed in: [uid]`
- `🏠 Returning user - going to main` OR `🎓 First time user - showing onboarding`

## Key Learning
**Services ID must exist in Apple Developer Console AND match Firebase Console configuration for Apple Sign-In to work.**

This is separate from the iOS App ID and is specifically required for web-based authentication flows like Firebase Auth.

## Verification Scripts
Created test scripts to verify API key configuration:
- `test-firebase-connection.js` - Basic connectivity test
- `test-api-key-detailed.js` - Detailed Identity Toolkit API test

Both scripts confirm API key is working correctly from development machine.

## Next Steps if Still Failing
1. Check Firestore debugLogs for exact error
2. Verify Services ID propagated (can take up to 24 hours in rare cases)
3. Verify bundle ID matches exactly in all places:
   - Xcode project
   - Firebase Console iOS app
   - Apple Developer Console App ID
   - app.json
4. Check Apple Developer Console for any warnings on Services ID
5. Verify OAuth redirect URL is exactly: `https://homer-323fe.firebaseapp.com/__/auth/handler`

## Build History
- **Build 203:** Latest before fix
- **Build 204:** Added detailed error logging in appleAuth.ts
- **Build 205:** Enhanced logging in RootNavigator.tsx
- **Build 206:** Added Firestore logging for remote debugging

---

**Status:** Awaiting Build 206 testing results
**Date:** October 16, 2025
