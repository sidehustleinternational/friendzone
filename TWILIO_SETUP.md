# Twilio SMS Setup Guide for FriendZone

## 🚀 Quick Setup Steps

### 1. Create Twilio Account
- Go to: https://www.twilio.com/
- Sign up for free account
- Verify your email and phone number

### 2. Get Your Credentials
From Twilio Console (https://console.twilio.com/):
- **Account SID**: `ACxxxxxxxxxxxxxxxxxxxxx`
- **Auth Token**: `xxxxxxxxxxxxxxxxxxxxxxxx`

### 3. Get a Phone Number
- Go to **Phone Numbers** → **Manage** → **Buy a number**
- Choose a US number (usually free with trial)
- Note the number: `+1234567890`

### 4. Update FriendZone Configuration

Edit `src/services/smsService.ts`:

```javascript
const SMS_CONFIG: SMSConfig = {
  provider: 'twilio', // Change from 'mock' to 'twilio'
  apiKey: 'ACxxxxxxxxxxxxxxxxxxxxx', // Your Account SID
  apiSecret: 'xxxxxxxxxxxxxxxxxxxxxxxx', // Your Auth Token
  fromNumber: '+1234567890' // Your Twilio phone number
};
```

### 5. Uncomment Twilio Code

In the same file, uncomment the Twilio implementation:

```javascript
// Authentication SMS
const twilio = require('twilio')(SMS_CONFIG.apiKey, SMS_CONFIG.apiSecret);
const message = await twilio.messages.create({
  body: `Your FriendZone verification code is: ${verificationCode}`,
  from: SMS_CONFIG.fromNumber,
  to: phoneNumber
});
return { success: true, messageId: message.sid };
```

```javascript
// Invitation SMS
const smsResult = await twilio.messages.create({
  body: message,
  from: SMS_CONFIG.fromNumber,
  to: phoneNumber
});
return { success: true, messageId: smsResult.sid };
```

## 💰 Twilio Pricing

### Free Trial
- **$15.50 credit** when you sign up
- **~500 SMS messages** (US: $0.0075 per SMS)
- Perfect for development and testing

### Production Pricing
- **SMS**: $0.0075 per message (US)
- **Phone number**: $1.15/month
- **Very affordable** for most apps

## 🔐 Security Best Practices

### Environment Variables (Recommended)
Instead of hardcoding credentials, use environment variables:

```javascript
const SMS_CONFIG: SMSConfig = {
  provider: 'twilio',
  apiKey: process.env.TWILIO_ACCOUNT_SID,
  apiSecret: process.env.TWILIO_AUTH_TOKEN,
  fromNumber: process.env.TWILIO_PHONE_NUMBER
};
```

Create `.env` file:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
```

## 🧪 Testing

### Development Mode
- Keep `provider: 'mock'` for development
- SMS messages logged to console
- No real SMS sent or charged

### Production Mode
- Change to `provider: 'twilio'`
- Real SMS messages sent
- Twilio charges apply

## 📱 What Users Will Receive

### Authentication SMS
```
Your FriendZone verification code is: 123456
```

### Invitation SMS
```
Jamie invited you to join FriendZone and share location in: Home, Work. Download the app to connect!
```

## 🚨 Important Notes

1. **Trial Account Limitations**:
   - Can only send SMS to verified phone numbers
   - Add your phone number in Twilio Console → Phone Numbers → Verified Caller IDs

2. **Production Account**:
   - Can send to any phone number
   - Requires payment method
   - No restrictions on recipients

3. **Rate Limits**:
   - Twilio has built-in rate limiting
   - Perfect for production use
   - No additional configuration needed

## 🔄 Switching Between Mock and Real SMS

You can easily switch between development and production:

```javascript
// Development
const SMS_CONFIG = { provider: 'mock' };

// Production  
const SMS_CONFIG = { provider: 'twilio', ... };
```

This allows you to:
- ✅ Develop without SMS costs
- ✅ Test with real SMS when needed
- ✅ Deploy to production seamlessly

## 📞 Support

If you need help:
- **Twilio Docs**: https://www.twilio.com/docs/sms
- **Twilio Console**: https://console.twilio.com/
- **Support**: Available in Twilio Console
