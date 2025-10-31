#!/usr/bin/env node

/**
 * Cleanup Stale Friend Requests
 * Deletes friend requests where users are already friends
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupStaleRequests() {
  console.log('\n🧹 ===== CLEANUP STALE FRIEND REQUESTS =====\n');

  // Get all friend requests
  const requestsSnapshot = await db.collection('friendRequests').get();
  
  // Get all friend relationships
  const friendsSnapshot = await db.collection('friends').get();
  const friendPairs = new Set();
  
  friendsSnapshot.forEach(doc => {
    const data = doc.data();
    const pair = [data.userId, data.friendUserId].sort().join('_');
    friendPairs.add(pair);
  });
  
  console.log(`📊 Found ${friendPairs.size} existing friendships`);
  console.log(`📊 Found ${requestsSnapshot.size} friend requests\n`);
  
  const staleRequests = [];
  
  requestsSnapshot.forEach(doc => {
    const data = doc.data();
    
    // Check if this is a request between users who are already friends
    if (data.fromUserId && data.toUserId) {
      const pair = [data.fromUserId, data.toUserId].sort().join('_');
      
      if (friendPairs.has(pair)) {
        staleRequests.push({
          id: doc.id,
          from: data.fromUserName,
          to: data.toUserId,
          status: data.status,
          homeIds: data.homeIds || []
        });
      }
    }
  });
  
  if (staleRequests.length === 0) {
    console.log('✅ No stale requests found!');
    process.exit(0);
    return;
  }
  
  console.log(`⚠️  Found ${staleRequests.length} stale requests:\n`);
  
  staleRequests.forEach(req => {
    console.log(`📋 Request ID: ${req.id}`);
    console.log(`   From: ${req.from}`);
    console.log(`   Status: ${req.status}`);
    console.log(`   Zones: ${req.homeIds.length}`);
    console.log('');
  });
  
  console.log('🗑️  Deleting stale requests...\n');
  
  for (const req of staleRequests) {
    await db.collection('friendRequests').doc(req.id).delete();
    console.log(`✅ Deleted: ${req.id} (${req.from})`);
  }
  
  console.log(`\n✅ Deleted ${staleRequests.length} stale friend requests`);
  console.log('\n✅ ===== CLEANUP COMPLETE =====\n');
  
  process.exit(0);
}

cleanupStaleRequests().catch(error => {
  console.error('❌ Error cleaning up stale requests:', error);
  process.exit(1);
});
