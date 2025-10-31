# Build 204 - Critical Apple Sign-In Fixes

## Issues Fixed:

### 1. ✅ Firebase API Key Configuration
**Problem:** Using API key with wrong bundle ID restrictions
**Solution:** Switched to Firebase iOS key with no application restrictions
- Old key: `AIzaSyAiYx6hUO97uuiRwmH4sRiFjrb9g3ZMECk` (had restrictions)
- New key: `AIzaSyACgplq_hJ9epBB559LZ_1D8_pjIw33XJo` (no app restrictions)
- Has required API permissions: Identity Toolkit, Token Service, Firestore

### 2. ✅ Auth Token Propagation Delay
**Problem:** Firestore permission-denied error after Apple Sign-In
**Root Cause:** `onAuthStateChanged` fires before auth token propagates to Firestore
**Solution:** Added 500ms delay before fetching user document
- Gives Firebase time to propagate auth token
- Prevents permission-denied errors
- Common pattern for Firebase auth + Firestore

### 3. ✅ Comprehensive Debug Logging
**Added logging to track:**
- When `onAuthStateChanged` fires
- User ID and email
- User document fetch status
- Phone number check
- Onboarding status
- Navigation decisions

### 4. ✅ Navigation Flow Fix
**Problem:** App returns to auth screen after successful Apple Sign-In
**Solution:** Rely on `onAuthStateChanged` listener instead of manual navigation
- RootNavigator's auth listener checks for phoneNumber
- If phoneNumber exists, navigates to main automatically
- Simpler, more reliable flow

## Expected Behavior:

### On Physical Device (Build 204):
1. User clicks "Continue with Apple" ✅
2. Apple Sign-In completes ✅
3. Firebase auth completes (no network error) ✅
4. Auth token propagates to Firestore (500ms delay) ✅
5. User document fetched successfully ✅
6. Phone number detected ✅
7. Navigation to main app ✅

### Previous Behavior (Build 202):
1. User clicks "Continue with Apple" ✅
2. Apple Sign-In completes ✅
3. Firebase auth fails with `auth/network-request-failed` ❌
4. App returns to auth screen ❌

## Testing Checklist:

- [ ] Install Build 204 from TestFlight
- [ ] Click "Continue with Apple"
- [ ] Complete Face ID/Touch ID
- [ ] Wait ~1 minute for auth flow
- [ ] Verify navigation to main app
- [ ] Check Firestore debugLogs for any errors

## If Build 204 Still Fails:

Check Firestore debugLogs collection for:
- `auth_error` entries
- `permission_denied` errors
- Missing `onAuthStateChanged` logs

The comprehensive logging will show exactly where the flow breaks.
