#!/usr/bin/env node

/**
 * Database Inspection Script
 * Run with: node scripts/inspect-database.js
 */

const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function inspectDatabase() {
  console.log('\n🔍 ===== DATABASE INSPECTION =====\n');

  // Get all users
  console.log('👥 ===== USERS =====');
  const usersSnapshot = await db.collection('users').get();
  const users = {};
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    users[doc.id] = data.name || data.email || 'Unknown';
    console.log(`\n📋 User: ${doc.id}`);
    console.log(`   Name: ${data.name}`);
    console.log(`   Email: ${data.email}`);
    console.log(`   Phone: ${data.phoneNumber}`);
  });

  // Get all homes/zones
  console.log('\n\n🏠 ===== HOMES/ZONES =====');
  const homesSnapshot = await db.collection('homes').get();
  const homes = {};
  homesSnapshot.forEach(doc => {
    const data = doc.data();
    homes[doc.id] = data.name;
    console.log(`\n📋 Zone: ${data.name} (${doc.id})`);
    console.log(`   Created by: ${users[data.createdBy] || data.createdBy}`);
    console.log(`   Members: ${(data.members || []).map(m => users[m] || m).join(', ')}`);
    console.log(`   Radius: ${data.radius} miles`);
    console.log(`   Location: ${data.location?.address || 'No address'}`);
  });

  // Get all friend relationships
  console.log('\n\n👫 ===== FRIEND RELATIONSHIPS =====');
  const friendsSnapshot = await db.collection('friends').get();
  const friendsByUser = {};
  
  friendsSnapshot.forEach(doc => {
    const data = doc.data();
    const userId = data.userId;
    const friendUserId = data.friendUserId;
    
    if (!friendsByUser[userId]) {
      friendsByUser[userId] = [];
    }
    
    friendsByUser[userId].push({
      id: doc.id,
      friendName: data.name,
      friendUserId: friendUserId,
      sharedHomes: data.sharedHomes || [],
      activeHomes: data.activeHomes || [],
      status: data.status
    });
  });

  Object.keys(friendsByUser).forEach(userId => {
    console.log(`\n📋 ${users[userId] || userId}'s Friends:`);
    friendsByUser[userId].forEach(friend => {
      console.log(`   - ${friend.friendName} (${friend.friendUserId})`);
      console.log(`     Doc ID: ${friend.id}`);
      console.log(`     Status: ${friend.status}`);
      console.log(`     Shared Homes: ${friend.sharedHomes.map(h => homes[h] || h).join(', ')}`);
      console.log(`     Active Homes: ${friend.activeHomes.map(h => homes[h] || h).join(', ')}`);
    });
  });

  // Get all friend requests
  console.log('\n\n📬 ===== FRIEND REQUESTS =====');
  const requestsSnapshot = await db.collection('friendRequests').get();
  
  if (requestsSnapshot.empty) {
    console.log('   No pending friend requests');
  } else {
    requestsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n📋 Request: ${doc.id}`);
      console.log(`   From: ${users[data.fromUserId] || data.fromUserId} (${data.fromUserName})`);
      console.log(`   To: ${data.toPhoneNumber} (${users[data.toUserId] || data.toUserId || 'Not registered'})`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Zones: ${(data.homeIds || [data.homeId]).filter(Boolean).map(h => homes[h] || h).join(', ')}`);
      console.log(`   Created: ${data.createdAt?.toDate?.() || 'Unknown'}`);
    });
  }

  // Check for duplicates
  console.log('\n\n⚠️  ===== DUPLICATE DETECTION =====');
  
  // Check for duplicate friend relationships
  const friendPairs = new Map();
  Object.keys(friendsByUser).forEach(userId => {
    friendsByUser[userId].forEach(friend => {
      const pairKey = [userId, friend.friendUserId].sort().join('_');
      if (!friendPairs.has(pairKey)) {
        friendPairs.set(pairKey, []);
      }
      friendPairs.get(pairKey).push({
        userId,
        friendUserId: friend.friendUserId,
        docId: friend.id
      });
    });
  });

  let duplicatesFound = false;
  friendPairs.forEach((pairs, pairKey) => {
    const [user1, user2] = pairKey.split('_');
    const user1Docs = pairs.filter(p => p.userId === user1);
    const user2Docs = pairs.filter(p => p.userId === user2);
    
    if (user1Docs.length > 1) {
      duplicatesFound = true;
      console.log(`\n⚠️  ${users[user1]} has ${user1Docs.length} friend docs for ${users[user2]}:`);
      user1Docs.forEach(d => console.log(`   - ${d.docId}`));
    }
    
    if (user2Docs.length > 1) {
      duplicatesFound = true;
      console.log(`\n⚠️  ${users[user2]} has ${user2Docs.length} friend docs for ${users[user1]}:`);
      user2Docs.forEach(d => console.log(`   - ${d.docId}`));
    }
  });

  if (!duplicatesFound) {
    console.log('   ✅ No duplicate friend relationships found');
  }

  console.log('\n\n✅ ===== INSPECTION COMPLETE =====\n');
  process.exit(0);
}

inspectDatabase().catch(error => {
  console.error('❌ Error inspecting database:', error);
  process.exit(1);
});
