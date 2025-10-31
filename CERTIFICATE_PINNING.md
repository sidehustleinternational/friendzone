# Certificate Pinning Implementation Guide

## Overview

Certificate pinning prevents man-in-the-middle (MITM) attacks by validating that the server's SSL certificate matches a known, trusted certificate.

## Why Certificate Pinning?

**Without pinning:**
- Attacker can intercept HTTPS traffic with a fake certificate
- User's device might trust the fake certificate
- Sensitive data (API keys, user data) can be stolen

**With pinning:**
- App only trusts specific certificates
- MITM attacks fail even if device is compromised
- Additional layer of security beyond HTTPS

## APIs to Pin

### 1. Google Maps Geocoding API
- **URL:** `https://maps.googleapis.com`
- **Usage:** Address geocoding, reverse geocoding
- **Sensitivity:** Medium (API key exposed, but restricted)

### 2. Expo Push Notifications
- **URL:** `https://exp.host`
- **Usage:** Sending push notifications
- **Sensitivity:** Medium (notification content)

### 3. Firebase APIs
- **URL:** `https://firebaseapp.com`, `https://googleapis.com`
- **Usage:** Authentication, Firestore, Cloud Functions
- **Sensitivity:** High (user data, auth tokens)

## Implementation Options

### Option 1: React Native SSL Pinning (Recommended)

**Install:**
```bash
npm install react-native-ssl-pinning
cd ios && pod install && cd ..
```

**Usage:**
```typescript
import { fetch } from 'react-native-ssl-pinning';

// Fetch with certificate pinning
const response = await fetch('https://maps.googleapis.com/maps/api/geocode/json', {
  method: 'GET',
  sslPinning: {
    certs: ['maps.googleapis.com'] // Certificate file in assets
  }
});
```

**Get Certificates:**
```bash
# Download certificate
echo | openssl s_client -servername maps.googleapis.com -connect maps.googleapis.com:443 2>/dev/null | openssl x509 -outform PEM > maps.googleapis.com.cer

# Place in: ios/YourApp/maps.googleapis.com.cer
```

### Option 2: Expo Network (Easier for Expo)

**Note:** Expo doesn't support certificate pinning directly. Options:

1. **Eject to bare React Native** (lose Expo benefits)
2. **Use EAS Build with custom native modules**
3. **Implement server-side proxy** (pin on your server)

### Option 3: Server-Side Proxy (Recommended for Expo)

**Architecture:**
```
[App] → [Your Server] → [Google Maps API]
        (with pinning)
```

**Benefits:**
- Works with Expo
- Centralized certificate management
- Can add rate limiting, caching
- Hide API keys from client

**Implementation:**
```typescript
// Instead of calling Google Maps directly:
// const response = await fetch(`https://maps.googleapis.com/...`);

// Call your proxy:
const response = await fetch(`https://your-server.com/api/geocode?address=${address}`);
```

**Server (Node.js/Express):**
```javascript
const express = require('express');
const https = require('https');
const tls = require('tls');

const app = express();

// Certificate pinning
const GOOGLE_MAPS_FINGERPRINT = 'AA:BB:CC:DD:...'; // SHA-256 fingerprint

app.get('/api/geocode', async (req, res) => {
  const address = req.query.address;
  
  const options = {
    hostname: 'maps.googleapis.com',
    path: `/maps/api/geocode/json?address=${address}&key=${GOOGLE_MAPS_API_KEY}`,
    method: 'GET',
    checkServerIdentity: (host, cert) => {
      const fingerprint = cert.fingerprint256;
      if (fingerprint !== GOOGLE_MAPS_FINGERPRINT) {
        throw new Error('Certificate pinning failed');
      }
    }
  };
  
  https.get(options, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => res.json(JSON.parse(data)));
  });
});
```

## Recommended Approach for Homer

Given that you're using Expo, I recommend:

### Phase 1: Server-Side Proxy (Immediate)
1. Create a simple proxy server (Node.js/Express)
2. Implement certificate pinning on the server
3. Update app to call proxy instead of APIs directly
4. Deploy to Heroku/Vercel/Railway (free tier)

### Phase 2: Native Implementation (Future)
1. When you eject from Expo or use EAS Build
2. Implement react-native-ssl-pinning
3. Pin certificates directly in the app

## Certificate Management

### Getting Certificate Fingerprints

```bash
# Get SHA-256 fingerprint
echo | openssl s_client -servername maps.googleapis.com -connect maps.googleapis.com:443 2>/dev/null | openssl x509 -noout -fingerprint -sha256

# Output: SHA256 Fingerprint=AA:BB:CC:DD:EE:FF:...
```

### Certificate Rotation

**Problem:** Certificates expire and rotate

**Solutions:**
1. **Pin multiple certificates** (current + backup)
2. **Pin public key** instead of certificate (more stable)
3. **Monitor certificate expiration** (set alerts)
4. **Have update mechanism** (push update when cert changes)

### Example: Pin Multiple Certificates

```typescript
const response = await fetch(url, {
  sslPinning: {
    certs: [
      'maps.googleapis.com-current.cer',
      'maps.googleapis.com-backup.cer'
    ]
  }
});
```

## Testing

### Test Certificate Pinning

```bash
# Test with correct certificate (should work)
curl https://maps.googleapis.com

# Test with wrong certificate (should fail)
curl --cacert wrong-cert.pem https://maps.googleapis.com
```

### Test MITM Protection

1. Set up a proxy (Charles, Burp Suite)
2. Install proxy certificate on device
3. Try to intercept HTTPS traffic
4. **With pinning:** App should reject connection
5. **Without pinning:** Proxy can see traffic

## Security Considerations

### Pros
✅ Prevents MITM attacks
✅ Additional layer beyond HTTPS
✅ Protects API keys and user data
✅ Industry best practice

### Cons
⚠️ Requires certificate management
⚠️ App breaks if certificate rotates
⚠️ Harder to debug network issues
⚠️ Not supported natively in Expo

## Implementation Checklist

- [ ] Decide on approach (proxy vs native)
- [ ] Get certificate fingerprints
- [ ] Implement pinning (server or client)
- [ ] Test with valid certificates
- [ ] Test with invalid certificates
- [ ] Set up certificate monitoring
- [ ] Document certificate rotation process
- [ ] Add fallback mechanism
- [ ] Test in production

## Cost Analysis

### Server-Side Proxy
- **Hosting:** Free tier (Vercel, Railway, Render)
- **Maintenance:** Low (update certificates annually)
- **Complexity:** Medium

### Native Implementation
- **Cost:** Free (library is open source)
- **Maintenance:** Medium (update certificates in app)
- **Complexity:** High (requires native build)

## Recommendation

**For Homer app:**

1. **Short term:** Skip certificate pinning
   - APIs are already restricted by bundle ID
   - HTTPS provides good security
   - Focus on other security improvements

2. **Long term:** Implement server-side proxy
   - When you have more users
   - When you need rate limiting
   - When you want to hide API keys completely

**Priority:** 🟡 Medium (nice to have, not critical)

## Resources

- [OWASP Certificate Pinning](https://owasp.org/www-community/controls/Certificate_and_Public_Key_Pinning)
- [react-native-ssl-pinning](https://github.com/MaxToyberman/react-native-ssl-pinning)
- [Expo Network Security](https://docs.expo.dev/guides/using-custom-native-code/)

## Questions?

Certificate pinning is complex. If you need help implementing, let me know!
