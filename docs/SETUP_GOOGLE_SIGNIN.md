# Google Sign-In Setup Guide

## Step 1: Enable Google Sign-In in Firebase Console

1. Go to: https://console.firebase.google.com/project/homer-323fe/authentication/providers

2. Click on **"Google"** in the Sign-in providers list

3. Click **"Enable"** toggle

4. **Project support email**: Select your email from dropdown

5. Click **"Save"**

## Step 2: Get Web Client ID

After enabling Google Sign-In, you'll see:

**Web SDK configuration**
- Web client ID: `761933707709-XXXXXXXXXX.apps.googleusercontent.com`
- Web client secret: (you don't need this for mobile)

**Copy the Web client ID** - you'll need it in the next step.

## Step 3: Update the Code

Open `src/services/googleAuth.ts` and replace:

```typescript
const WEB_CLIENT_ID = '761933707709-YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
```

With your actual Web Client ID from Step 2.

## Step 4: Configure iOS (for production builds)

For production iOS builds, you'll need to:

1. **Get iOS Client ID** from Firebase Console (same page as Web Client ID)

2. **Add to app.json**:
```json
{
  "expo": {
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist",
      "config": {
        "googleSignIn": {
          "reservedClientId": "com.googleusercontent.apps.YOUR_IOS_CLIENT_ID"
        }
      }
    }
  }
}
```

3. **Download GoogleService-Info.plist**:
   - Go to: https://console.firebase.google.com/project/homer-323fe/settings/general
   - Under "Your apps" → iOS app
   - Click "Download GoogleService-Info.plist"
   - Place it in your project root

## Step 5: Test in Development

For Expo Go (development), you only need the Web Client ID. The iOS configuration is for production builds.

**Test the sign-in:**
1. Run `npx expo start`
2. Open app in simulator
3. Tap "Sign in with Google"
4. Should open Google sign-in flow

## Troubleshooting

### "Developer Error" or "Invalid Client"
- Make sure you copied the correct Web Client ID
- Check that Google Sign-In is enabled in Firebase Console
- Wait a few minutes after enabling (can take time to propagate)

### "SIGN_IN_CANCELLED"
- User cancelled the sign-in flow
- This is normal behavior

### "PLAY_SERVICES_NOT_AVAILABLE"
- Only affects Android
- iOS doesn't need Google Play Services

### Sign-in works but user not created
- Check Firestore security rules allow user creation
- Check console logs for errors

## Current Status

✅ Google Sign-In package installed
✅ Service code created
⏳ Need to get Web Client ID from Firebase
⏳ Need to update googleAuth.ts with Web Client ID
⏳ Need to update AuthScreen UI

## Next Steps

1. Enable Google Sign-In in Firebase Console
2. Copy Web Client ID
3. Update `src/services/googleAuth.ts`
4. Update AuthScreen to show Google Sign-In button
5. Test!

## Resources

- [Firebase Google Sign-In Docs](https://firebase.google.com/docs/auth/web/google-signin)
- [React Native Google Sign-In](https://github.com/react-native-google-signin/google-signin)
- [Expo Google Sign-In Guide](https://docs.expo.dev/guides/google-authentication/)
