# Data Retention Policy Setup

## Overview

Automatic cleanup of old location data for privacy and GDPR/CCPA compliance.

## Retention Periods

| Data Type | Retention Period | Reason |
|-----------|-----------------|--------|
| Location History | 30 days | Privacy - only recent locations needed |
| Friend Requests (rejected) | 90 days | Cleanup old invitations |
| Security Logs | 180 days | Compliance and debugging |

## Implementation Options

### Option 1: Client-Side Cleanup (Current)

**Pros:**
- Already implemented
- No additional Firebase costs
- Runs automatically on app startup

**Cons:**
- Only cleans up when user opens app
- Less efficient for large datasets
- Uses user's device resources

**Usage:**
```typescript
import { runDataRetentionCleanup, shouldRunCleanup, markCleanupCompleted } from './src/utils/dataRetention';

// In App.tsx or main component
useEffect(() => {
  if (shouldRunCleanup()) {
    runDataRetentionCleanup().then(results => {
      console.log('Cleanup results:', results);
      markCleanupCompleted();
    });
  }
}, []);
```

### Option 2: Firebase Cloud Functions (Recommended for Production)

**Pros:**
- Runs automatically on schedule
- More efficient batch operations
- Doesn't depend on user opening app
- Can handle large datasets

**Cons:**
- Requires Firebase Blaze (pay-as-you-go) plan
- Additional setup required

## Setting Up Cloud Functions

### 1. Install Firebase Functions

```bash
npm install -g firebase-tools
firebase init functions
```

Choose:
- Language: TypeScript
- ESLint: Yes
- Install dependencies: Yes

### 2. Create Cleanup Function

Create `functions/src/dataRetention.ts`:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// Run daily at 2 AM
export const cleanupOldLocations = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    console.log('Starting location cleanup...');
    
    // Query old locations
    const snapshot = await db.collection('locations')
      .where('timestamp', '<', thirtyDaysAgo)
      .limit(500) // Process in batches
      .get();
    
    if (snapshot.empty) {
      console.log('No old locations to delete');
      return null;
    }
    
    // Delete in batch
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.size} old location records`);
    
    return null;
  });

// Clean up old friend requests
export const cleanupOldFriendRequests = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const ninetyDaysAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    
    console.log('Starting friend requests cleanup...');
    
    const snapshot = await db.collection('friendRequests')
      .where('status', 'in', ['rejected', 'expired'])
      .where('createdAt', '<', ninetyDaysAgo)
      .limit(500)
      .get();
    
    if (snapshot.empty) {
      console.log('No old friend requests to delete');
      return null;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.size} old friend requests`);
    
    return null;
  });
```

### 3. Deploy Functions

```bash
firebase deploy --only functions
```

### 4. Monitor Functions

View logs:
```bash
firebase functions:log
```

Or in Firebase Console:
https://console.firebase.google.com/project/homer-323fe/functions

## GDPR/CCPA Compliance

### Right to be Forgotten

Implemented in `deleteAllUserData()` function:

```typescript
import { deleteAllUserData } from './src/utils/dataRetention';

// When user requests account deletion
const result = await deleteAllUserData();
if (result.success) {
  // Delete Firebase Auth account
  await auth.currentUser?.delete();
}
```

### Data Export (Required for GDPR)

Add this function to export user data:

```typescript
export const exportUserData = async (): Promise<any> => {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  const userData = {
    profile: await getDoc(doc(db, 'users', currentUser.uid)),
    locations: await getDocs(query(collection(db, 'locations'), where('userId', '==', currentUser.uid))),
    friends: await getDocs(query(collection(db, 'friends'), where('userId', '==', currentUser.uid))),
    homes: await getDocs(query(collection(db, 'homes'), where('userId', '==', currentUser.uid)))
  };

  return userData;
};
```

## Testing

### Test Client-Side Cleanup

```typescript
// Force cleanup regardless of last run time
const results = await runDataRetentionCleanup();
console.log('Cleanup results:', results);
```

### Test Cloud Functions Locally

```bash
firebase emulators:start --only functions
```

Then trigger manually:
```bash
firebase functions:shell
> cleanupOldLocations()
```

## Monitoring

### Check Retention Stats

```typescript
import { getRetentionStats } from './src/utils/dataRetention';

const stats = await getRetentionStats();
console.log(`Total locations: ${stats.totalLocations}`);
console.log(`Old locations (>${stats.retentionDays} days): ${stats.oldLocations}`);
```

### Firebase Console

Monitor in Firebase Console:
- Firestore → Usage tab
- Functions → Logs (if using Cloud Functions)

## Cost Considerations

### Client-Side (Free)
- No additional costs
- Uses Firestore read/delete operations (generous free tier)

### Cloud Functions (Blaze Plan)
- ~$0.40/million invocations
- Daily cleanup = ~30 invocations/month = negligible cost
- Firestore operations still apply

## Privacy Policy Requirements

Add to your privacy policy:

```
Data Retention:
- Location data is automatically deleted after 30 days
- Rejected friend requests are deleted after 90 days
- You can request deletion of all your data at any time
- You can export your data at any time (GDPR right to data portability)
```

## Current Status

✅ Client-side cleanup implemented
✅ GDPR deletion function implemented
⏳ Cloud Functions setup (optional, for production)
⏳ Data export function (for GDPR compliance)

## Next Steps

1. Test client-side cleanup in development
2. Add cleanup call to App.tsx
3. (Optional) Set up Cloud Functions for production
4. Add "Delete Account" button in Profile screen
5. Add "Export Data" button in Profile screen
6. Update privacy policy

## Resources

- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [GDPR Compliance Guide](https://gdpr.eu/compliance/)
- [CCPA Compliance Guide](https://oag.ca.gov/privacy/ccpa)
