# AWS SNS Setup Guide for FriendZone

## 🚀 Quick Setup (10 minutes)

### 1. Create AWS Account
- Go to: https://aws.amazon.com/
- Sign up for free account (12 months free tier)
- Verify your email

### 2. Create IAM User for SNS

1. Go to **IAM Console**: https://console.aws.amazon.com/iam/
2. Click **Users** → **Create user**
3. Username: `friendzone-sms`
4. Click **Next**

### 3. Set Permissions

1. Select **Attach policies directly**
2. Search for and select: **AmazonSNSFullAccess**
3. Click **Next** → **Create user**

### 4. Create Access Keys

1. Click on the newly created user `friendzone-sms`
2. Go to **Security credentials** tab
3. Scroll to **Access keys** → **Create access key**
4. Select **Application running outside AWS**
5. Click **Next** → **Create access key**
6. **IMPORTANT**: Save these credentials (you'll only see them once):
   - **Access Key ID**: `AKIA...`
   - **Secret Access Key**: `wJalrXUtn...`

### 5. Configure SNS Sandbox (Development)

AWS SNS starts in "sandbox mode" for security. You need to verify phone numbers for testing:

1. Go to **SNS Console**: https://console.aws.amazon.com/sns/
2. Select your region (e.g., `us-east-1`)
3. Click **Text messaging (SMS)** in left sidebar
4. Click **Sandbox destination phone numbers**
5. Click **Add phone number**
6. Enter your test phone number (e.g., `+12345678901`)
7. You'll receive a verification code via SMS
8. Enter the code to verify

**Note**: In sandbox mode, you can only send SMS to verified numbers. For production, request production access (see step 8).

### 6. Configure Firebase Cloud Functions

Set the AWS credentials in Firebase:

```bash
cd /Users/jamiegoldstein/CascadeProjects/windsurf-project/FriendZone/functions

firebase functions:config:set \
  aws.access_key_id="YOUR_ACCESS_KEY_ID" \
  aws.secret_access_key="YOUR_SECRET_ACCESS_KEY" \
  aws.region="us-east-1"
```

**Important**: Replace with your actual credentials from step 4.

### 7. Install Dependencies & Deploy

```bash
# Install new AWS SDK dependency
npm install

# Deploy the updated Cloud Function
firebase deploy --only functions
```

### 8. Request Production Access (Optional - for unlimited SMS)

To send SMS to any phone number (not just verified ones):

1. Go to **SNS Console** → **Text messaging (SMS)**
2. Click **Request production access**
3. Fill out the form:
   - **Use case**: Transactional (for verification codes)
   - **Website URL**: Your app's website or App Store link
   - **Monthly SMS volume**: Estimate (e.g., 10,000)
   - **Default message type**: Transactional
   - **Company name**: Your company
   - **Company address**: Your address
4. Submit the request

**Approval time**: Usually 24-48 hours (much faster than Twilio!)

---

## 💰 Pricing Comparison

### AWS SNS
- **SMS (US)**: $0.00645 per message
- **No monthly fees**
- **No phone number needed**
- **Free tier**: 100 SMS/month for 12 months

### Twilio (for comparison)
- **SMS (US)**: $0.0075 per message
- **Phone number**: $1.15/month
- **Free trial**: $15.50 credit

**AWS is ~14% cheaper and has no monthly fees!**

---

## 🧪 Testing

### Development Testing (Sandbox Mode)

1. Verify your phone number in SNS Console (step 5)
2. Test the verification flow in your app
3. You should receive real SMS messages

### Check Logs

```bash
firebase functions:log
```

Look for:
- `✅ SMS sent to +1234567890 via AWS SNS` (success)
- `⚠️ AWS SNS and Twilio not configured` (not configured)
- Any error messages

---

## 🔐 Security Best Practices

### 1. Use IAM User (Not Root Account)
✅ We created a dedicated IAM user with limited permissions

### 2. Rotate Access Keys Regularly
- Rotate keys every 90 days
- Delete old keys after rotation

### 3. Monitor Usage
- Set up CloudWatch alarms for unusual activity
- Monitor SMS spending in AWS Billing

### 4. Use Least Privilege
- Only grant `AmazonSNSFullAccess` (or more restrictive SNS-only policy)

---

## 📱 What Users Will Receive

```
Your FriendZone verification code is: 123456
```

---

## 🔄 Fallback Behavior

The Cloud Function now supports multiple SMS providers with automatic fallback:

1. **AWS SNS** (preferred) - If configured, uses AWS
2. **Twilio** (fallback) - If AWS not configured, tries Twilio
3. **Console logging** (development) - If neither configured, logs to console

This means:
- ✅ You can test now without any SMS service
- ✅ Add AWS SNS when ready (no code changes needed)
- ✅ Twilio still works if you get approved later

---

## 🚨 Troubleshooting

### Error: "InvalidClientTokenId"
- **Cause**: Invalid Access Key ID
- **Fix**: Double-check your credentials in Firebase config

### Error: "SignatureDoesNotMatch"
- **Cause**: Invalid Secret Access Key
- **Fix**: Regenerate access keys and update Firebase config

### Error: "OptedOut"
- **Cause**: Phone number has opted out of SMS
- **Fix**: User needs to text START to opt back in

### SMS Not Received (Sandbox Mode)
- **Cause**: Phone number not verified in SNS Console
- **Fix**: Verify the phone number in SNS Console (step 5)

### Check Current Config

```bash
firebase functions:config:get
```

Should show:
```json
{
  "aws": {
    "access_key_id": "AKIA...",
    "secret_access_key": "wJalr...",
    "region": "us-east-1"
  }
}
```

---

## 📊 Monitoring

### View SMS Delivery in AWS Console

1. Go to **CloudWatch** → **Logs**
2. Search for log group: `/aws/sns/`
3. View delivery status for each SMS

### Firebase Function Logs

```bash
firebase functions:log --only sendVerificationCode
```

---

## 🌍 Regional Considerations

### Supported Regions for SMS
- `us-east-1` (US East - N. Virginia) ✅ Recommended
- `us-west-2` (US West - Oregon)
- `eu-west-1` (Europe - Ireland)
- `ap-southeast-1` (Asia Pacific - Singapore)

**Note**: Not all AWS regions support SMS. Use `us-east-1` for best coverage.

---

## 📞 Support

### AWS Support
- **Documentation**: https://docs.aws.amazon.com/sns/
- **SNS Console**: https://console.aws.amazon.com/sns/
- **Support**: Available in AWS Console (paid plans)

### Common Issues
- **Sandbox limitations**: Verify phone numbers or request production access
- **Rate limits**: AWS has built-in rate limiting (adjustable)
- **International SMS**: Requires additional configuration

---

## ✅ Verification Checklist

- [ ] AWS account created
- [ ] IAM user created with SNS permissions
- [ ] Access keys generated and saved
- [ ] Test phone number verified in SNS Console (sandbox mode)
- [ ] Firebase config updated with AWS credentials
- [ ] Dependencies installed (`npm install` in functions/)
- [ ] Cloud Functions deployed
- [ ] Test SMS sent successfully
- [ ] (Optional) Production access requested

---

## 🎯 Next Steps

1. **Complete setup** (steps 1-7 above)
2. **Test with your phone** (verify it in SNS Console first)
3. **Request production access** when ready to launch
4. **Monitor costs** in AWS Billing Console

**Estimated setup time**: 10-15 minutes
**Production approval time**: 24-48 hours (vs weeks for Twilio!)
