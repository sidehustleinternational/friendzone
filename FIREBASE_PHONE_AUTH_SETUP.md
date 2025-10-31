# Firebase Phone Authentication Setup

## ✅ What's Implemented

Real Firebase Phone Authentication that:
- Sends actual SMS codes to phone numbers
- Verifies codes against Firebase
- Links phone credential to Apple Sign-In account
- Prevents phone number impersonation

## 🔧 Firebase Console Configuration Required

### 1. Enable Phone Authentication

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `homer-323fe`
3. Go to **Authentication** → **Sign-in method**
4. Click on **Phone** provider
5. Click **Enable**
6. Click **Save**

### 2. Add Test Phone Numbers (Optional - for testing)

While testing, you can add test phone numbers that don't require real SMS:

1. In **Authentication** → **Sign-in method** → **Phone**
2. Scroll to **Phone numbers for testing**
3. Add test numbers with codes, e.g.:
   - Phone: `+15555550100`
   - Code: `123456`

### 3. Configure App Check (Production)

For production, Firebase requires App Check to prevent abuse:

1. Go to **App Check** in Firebase Console
2. Click **Register** for your iOS app
3. Select **DeviceCheck** (for iOS)
4. Follow the setup instructions

**Note:** The current implementation uses a mock verifier. For production, you'll need to either:
- Set up App Check (recommended)
- Or use a backend Cloud Function to send SMS

## ⚠️ Current Limitations

### Mock Verifier
The code currently uses a mock reCAPTCHA verifier:
```typescript
const verifier = {
  type: 'recaptcha',
  verify: () => Promise.resolve('mock-token')
};
```

This may work for testing but **will not work in production** without App Check.

### Production Solution Options

**Option 1: App Check (Recommended)**
- Enable App Check in Firebase Console
- Register iOS app with DeviceCheck
- Update code to use real App Check tokens

**Option 2: Backend Function**
- Create a Cloud Function to send SMS
- Call function from app instead of direct Firebase call
- Function handles verification internally

## 📱 Testing

### With Test Phone Numbers
1. Add test number in Firebase Console
2. Use that number in the app
3. Enter the test code you configured
4. Should verify successfully

### With Real Phone Numbers
1. Enter real phone number
2. Firebase sends actual SMS
3. Enter code from SMS
4. Should verify successfully

## 🚨 Potential Issues

### "reCAPTCHA verification failed"
- **Cause:** Mock verifier not accepted by Firebase
- **Solution:** Enable App Check or use backend function

### "SMS quota exceeded"
- **Cause:** Firebase free tier has SMS limits
- **Solution:** Upgrade to Blaze plan or use test numbers

### "Invalid phone number"
- **Cause:** Phone number not in E.164 format
- **Solution:** Code already formats as +1XXXXXXXXXX

## 📊 Firebase Pricing

- **Free tier:** 10 SMS/day
- **Blaze plan:** $0.01 per SMS (US/Canada)
- Test phone numbers don't count toward quota

## 🔐 Security Notes

- Phone credential is linked to Apple Sign-In account
- User must have access to the phone number
- Prevents impersonation attacks
- Phone number marked as verified in Firestore

## 📝 Next Steps

1. ✅ Enable Phone Auth in Firebase Console
2. ⚠️ Test with test phone numbers first
3. ⚠️ Set up App Check for production
4. ✅ Monitor SMS usage in Firebase Console
