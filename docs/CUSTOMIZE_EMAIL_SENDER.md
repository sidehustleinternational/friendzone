# Customize Email Sender for FriendZone

## Current Email
- From: `noreply@homer-323fe.firebaseapp.com`
- Display Name: "Homer" (project name)

## Goal
- From: `FriendZone <noreply@homer-323fe.firebaseapp.com>` (Quick)
- OR: `noreply@friendzone.com` (Requires domain)

---

## Option 1: Change Display Name (FREE - 5 minutes)

### Steps:

1. **Go to Firebase Console**
   - https://console.firebase.google.com/
   - Select your project: `homer-323fe`

2. **Navigate to Authentication**
   - Click "Authentication" in left sidebar
   - Click "Templates" tab at the top

3. **Edit Email Verification Template**
   - Click on "Email address verification"
   - Look for "Sender name" field
   - Change from "Homer" to "FriendZone"
   - Click "Save"

4. **Edit Password Reset Template (if used)**
   - Click on "Password reset"
   - Change sender name to "FriendZone"
   - Click "Save"

5. **Test**
   - Create a new account in the app
   - Check the verification email
   - Should now show: `FriendZone <noreply@homer-323fe.firebaseapp.com>`

### Result:
```
From: FriendZone <noreply@homer-323fe.firebaseapp.com>
Subject: Verify your email for FriendZone
```

---

## Option 2: Custom Email Domain (Requires Domain Ownership)

### Requirements:
- Own domain: `friendzone.com`
- Firebase Blaze (pay-as-you-go) plan
- DNS access to add records

### Steps:

1. **Purchase Domain**
   - Buy `friendzone.com` from registrar (GoDaddy, Namecheap, etc.)
   - Cost: ~$10-15/year

2. **Set Up Custom SMTP**
   - Use service like SendGrid, Mailgun, or AWS SES
   - Configure SMTP credentials
   - Add to Firebase (requires Cloud Functions)

3. **Configure DNS Records**
   ```
   Type: TXT
   Name: @
   Value: v=spf1 include:_spf.google.com ~all
   
   Type: CNAME
   Name: mail
   Value: ghs.googlehosted.com
   ```

4. **Update Firebase Auth**
   - This requires custom Cloud Functions
   - Not directly supported in Firebase Console
   - More complex setup

### Result:
```
From: FriendZone <noreply@friendzone.com>
Subject: Verify your email for FriendZone
```

---

## Option 3: Use Gmail/Google Workspace (Alternative)

### If you have Google Workspace:

1. **Set up Google Workspace**
   - Create email: `noreply@friendzone.com`
   - Configure in Google Workspace admin

2. **Use Firebase with Google Workspace**
   - Requires custom email service integration
   - More complex than Option 1

---

## Recommendation

**For Now: Use Option 1**
- Takes 5 minutes
- Free
- Professional enough: `FriendZone <noreply@homer-323fe.firebaseapp.com>`
- Users will see "FriendZone" as the sender

**For Production: Consider Option 2**
- When you're ready to invest in the domain
- More professional: `noreply@friendzone.com`
- Better brand recognition
- Requires domain purchase and setup

---

## Email Template Customization

While in Firebase Console → Authentication → Templates, you can also customize:

### Email Verification Template:
```
Subject: Verify your email for FriendZone

Hi there,

Welcome to FriendZone! Please verify your email address by clicking the link below:

[VERIFY EMAIL BUTTON]

If you didn't create a FriendZone account, you can safely ignore this email.

Thanks,
The FriendZone Team
```

### Tips:
- Keep it short and clear
- Use your brand name (FriendZone)
- Make the call-to-action obvious
- Include a way to ignore if not them

---

## Current Status

✅ Email authentication working
✅ Verification emails sending
⏳ Sender name needs update (Option 1)
⏳ Custom domain optional (Option 2)

**Next Action:** Follow Option 1 steps in Firebase Console (5 minutes)
