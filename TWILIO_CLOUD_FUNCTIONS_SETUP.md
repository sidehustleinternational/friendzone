# Twilio Setup for Cloud Functions

## 🚀 Quick Setup (5 minutes)

### Step 1: Get Twilio Credentials

1. Go to https://www.twilio.com/console
2. Sign in (or create account if needed)
3. Copy these from the dashboard:
   - **Account SID**: `ACxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token**: Click "View" to reveal
4. Get a phone number:
   - Go to **Phone Numbers** → **Manage** → **Buy a number**
   - Choose a US number (free with trial credit)
   - Copy the number: `+1XXXXXXXXXX`

### Step 2: Configure Firebase Functions

In Codespaces, run:

```bash
cd /workspaces/windsurf-project/FriendZone

# Set Twilio credentials
firebase functions:config:set \
  twilio.sid="YOUR_ACCOUNT_SID" \
  twilio.token="YOUR_AUTH_TOKEN" \
  twilio.phone="+1XXXXXXXXXX"
```

**Example:**
```bash
firebase functions:config:set \
  twilio.sid="AC1234567890abcdef1234567890abcd" \
  twilio.token="your_auth_token_here" \
  twilio.phone="+15551234567"
```

### Step 3: Install Dependencies & Deploy

```bash
# Install Twilio in functions
cd functions
npm install

# Deploy to Firebase
cd ..
firebase deploy --only functions
```

### Step 4: Upgrade Firebase to Blaze Plan

1. Go to https://console.firebase.google.com
2. Select project `homer-323fe`
3. Click **Upgrade** → Choose **Blaze (pay as you go)**
4. Add payment method

**Don't worry about cost:**
- Cloud Functions: 2M free invocations/month
- You'll only pay for Twilio SMS (~$0.0075 each)

## ✅ Testing

### Without Twilio Configured
- Codes logged to Firebase Console → Functions → Logs
- No SMS sent
- Good for testing the flow

### With Twilio Configured
- Real SMS sent to phone numbers
- Codes delivered via text message
- Ready for production!

## 🧪 Test with Your Phone

1. Build the app: `./build.sh`
2. Install on device from TestFlight
3. Sign in with Apple
4. Enter your real phone number
5. You should receive SMS with code!

## 💰 Costs

**Twilio:**
- Phone number: $1.15/month
- SMS: $0.0075 per message (US/Canada)
- Trial credit: $15.50 (covers ~2000 SMS)

**Firebase:**
- Cloud Functions: Free for first 2M calls/month
- Firestore: Free for first 50K reads/day

**Example monthly cost for 1000 users:**
- 1000 SMS × $0.0075 = $7.50
- Phone number = $1.15
- **Total: ~$8.65/month**

## 🔐 Trial Account Limitations

Twilio trial accounts can only send SMS to **verified phone numbers**.

**To verify your phone:**
1. Go to https://console.twilio.com
2. **Phone Numbers** → **Verified Caller IDs**
3. Click **Add a new number**
4. Enter your phone and verify

**To remove this limitation:**
- Upgrade Twilio account (add payment method)
- Then you can send to any phone number

## 🚨 Troubleshooting

### "Twilio not configured"
- Check Firebase config: `firebase functions:config:get`
- Re-run the config:set command
- Redeploy: `firebase deploy --only functions`

### "Unable to create record"
- Verify Twilio credentials are correct
- Check phone number format: +1XXXXXXXXXX (no spaces/dashes)
- Ensure trial account has verified the recipient number

### "Billing account not configured"
- Upgrade Firebase to Blaze plan
- Cloud Functions require pay-as-you-go plan

## 📋 View Configuration

Check what's configured:
```bash
firebase functions:config:get
```

Should show:
```json
{
  "twilio": {
    "sid": "ACxxxxx...",
    "token": "xxxxx...",
    "phone": "+1XXXXXXXXXX"
  }
}
```

## 🔄 Update Configuration

To change credentials:
```bash
firebase functions:config:set twilio.sid="NEW_SID"
firebase deploy --only functions
```

## 📱 What Users Receive

```
Your FriendZone verification code is: 123456
```

Simple, clear, and secure!

## ✅ Checklist

- [ ] Twilio account created
- [ ] Phone number purchased
- [ ] Credentials added to Firebase config
- [ ] Functions deployed
- [ ] Firebase upgraded to Blaze plan
- [ ] Tested with real phone number
- [ ] SMS received successfully

## 🎉 You're Done!

Once configured, SMS verification will work automatically for all users!
