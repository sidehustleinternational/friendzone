# Security Audit Report - FriendZone/Homer App
**Date:** October 15, 2025  
**Auditor:** Cascade AI  
**Branch:** location-service-redesign  

---

## Executive Summary

This security audit identifies **8 HIGH priority issues** and **5 MEDIUM priority issues** that require immediate attention. The app has good foundational security with Firebase authentication and Firestore rules, but several critical vulnerabilities exist around API key exposure, credential management, and data logging.

**Overall Risk Level:** 🟠 **MEDIUM-HIGH**

---

## 🔴 CRITICAL ISSUES (Immediate Action Required)

### 1. **Hardcoded API Keys in Source Code**
**Severity:** 🔴 **CRITICAL**  
**Location:** `src/services/config.ts`, `firebaseConfig.ts`

**Issue:**
- Google Maps API key hardcoded: `AIzaSyBWwXnGiHMd6Pp3ywGMxD47taQ11Dn--2w`
- Firebase API key exposed in source: `AIzaSyAvzlI4PJl_cqcWJcXgyXyImUuF5c_Hiek`

**Risk:**
- API keys visible in GitHub repository
- Can be extracted from compiled app bundle
- Potential for API quota abuse
- Unauthorized access to Firebase services

**Recommendation:**
```typescript
// Use environment variables or react-native-config
import Config from 'react-native-config';

export function getGoogleMapsApiKey(): string {
  return Config.GOOGLE_MAPS_API_KEY || '';
}
```

**Action Items:**
1. Move API keys to environment variables
2. Restrict API keys with HTTP referrer/bundle ID restrictions in Google Cloud Console
3. Enable Firebase App Check (currently disabled)
4. Rotate exposed API keys immediately

---

### 2. **Firebase Service Account Key in Repository**
**Severity:** 🔴 **CRITICAL**  
**Location:** `serviceAccountKey.json`

**Issue:**
- Service account key file exists in repository
- Found in git history (commit df82426d9cb0f260b6bfd6d430da89be64b885d4)
- Grants full admin access to Firebase project

**Risk:**
- Complete database access
- Ability to read/write all user data
- Can bypass all Firestore security rules
- Can delete entire database

**Recommendation:**
1. **IMMEDIATELY** revoke this service account key in Firebase Console
2. Add `serviceAccountKey.json` to `.gitignore` (currently missing)
3. Create new service account key and store securely (never commit)
4. Use GitHub secrets for CI/CD instead
5. Consider using BFG Repo-Cleaner to remove from git history

**Action Items:**
```bash
# Add to .gitignore
echo "serviceAccountKey.json" >> .gitignore
git add .gitignore
git commit -m "Security: Ignore service account keys"

# Remove from git history (DANGEROUS - coordinate with team)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch serviceAccountKey.json" \
  --prune-empty --tag-name-filter cat -- --all
```

---

### 3. **Weak Password Generation for Email Auth**
**Severity:** 🔴 **HIGH**  
**Location:** `src/services/firebase.ts` lines 111, 159

**Issue:**
```typescript
const tempPassword = 'tempPassword123';
```

**Risk:**
- Predictable password used for all phone-based accounts
- Anyone knowing this pattern can access accounts
- Violates security best practices

**Recommendation:**
```typescript
import { generateSecurePassword } from './emailAuth';

const tempPassword = generateSecurePassword(); // Use existing secure function
// Store password hash in secure storage if needed for re-authentication
```

**Action Items:**
1. Replace all instances of `'tempPassword123'` with secure random passwords
2. Consider using Firebase Phone Authentication instead of email/password workaround
3. Audit existing accounts for this weak password

---

### 4. **Admin Access Based on Phone Number**
**Severity:** 🔴 **HIGH**  
**Location:** `firestore.rules` lines 6-11

**Issue:**
```javascript
function isAdmin() {
  return request.auth != null && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.phoneNumber == '+17812494070';
}
```

**Risk:**
- Admin access tied to phone number (can be spoofed/transferred)
- No role-based access control
- Phone number visible in security rules
- Single point of failure

**Recommendation:**
```javascript
function isAdmin() {
  return request.auth != null && 
         request.auth.token.admin == true; // Use custom claims
}
```

**Action Items:**
1. Implement Firebase Custom Claims for admin role
2. Remove phone number from security rules
3. Add admin management interface
4. Implement audit logging for admin actions

---

## 🟠 HIGH PRIORITY ISSUES

### 5. **Excessive Console Logging with Sensitive Data**
**Severity:** 🟠 **HIGH**  
**Location:** Throughout codebase (567 console.log statements)

**Issue:**
- User data, phone numbers, locations logged to console
- Logs visible in production builds
- Example: `firebase.ts` has 153 console.log statements

**Risk:**
- Sensitive data exposure in device logs
- Performance impact
- Debugging information leakage

**Recommendation:**
```typescript
// Create logging utility
const logger = {
  debug: __DEV__ ? console.log : () => {},
  error: console.error, // Always log errors
  info: __DEV__ ? console.info : () => {},
};

// Replace console.log with logger.debug
logger.debug('User data:', sanitizeForLogging(userData));
```

**Action Items:**
1. Create centralized logging utility
2. Remove sensitive data from logs (phone numbers, locations, tokens)
3. Disable debug logs in production builds
4. Implement log sanitization

---

### 6. **Overly Permissive Firestore Rules**
**Severity:** 🟠 **HIGH**  
**Location:** `firestore.rules`

**Issues:**
- **Users collection:** All authenticated users can read ALL user documents (line 16)
- **Homes collection:** Any authenticated user can update ANY home (line 29)
- **Friends collection:** Broad read access (line 47)

**Risk:**
- Users can access other users' personal data
- Potential for data modification by unauthorized users
- Privacy violations

**Recommendation:**
```javascript
// Users collection - restrict to friends only
match /users/{userId} {
  allow read: if request.auth != null && (
    request.auth.uid == userId || // Own data
    isFriend(request.auth.uid, userId) // Friend's data
  );
  allow create: if request.auth != null && request.auth.uid == userId;
  allow update: if request.auth != null && request.auth.uid == userId;
  allow delete: if isAdmin();
}

// Homes collection - restrict updates to members
match /homes/{homeId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && request.auth.uid == request.resource.data.createdBy;
  allow update: if request.auth != null && 
    request.auth.uid in resource.data.members; // Only members can update
  allow delete: if (request.auth != null && resource.data.createdBy == request.auth.uid) || isAdmin();
}
```

**Action Items:**
1. Implement friend relationship checks in security rules
2. Restrict user data access to friends only
3. Add member validation for home updates
4. Test rules thoroughly before deployment

---

### 7. **Debug Logs Collection Accessible to All Users**
**Severity:** 🟠 **MEDIUM-HIGH**  
**Location:** `firestore.rules` lines 78-83

**Issue:**
```javascript
match /debugLogs/{logId} {
  allow read: if request.auth != null; // Any user can read all debug logs
  allow create: if request.auth != null;
  allow delete: if isAdmin();
}
```

**Risk:**
- Users can read other users' debug logs
- Logs may contain sensitive location data, GPS coordinates
- Privacy violation

**Recommendation:**
```javascript
match /debugLogs/{logId} {
  allow read: if request.auth != null && 
    (resource.data.userId == request.auth.uid || isAdmin());
  allow create: if request.auth != null && 
    request.resource.data.userId == request.auth.uid;
  allow delete: if isAdmin();
}
```

---

### 8. **No Rate Limiting on Friend Requests**
**Severity:** 🟠 **MEDIUM**  
**Location:** `firestore.rules` lines 34-43

**Issue:**
- No limits on friend request creation
- Potential for spam/abuse

**Risk:**
- Users can spam friend requests
- Denial of service through excessive requests
- Harassment vector

**Recommendation:**
- Implement rate limiting in Cloud Functions
- Add daily limit per user (e.g., 50 requests/day)
- Track request counts in user document

---

## 🟡 MEDIUM PRIORITY ISSUES

### 9. **Firebase App Check Disabled**
**Severity:** 🟡 **MEDIUM**  
**Location:** `firebaseConfig.ts` lines 22-35

**Issue:**
```typescript
// Production App Check disabled temporarily to fix auth issues
// Will re-enable after configuring DeviceCheck properly
```

**Risk:**
- No protection against automated abuse
- API endpoints vulnerable to bots
- Increased risk of quota exhaustion

**Recommendation:**
1. Configure DeviceCheck for iOS
2. Enable App Check in production
3. Use debug tokens for development

---

### 10. **No Input Validation on Zone Creation**
**Severity:** 🟡 **MEDIUM**  
**Location:** `src/screens/HomesScreen.tsx`

**Issue:**
- No validation on zone name length
- No validation on radius (could be negative or excessive)
- No sanitization of address input

**Risk:**
- Database pollution
- Potential for injection attacks
- Poor user experience

**Recommendation:**
```typescript
// Add validation
if (newHomeName.length < 2 || newHomeName.length > 50) {
  Alert.alert('Invalid Name', 'Zone name must be 2-50 characters');
  return;
}

const radius = parseInt(newHomeRadius);
if (isNaN(radius) || radius < 0.1 || radius > 100) {
  Alert.alert('Invalid Radius', 'Radius must be between 0.1 and 100 miles');
  return;
}
```

---

### 11. **Location Data Stored Without Encryption**
**Severity:** 🟡 **MEDIUM**  
**Location:** `src/services/firebase.ts`, `locationServiceV2.ts`

**Issue:**
- GPS coordinates stored in plaintext
- Location history not encrypted
- Sensitive location data in `lastLocation` field

**Risk:**
- Privacy violation if database compromised
- Regulatory compliance issues (GDPR, CCPA)

**Recommendation:**
1. Encrypt location data at rest
2. Implement data retention policy (auto-delete old locations)
3. Add user consent for location tracking
4. Provide location history deletion option

---

### 12. **No HTTPS Enforcement for External APIs**
**Severity:** 🟡 **MEDIUM**  
**Location:** `src/services/geocoding.ts`, `notificationService.ts`

**Issue:**
- External API calls use `https://` (good)
- But no certificate pinning
- No validation of SSL certificates

**Recommendation:**
```typescript
// Add certificate pinning for critical APIs
import { fetch } from 'react-native-ssl-pinning';

const response = await fetch(url, {
  method: 'GET',
  sslPinning: {
    certs: ['maps.googleapis.com.cer']
  }
});
```

---

### 13. **SMS Invitation Contains App Store Link**
**Severity:** 🟡 **LOW-MEDIUM**  
**Location:** `src/screens/AddFriendsScreenNew.tsx` line 336

**Issue:**
```typescript
const smsMessage = `Hi ${contactName}! ${userData.name} invited you to join Homer - a location sharing app for friends and family. Download it here: https://apps.apple.com/app/homer`;
```

**Risk:**
- Link could be intercepted/modified
- No validation of recipient
- Potential for phishing if link is compromised

**Recommendation:**
1. Use Firebase Dynamic Links for tracking and security
2. Add unique invite codes
3. Validate invitations server-side

---

## ✅ SECURITY STRENGTHS

1. **Firebase Authentication:** Properly implemented with AsyncStorage persistence
2. **Firestore Security Rules:** Basic structure is sound, just needs tightening
3. **No SQL Injection Risk:** Using Firestore (NoSQL) with parameterized queries
4. **No XSS Risk:** React Native doesn't use innerHTML
5. **Phone Number Validation:** E.164 format enforced
6. **Apple Sign-In:** Properly implemented with nonce
7. **Push Notifications:** Using Expo's secure push service

---

## 📋 IMMEDIATE ACTION CHECKLIST

### Critical (Do Today)
- [ ] Revoke `serviceAccountKey.json` in Firebase Console
- [ ] Add `serviceAccountKey.json` to `.gitignore`
- [ ] Rotate Google Maps API key
- [ ] Rotate Firebase API key
- [ ] Replace `tempPassword123` with secure random passwords
- [ ] Restrict API keys in Google Cloud Console

### High Priority (This Week)
- [ ] Implement Firebase Custom Claims for admin role
- [ ] Tighten Firestore security rules (users, homes, debugLogs)
- [ ] Create centralized logging utility
- [ ] Remove sensitive data from console logs
- [ ] Add input validation for zone creation
- [ ] Test security rules thoroughly

### Medium Priority (This Month)
- [ ] Enable Firebase App Check with DeviceCheck
- [ ] Implement rate limiting on friend requests
- [ ] Add location data encryption
- [ ] Implement data retention policy
- [ ] Add certificate pinning for external APIs
- [ ] Create admin management interface

---

## 🔒 SECURITY BEST PRACTICES GOING FORWARD

1. **Never commit secrets:** Use environment variables and `.gitignore`
2. **Principle of least privilege:** Tighten Firestore rules to minimum necessary access
3. **Defense in depth:** Multiple layers of security (rules + validation + encryption)
4. **Regular audits:** Review security quarterly
5. **Dependency updates:** Keep packages up to date for security patches
6. **Security testing:** Penetration testing before major releases
7. **Incident response plan:** Document what to do if breach occurs

---

## 📞 CONTACT FOR QUESTIONS

For questions about this audit, contact the development team or security officer.

**Next Audit Due:** January 15, 2026
