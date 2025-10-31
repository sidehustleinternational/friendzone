// Script to clear all friend requests from Firebase
// Run with: node clearFriendRequests.js

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json'); // You'll need to download this from Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearAllFriendRequests() {
  try {
    console.log('🗑️  Clearing all friend requests...');
    
    const friendRequestsRef = db.collection('friendRequests');
    const snapshot = await friendRequestsRef.get();
    
    console.log(`Found ${snapshot.size} friend requests`);
    
    if (snapshot.empty) {
      console.log('No friend requests to delete');
      return;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      console.log(`Deleting friend request: ${doc.id}`);
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log('✅ All friend requests cleared!');
    
  } catch (error) {
    console.error('Error clearing friend requests:', error);
  } finally {
    process.exit();
  }
}

clearAllFriendRequests();
