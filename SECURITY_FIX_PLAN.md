# 🔐 Security Fix Plan - Preserving Apple Sign-In

## 🚨 Critical Issues to Fix

### ✅ **Phase 1: Safe API Key Management (No Apple Sign-In Risk)**
1. **Move API keys to environment variables**
   - Create `.env` file (gitignored)
   - Use `expo-constants` for runtime access
   - Keep current keys working during transition

2. **Clean up exposed keys in test files**
   - Remove old API keys from test files
   - Update documentation files
   - Clean commit history if needed

### ⚠️ **Phase 2: App Check (HIGH RISK - Apple Sign-In)**
**CRITICAL**: App Check was previously BLOCKING Apple Sign-In!

**From Memory**: App Check with ReCaptchaV3Provider was causing `auth/network-request-failed` errors on physical devices while working fine in simulator.

**Safe Approach**:
1. **Keep App Check disabled until Apple Sign-In is fully tested**
2. **When ready, use DeviceCheck provider (not ReCaptcha)**
3. **Test thoroughly on physical device before enabling**

### ✅ **Phase 3: Production Logging (Safe)**
1. **Remove console.log statements**
2. **Implement proper log levels**
3. **Remove API key fragments from logs**

## 🛡️ Implementation Strategy

### Step 1: Environment Variables (SAFE)
```typescript
// Before (risky)
const apiKey = "AIzaSyACgplq_hJ9epBB559LZ_1D8_pjIw33XJo";

// After (secure)
const apiKey = Constants.expoConfig?.extra?.firebaseApiKey;
```

### Step 2: App Check (CAREFUL!)
```typescript
// Current (working but insecure)
// App Check disabled temporarily to test Apple Sign-In

// Future (secure but needs testing)
// Enable DeviceCheck provider for iOS
// Test extensively on physical device
```

### Step 3: Logging (SAFE)
```typescript
// Before (risky)
console.log('API Key:', apiKey);

// After (secure)
logger.debug('API configured'); // No sensitive data
```

## 🧪 Testing Plan

### Apple Sign-In Verification
1. **Test on simulator** (should work)
2. **Test on physical device** (critical - this is where it failed before)
3. **Test with new API keys**
4. **Test with App Check enabled** (only after other tests pass)

### Security Verification
1. **Verify no API keys in source code**
2. **Verify no sensitive data in logs**
3. **Verify App Check working without breaking auth**

## 📋 Rollback Plan

If Apple Sign-In breaks:
1. **Immediately revert to previous API keys**
2. **Disable App Check again**
3. **Test on physical device**
4. **Investigate specific error messages**

## 🎯 Success Criteria

- ✅ No API keys in source code
- ✅ Apple Sign-In working on physical device
- ✅ No sensitive data in production logs
- ✅ App Check enabled (when safe)
- ✅ All existing functionality preserved

## ⚠️ Critical Reminders

1. **Apple Sign-In is currently working** - don't break it!
2. **Services ID must match Firebase Console**: `com.jamiegoldstein.FriendZone.signin`
3. **API key restrictions matter** - wrong restrictions = auth failures
4. **Physical device testing is essential** - simulator can be misleading
5. **App Check + Apple Sign-In = historically problematic**

---

**Next Step**: Start with Phase 1 (API key environment variables) - lowest risk, highest security benefit.
