# CRITICAL Security Fixes Required - MANUAL ACTIONS

## ✅ COMPLETED (Automated)

1. ✅ Added `serviceAccountKey.json` to `.gitignore`
2. ✅ Replaced weak password `tempPassword123` with cryptographic hash
3. ✅ Created `.env.example` template
4. ✅ Added `.env` files to `.gitignore`

---

## 🔴 REQUIRED MANUAL ACTIONS (DO IMMEDIATELY)

### 1. Revoke Exposed Service Account Key
**Priority:** 🔴 **CRITICAL - DO NOW**

**Steps:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `homer-323fe`
3. Go to **Project Settings** → **Service Accounts**
4. Find the service account key that matches `serviceAccountKey.json`
5. Click **Delete** to revoke it
6. Generate a NEW service account key
7. Download it and store it SECURELY (never commit to git)
8. Update your local scripts to use the new key

**Why:** The current key is exposed in git history and grants full admin access to your database.

---

### 2. Rotate Firebase API Key
**Priority:** 🔴 **CRITICAL - DO TODAY**

**Current Exposed Key:** `AIzaSyAvzlI4PJl_cqcWJcXgyXyImUuF5c_Hiek`

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: `homer-323fe`
3. Go to **APIs & Services** → **Credentials**
4. Find the API key: `AIzaSyAvzlI4PJl_cqcWJcXgyXyImUuF5c_Hiek`
5. Click **Delete** to revoke it
6. Create a NEW API key
7. **Restrict the key:**
   - Application restrictions: iOS apps
   - Bundle ID: `com.jamiegoldstein.homer` (or your actual bundle ID)
   - API restrictions: Only enable Firebase services you use
8. Update `firebaseConfig.ts` with new key (temporarily)
9. Later, move to environment variables (see step 5)

---

### 3. Rotate Google Maps API Key  
**Priority:** 🔴 **CRITICAL - DO TODAY**

**Current Exposed Key:** `AIzaSyBWwXnGiHMd6Pp3ywGMxD47taQ11Dn--2w`

**Steps:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to **APIs & Services** → **Credentials**
3. Find the API key: `AIzaSyBWwXnGiHMd6Pp3ywGMxD47taQ11Dn--2w`
4. Click **Delete** to revoke it
5. Create a NEW API key
6. **Restrict the key:**
   - Application restrictions: iOS apps
   - Bundle ID: `com.jamiegoldstein.homer`
   - API restrictions: Only enable Geocoding API and Maps SDK
7. Update `src/services/config.ts` with new key (temporarily)
8. Later, move to environment variables (see step 5)

---

### 4. Update Firestore Security Rules - Admin Role
**Priority:** 🔴 **HIGH - DO THIS WEEK**

**Current Issue:** Admin check uses hardcoded phone number

**Steps:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `homer-323fe`
3. Go to **Authentication** → **Users**
4. Find your user account (phone: +17812494070)
5. Click on the user
6. Go to **Custom Claims** tab
7. Add custom claim:
   ```json
   {
     "admin": true
   }
   ```
8. Update `firestore.rules`:
   ```javascript
   function isAdmin() {
     return request.auth != null && 
            request.auth.token.admin == true;
   }
   ```
9. Deploy updated rules:
   ```bash
   firebase deploy --only firestore:rules
   ```

---

### 5. Move API Keys to Environment Variables
**Priority:** 🟠 **HIGH - DO THIS WEEK**

**Note:** React Native doesn't support `.env` files natively. You need to use `react-native-config`.

**Steps:**

1. Install react-native-config:
   ```bash
   npm install react-native-config
   cd ios && pod install && cd ..
   ```

2. Create `.env` file (never commit this):
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env` with your NEW API keys:
   ```
   FIREBASE_API_KEY=your_new_firebase_key
   GOOGLE_MAPS_API_KEY=your_new_maps_key
   # ... etc
   ```

4. Update `firebaseConfig.ts`:
   ```typescript
   import Config from 'react-native-config';

   const firebaseConfig = {
     apiKey: Config.FIREBASE_API_KEY,
     authDomain: Config.FIREBASE_AUTH_DOMAIN,
     projectId: Config.FIREBASE_PROJECT_ID,
     storageBucket: Config.FIREBASE_STORAGE_BUCKET,
     messagingSenderId: Config.FIREBASE_MESSAGING_SENDER_ID,
     appId: Config.FIREBASE_APP_ID
   };
   ```

5. Update `src/services/config.ts`:
   ```typescript
   import Config from 'react-native-config';

   export function getGoogleMapsApiKey(): string {
     return Config.GOOGLE_MAPS_API_KEY || '';
   }
   ```

6. For Expo (if using Expo):
   - Use `expo-constants` instead
   - Store secrets in `app.json` extra field
   - Or use EAS Secrets for production

---

### 6. Remove serviceAccountKey.json from Git History
**Priority:** 🟠 **MEDIUM - DO THIS WEEK**

**Warning:** This rewrites git history. Coordinate with your team first.

**Steps:**

1. Backup your repository first:
   ```bash
   git clone /path/to/FriendZone /path/to/FriendZone-backup
   ```

2. Use BFG Repo-Cleaner (easier than git-filter-branch):
   ```bash
   # Install BFG
   brew install bfg
   
   # Remove the file from history
   bfg --delete-files serviceAccountKey.json
   
   # Clean up
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   ```

3. Force push (WARNING: This affects all collaborators):
   ```bash
   git push origin --force --all
   git push origin --force --tags
   ```

4. Notify all team members to re-clone the repository

**Alternative:** If you can't rewrite history, just ensure the key is revoked (step 1) and move forward.

---

## 🟡 RECOMMENDED ACTIONS (DO SOON)

### 7. Enable Firebase App Check
**Priority:** 🟡 **MEDIUM - DO THIS MONTH**

**Steps:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Go to **App Check**
3. Register your iOS app
4. Enable DeviceCheck provider
5. Update `firebaseConfig.ts` to enable App Check in production

---

### 8. Tighten Firestore Security Rules
**Priority:** 🟡 **MEDIUM - DO THIS MONTH**

See `SECURITY_AUDIT_2025-10-15.md` section 6 for detailed rule updates.

---

## 📋 VERIFICATION CHECKLIST

After completing the above steps, verify:

- [ ] Old service account key is revoked
- [ ] Old Firebase API key is deleted
- [ ] Old Google Maps API key is deleted
- [ ] New API keys are restricted (bundle ID, API restrictions)
- [ ] New API keys are NOT in git repository
- [ ] `.env` file exists locally but is gitignored
- [ ] Admin role uses custom claims, not phone number
- [ ] App still works with new keys
- [ ] serviceAccountKey.json is gitignored
- [ ] Existing users can still sign in (password hash works)

---

## 🆘 IF SOMETHING BREAKS

### Users Can't Sign In After Password Change

**Problem:** Existing users have accounts with old password `tempPassword123`

**Solution:** 
1. The new hash-based password is deterministic, so it will generate a DIFFERENT password
2. This means existing users won't be able to sign in
3. You have two options:

**Option A (Recommended):** Migrate to proper Firebase Phone Auth
- Remove email/password workaround entirely
- Use Firebase Phone Authentication directly
- This is the proper long-term solution

**Option B (Quick Fix):** Keep old password for existing users
- Revert the password change temporarily
- Plan migration to Firebase Phone Auth
- Schedule user re-authentication

**To check if this is an issue:**
```bash
# Check if you have existing users
firebase firestore:export users --project homer-323fe
```

---

## 📞 QUESTIONS?

If you're unsure about any of these steps, STOP and ask for help. Security changes can break authentication if done incorrectly.

**Last Updated:** October 15, 2025
