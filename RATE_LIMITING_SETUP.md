# Rate Limiting Setup for Friend Requests

## Problem
Currently, there's no limit on how many friend requests a user can send, which could lead to spam or abuse.

## Solution
Implement rate limiting using Firebase Cloud Functions (server-side enforcement).

## Implementation Steps

### 1. Install Firebase Functions
```bash
npm install -g firebase-tools
firebase init functions
```

### 2. Create Rate Limiting Function

Create `functions/src/index.ts`:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Rate limit: 50 friend requests per day per user
const DAILY_LIMIT = 50;

export const checkFriendRequestRateLimit = functions.firestore
  .document('friendRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const request = snap.data();
    const fromUserId = request.fromUserId;
    
    // Get timestamp for 24 hours ago
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    // Count requests from this user in the last 24 hours
    const recentRequests = await admin.firestore()
      .collection('friendRequests')
      .where('fromUserId', '==', fromUserId)
      .where('createdAt', '>', oneDayAgo)
      .get();
    
    if (recentRequests.size > DAILY_LIMIT) {
      // Delete the request that triggered this
      await snap.ref.delete();
      
      // Log the violation
      await admin.firestore().collection('rateLimitViolations').add({
        userId: fromUserId,
        type: 'friend_request',
        timestamp: Date.now(),
        count: recentRequests.size
      });
      
      console.warn(`Rate limit exceeded for user ${fromUserId}: ${recentRequests.size} requests`);
    }
  });
```

### 3. Deploy the Function
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

### 4. Update Firestore Rules

The rate limiting is enforced server-side, but we can add a client-side check too:

```javascript
// In firestore.rules
match /friendRequests/{requestId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && 
    request.auth.uid == request.resource.data.fromUserId &&
    // Client-side hint (server enforces the real limit)
    request.resource.data.createdAt != null;
  allow update: if request.auth != null &&
    (resource.data.fromUserId == request.auth.uid ||
     resource.data.toUserId == request.auth.uid);
  allow delete: if (request.auth != null &&
    (resource.data.fromUserId == request.auth.uid ||
     resource.data.toUserId == request.auth.uid)) || isAdmin();
}
```

### 5. Add User Feedback

In your friend request UI, add a message when approaching the limit:

```typescript
// Before sending friend request
const checkRateLimit = async (userId: string) => {
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  
  const recentRequests = await getDocs(
    query(
      collection(db, 'friendRequests'),
      where('fromUserId', '==', userId),
      where('createdAt', '>', oneDayAgo)
    )
  );
  
  const count = recentRequests.size;
  
  if (count >= 50) {
    Alert.alert(
      'Rate Limit Reached',
      'You have reached the daily limit of 50 friend requests. Please try again tomorrow.'
    );
    return false;
  } else if (count >= 40) {
    Alert.alert(
      'Approaching Limit',
      `You have sent ${count} friend requests today. Daily limit is 50.`
    );
  }
  
  return true;
};
```

## Benefits
- Prevents spam and abuse
- Server-side enforcement (can't be bypassed)
- Tracks violations for monitoring
- User-friendly warnings

## Cost
- Firebase Functions: Free tier includes 2M invocations/month
- This should be well within free tier for most apps

## Alternative: Client-Side Only
If you don't want to use Cloud Functions, you can implement a simpler client-side check:

1. Add a `friendRequestCount` and `lastRequestReset` field to user documents
2. Check and increment on each request
3. Reset daily

**Note:** This can be bypassed by malicious users, so server-side is recommended for production.
