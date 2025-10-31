# Firebase App Check Setup Guide

## What is App Check?

Firebase App Check protects your backend resources from abuse by preventing unauthorized clients from accessing your Firebase services. It works with DeviceCheck on iOS to verify that requests come from your authentic app.

## Setup Steps

### 1. Enable App Check in Firebase Console

1. Go to: https://console.firebase.google.com/project/homer-323fe/appcheck
2. Click **"Get Started"**
3. Select your iOS app: `com.jamiegoldstein.FriendZone`
4. Choose **"App Attest"** as the provider (recommended for iOS 14+)
   - Or **"DeviceCheck"** for iOS 11-13 support
5. Click **"Save"**

### 2. Enable App Check for Services

In the Firebase Console App Check page:

1. **Firestore**
   - Click "Firestore"
   - Toggle "Enforce" to ON
   - This will block requests without valid App Check tokens

2. **Authentication** (Optional but recommended)
   - Click "Authentication"
   - Toggle "Enforce" to ON

3. **Storage** (If you add it later)
   - Click "Storage"
   - Toggle "Enforce" to ON

### 3. Get ReCaptcha Key for Web (Optional)

If you plan to support web:

1. Go to: https://www.google.com/recaptcha/admin
2. Register a new site
3. Choose reCAPTCHA v3
4. Add your domain
5. Copy the **Site Key**
6. Replace the placeholder in `firebaseConfig.ts`:
   ```typescript
   provider: new ReCaptchaV3Provider('YOUR_ACTUAL_SITE_KEY_HERE')
   ```

### 4. Development Testing

For development/testing:

1. Run your app in development mode
2. Check console for debug token
3. Go to: https://console.firebase.google.com/project/homer-323fe/appcheck/apps
4. Click your app
5. Click "Manage debug tokens"
6. Add the debug token from your console
7. Now your dev app will pass App Check

### 5. Verify It's Working

After setup:

1. Run your app
2. Try to access Firestore
3. Check console logs:
   - ✅ `🔐 App Check initialized for production`
   - ❌ If you see errors, check the setup steps

4. In Firebase Console:
   - Go to App Check dashboard
   - You should see request metrics
   - Verify requests are being validated

## Current Status

✅ App Check code added to `firebaseConfig.ts`
⏳ Needs Firebase Console configuration (follow steps above)
⏳ Needs ReCaptcha key for production (if using web)

## Troubleshooting

### "App Check token is invalid"
- Make sure you've registered your app in Firebase Console
- Check that bundle ID matches: `com.jamiegoldstein.FriendZone`
- Verify App Attest/DeviceCheck is enabled

### "Failed to get App Check token"
- In development: Add debug token to Firebase Console
- In production: Verify app is signed with correct provisioning profile

### App works in dev but not production
- Make sure enforcement is not too strict
- Check that production build has correct bundle ID
- Verify App Attest is working (iOS 14+ required)

## Security Benefits

Once enabled, App Check:
- ✅ Prevents unauthorized apps from accessing your Firebase
- ✅ Blocks scrapers and bots
- ✅ Reduces quota abuse
- ✅ Adds another layer of security on top of Security Rules
- ✅ Works automatically without user interaction

## Next Steps

1. Complete Firebase Console setup (steps above)
2. Test in development with debug token
3. Test in production build
4. Monitor App Check metrics in Firebase Console
5. Consider enabling enforcement for all services

## Resources

- [Firebase App Check Docs](https://firebase.google.com/docs/app-check)
- [iOS Setup Guide](https://firebase.google.com/docs/app-check/ios/devicecheck-provider)
- [App Attest vs DeviceCheck](https://firebase.google.com/docs/app-check/ios/devicecheck-provider#app-attest)
