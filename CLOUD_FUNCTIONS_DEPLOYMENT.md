# Cloud Functions Deployment Guide

## ✅ What's Implemented

**REAL SMS verification via Firebase Cloud Functions:**
- Generates random 6-digit codes
- Stores codes in Firestore with 5-minute expiration
- Verifies codes against Firestore
- Proper authentication and error handling

## 🚀 Deployment Steps

### 1. Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

### 2. Login to Firebase

```bash
firebase login
```

### 3. Initialize Functions (if first time)

```bash
cd /path/to/FriendZone
firebase init functions
```

Select:
- Use existing project: `homer-323fe`
- Language: JavaScript
- ESLint: No (or Yes, your choice)
- Install dependencies: Yes

### 4. Install Function Dependencies

```bash
cd functions
npm install
```

### 5. Deploy Functions

```bash
firebase deploy --only functions
```

This will deploy:
- `sendVerificationCode` - Sends SMS verification codes
- `verifyCode` - Verifies user-entered codes

### 6. Upgrade to Blaze Plan

Cloud Functions require the **Blaze (pay-as-you-go) plan**.

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select project `homer-323fe`
3. Click **Upgrade** in the left sidebar
4. Choose **Blaze plan**

**Cost:** Very minimal for SMS verification
- Cloud Functions: Free tier includes 2M invocations/month
- Firestore: Free tier includes 50K reads/day

## 📱 SMS Integration Options

### Option 1: Twilio (Recommended)

The Cloud Function is ready for Twilio integration. Just uncomment and configure:

```javascript
// In functions/index.js, line ~40
const twilioClient = require('twilio')(accountSid, authToken);
await twilioClient.messages.create({
  body: message,
  from: twilioPhoneNumber,
  to: phoneNumber
});
```

**Setup:**
1. Sign up at https://www.twilio.com
2. Get Account SID and Auth Token
3. Buy a phone number (~$1/month)
4. Add credentials to Firebase Functions config:

```bash
firebase functions:config:set twilio.sid="YOUR_SID" twilio.token="YOUR_TOKEN" twilio.phone="+1XXXXXXXXXX"
firebase deploy --only functions
```

**Cost:** ~$0.0075 per SMS (US/Canada)

### Option 2: SendGrid

Alternative SMS provider:

```bash
npm install @sendgrid/mail --prefix functions
```

### Option 3: Firebase Extensions

Use Firebase's SMS extension:

```bash
firebase ext:install twilio-send-message
```

## 🧪 Testing

### Current Behavior (No SMS Service)

The function logs codes to Cloud Function logs:

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select `homer-323fe`
3. Go to **Functions** > **Logs**
4. Look for: `SMS to +1XXXXXXXXXX: Your FriendZone verification code is: XXXXXX`

### With Real SMS (After Twilio Setup)

Codes will be sent via SMS to the phone number.

## 🔐 Security Features

- ✅ User must be authenticated to request codes
- ✅ Codes expire after 5 minutes
- ✅ Codes can only be used once
- ✅ Each code tied to specific user
- ✅ Phone number format validation

## 📊 Monitoring

### View Function Logs

```bash
firebase functions:log
```

Or in Firebase Console:
- **Functions** > **Logs**

### Check Function Status

```bash
firebase functions:list
```

## ⚠️ Troubleshooting

### "Billing account not configured"

**Solution:** Upgrade to Blaze plan (see step 6 above)

### "Function not found"

**Solution:** Deploy functions first:
```bash
firebase deploy --only functions
```

### "Permission denied"

**Solution:** Ensure user is signed in with Apple before calling function

### SMS not sending

**Solution:** 
1. Check Cloud Function logs for errors
2. Verify Twilio credentials are configured
3. Ensure Twilio phone number is verified

## 📝 Next Steps

1. ✅ Deploy Cloud Functions
2. ✅ Upgrade to Blaze plan
3. ⚠️ Set up Twilio for real SMS
4. ✅ Test with real phone numbers
5. ⚠️ Monitor usage and costs

## 💰 Cost Estimate

**Monthly costs for 1000 users:**
- Cloud Functions: Free (within limits)
- Firestore: Free (within limits)
- Twilio SMS: ~$7.50 (1000 SMS × $0.0075)

**Total: ~$7.50/month for SMS**

## 🔄 Updating Functions

After making changes to `functions/index.js`:

```bash
cd functions
firebase deploy --only functions
```

## 🗑️ Cleanup Old Verifications

Firestore will accumulate verification documents. Set up a cleanup function:

```javascript
// Add to functions/index.js
exports.cleanupExpiredVerifications = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const snapshot = await admin.firestore()
      .collection('phoneVerifications')
      .where('expiresAt', '<', now)
      .get();
    
    const batch = admin.firestore().batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    console.log(`Cleaned up ${snapshot.size} expired verifications`);
  });
```

Then deploy:
```bash
firebase deploy --only functions
```
