# AWS SNS Quick Start (5 Minutes)

## 🎯 Fastest Path to Working SMS

### Step 1: Create AWS Account (2 min)
https://aws.amazon.com/ → Sign up

### Step 2: Create IAM User (2 min)
1. Go to: https://console.aws.amazon.com/iam/
2. **Users** → **Create user** → Name: `friendzone-sms`
3. **Attach policies directly** → Select: `AmazonSNSFullAccess`
4. **Create user**

### Step 3: Get Access Keys (1 min)
1. Click on user `friendzone-sms`
2. **Security credentials** → **Create access key**
3. Select: **Application running outside AWS**
4. **Save these** (you'll only see them once):
   ```
   Access Key ID: AKIA...
   Secret Access Key: wJalr...
   ```

### Step 4: Verify Your Phone (Sandbox Mode)
1. Go to: https://console.aws.amazon.com/sns/
2. Select region: **us-east-1**
3. **Text messaging (SMS)** → **Sandbox destination phone numbers**
4. **Add phone number** → Enter your phone
5. Enter verification code you receive

### Step 5: Configure Firebase
```bash
cd /Users/jamiegoldstein/CascadeProjects/windsurf-project/FriendZone/functions

firebase functions:config:set \
  aws.access_key_id="YOUR_ACCESS_KEY_ID" \
  aws.secret_access_key="YOUR_SECRET_ACCESS_KEY" \
  aws.region="us-east-1"
```

### Step 6: Deploy
```bash
npm install
firebase deploy --only functions
```

### Step 7: Test
Open your app and try phone verification with the verified number!

---

## 📱 For Production (Send to Any Number)

After testing works, request production access:

1. Go to: https://console.aws.amazon.com/sns/
2. **Text messaging (SMS)** → **Request production access**
3. Fill out form (takes 2 minutes)
4. **Approval**: Usually 24-48 hours

---

## 💰 Cost
- **$0.00645 per SMS** (US)
- **100 free SMS/month** for 12 months
- **No monthly fees**

---

## 🔍 Verify It's Working

Check Firebase logs:
```bash
firebase functions:log
```

Look for: `✅ SMS sent to +1234567890 via AWS SNS`

---

## ❓ Need Help?

See full guide: `AWS_SNS_SETUP.md`
