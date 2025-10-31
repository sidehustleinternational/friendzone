# Firebase Authentication Debug Checklist

## Issue: `auth/network-request-failed` on physical device

## ✅ What We've Confirmed:
1. ✅ Firebase config is correct (API key, project ID, app ID)
2. ✅ API key works from computer (Node.js test passed)
3. ✅ Bundle ID is correct: `com.jamiegoldstein.FriendZone`
4. ✅ New iOS app added to Firebase Console
5. ✅ Simulator works fine (uses same config)

## ❌ What's Failing:
- Physical device gets `auth/network-request-failed` after ~1 minute
- Apple Sign-In completes locally but Firebase auth fails

## 🔍 Root Cause Analysis:

The API key `AIzaSyAiYx6hUO97uuiRwmH4sRiFjrb9g3ZMECk` is likely restricted in Google Cloud Console.

### Check These Settings:

#### 1. Google Cloud Console API Key Restrictions
**URL:** https://console.cloud.google.com/apis/credentials

**Find the key:** `AIzaSyAiYx6hUO97uuiRwmH4sRiFjrb9g3ZMECk`

**Check:**
- [ ] Application restrictions: Should be "iOS apps"
- [ ] Bundle IDs: Should include `com.jamiegoldstein.FriendZone`
- [ ] API restrictions: Should allow "Identity Toolkit API"

**Common Issue:** The bundle ID might be set to `com.jamiegoldstein.homerexpo` instead of `com.jamiegoldstein.FriendZone`

#### 2. Firebase Console Authentication
**URL:** https://console.firebase.google.com/project/homer-323fe/authentication/providers

**Check:**
- [ ] Apple Sign-In is ENABLED
- [ ] No IP restrictions or other limitations

#### 3. Firebase Console iOS App
**URL:** https://console.firebase.google.com/project/homer-323fe/settings/general

**Check:**
- [ ] iOS app with bundle ID `com.jamiegoldstein.FriendZone` exists
- [ ] App ID matches: `1:761933707709:ios:ec5767d76b766b44803ad4`

## 🎯 Most Likely Fix:

The API key in Google Cloud Console needs to have the bundle ID updated from `com.jamiegoldstein.homerexpo` to `com.jamiegoldstein.FriendZone`.

### Steps to Fix:
1. Go to: https://console.cloud.google.com/apis/credentials
2. Click on API key: `AIzaSyAiYx6hUO97uuiRwmH4sRiFjrb9g3ZMECk`
3. Under "Application restrictions" → "iOS apps"
4. Update bundle ID to: `com.jamiegoldstein.FriendZone`
5. Click "Save"
6. Wait 5 minutes for changes to propagate
7. Test Build 202 on physical device

## 🔄 Alternative: Create Unrestricted Key (Temporary Test)

If you want to test immediately:
1. Create a NEW API key in Google Cloud Console
2. Set "Application restrictions" to "None"
3. Update `firebaseConfig.ts` with the new key
4. Test on device
5. If it works, the issue is confirmed to be bundle ID restrictions
6. Then properly configure the restricted key

## 📱 Why Simulator Works But Device Doesn't:

The simulator might be bypassing some iOS restrictions, or the API key restrictions only apply to physical devices. This is common with iOS API key restrictions.
