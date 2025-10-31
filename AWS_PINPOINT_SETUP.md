# AWS Pinpoint SMS Setup for FriendZone (UPDATED)

## 🚨 Important: AWS has migrated SMS to Pinpoint SMS Voice V2

The old SNS SMS API is being deprecated. We've updated FriendZone to use the new **Pinpoint SMS Voice V2** service.

---

## ✅ You've Already Done (Steps 1-3)

1. ✅ Created AWS account
2. ✅ Created IAM user `friendzone-sms`
3. ✅ Created access keys
4. ✅ Added permissions (FriendZoneSMS policy)

---

## 🆕 Additional Setup Required

### Step 1: Enable Pinpoint SMS in Your Account

Your account needs to be fully activated (24-48 hours after signup). Check if it's ready:

1. Go to: https://console.aws.amazon.com/sms-voice/
2. If you see a dashboard (not an error), you're ready!
3. If you still see errors, your account may need more time to activate

### Step 2: Request Production Access (Required for Real SMS)

AWS Pinpoint starts in "sandbox mode" - you need to request production access:

1. Go to: https://console.aws.amazon.com/pinpoint-sms-voice-v2/
2. Click **"Request production access"** or look for SMS settings
3. Fill out the form:
   - **Company name**: Your company/app name
   - **Company website**: Your app's website or App Store link
   - **Use case**: "Two-factor authentication and user verification"
   - **Monthly volume**: Estimate (e.g., 1,000-10,000)
   - **Opt-in process**: "Users opt-in by signing up for our app"
   - **Opt-out process**: "Users can delete their account"

4. Submit the request

**Approval time**: Usually 24-48 hours (much faster than Twilio!)

### Step 3: While Waiting - Test in Sandbox Mode

Even in sandbox mode, you can test with verified phone numbers:

1. Go to: https://console.aws.amazon.com/pinpoint-sms-voice-v2/
2. Look for **"Phone numbers"** or **"Verified identities"**
3. Add your phone number for testing
4. You'll receive a verification code
5. Enter the code to verify

Now you can test SMS with that specific number!

---

## 🚀 Deploy the Updated Cloud Function

In **Codespaces**, run:

```bash
cd functions

# Install the new Pinpoint SDK
npm install

# Verify your AWS config is set
firebase functions:config:get

# Should show:
# {
#   "aws": {
#     "access_key_id": "AKIAU33WWEBQJSFQCV5V",
#     "secret_access_key": "l7f...",
#     "region": "us-east-1"
#   }
# }

# Deploy the updated function
firebase deploy --only functions
```

---

## 🧪 Test It

1. **Open your FriendZone app**
2. **Try phone verification** with the number you verified in Step 3
3. **Check Firebase logs**:
   ```bash
   firebase functions:log
   ```
4. Look for: `✅ SMS sent to +1234567890 via AWS Pinpoint`

---

## 🔐 Security: Rotate Your Access Keys

**IMPORTANT**: You shared your AWS credentials in chat. After testing works, rotate them:

1. Go to: https://console.aws.amazon.com/iam/
2. Click **Users** → **friendzone-sms**
3. **Security credentials** tab
4. Find access key `AKIAU33WWEBQJSFQCV5V`
5. Click **Actions** → **Deactivate** → **Delete**
6. Click **Create access key**
7. Save the new credentials
8. Update Firebase config:
   ```bash
   firebase functions:config:set \
     aws.access_key_id="NEW_KEY" \
     aws.secret_access_key="NEW_SECRET" \
     aws.region="us-east-1"
   ```
9. Redeploy: `firebase deploy --only functions`

---

## 💰 Pricing (Same as Before)

- **SMS (US)**: $0.00645 per message
- **No monthly fees**
- **No phone number needed**
- **Free tier**: 100 SMS/month for 12 months

---

## ❓ Troubleshooting

### Error: "Account not activated"
- **Solution**: Wait 24-48 hours after AWS account creation
- **Check**: Complete your AWS registration (add payment method)

### Error: "Sandbox mode - phone not verified"
- **Solution**: Verify your test phone number in Pinpoint console
- **Or**: Request production access (Step 2)

### Error: "AccessDeniedException"
- **Solution**: Make sure your IAM user has the FriendZoneSMS policy attached
- **Check**: IAM → Users → friendzone-sms → Permissions

### SMS Not Received
- **In sandbox mode**: Only verified numbers receive SMS
- **In production mode**: Any number should work (after approval)

---

## 📊 Check Status

### Is My Account Activated?
Go to: https://console.aws.amazon.com/sms-voice/

- ✅ **Activated**: You see a dashboard
- ❌ **Not activated**: You see subscription errors

### Is Production Access Approved?
1. Go to: https://console.aws.amazon.com/pinpoint-sms-voice-v2/
2. Check for "Production access" status
3. Should show "Approved" when ready

---

## 🎯 Summary

**What Changed:**
- ❌ Old: AWS SNS (being deprecated)
- ✅ New: AWS Pinpoint SMS Voice V2 (current service)

**What You Need to Do:**
1. Wait for account activation (24-48 hours)
2. Request production access (24-48 hours approval)
3. Deploy updated Cloud Function
4. Test with verified phone number
5. Rotate your access keys (security)

**Timeline:**
- **Today**: Deploy updated function, test in sandbox mode
- **Tomorrow**: Account should be activated
- **2-3 days**: Production access approved, can send to any number

---

## 📞 Need Help?

If you're still seeing errors after 48 hours:
1. Check AWS account activation status
2. Verify IAM permissions are correct
3. Contact AWS support (free with basic account)
4. Or we can switch to Twilio when they approve

The SMS verification is **critical for security** - we'll get this working!
