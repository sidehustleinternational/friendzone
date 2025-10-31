#!/usr/bin/env node

/**
 * Cleanup Duplicates Script
 * Run with: node scripts/cleanup-duplicates.js
 */

const admin = require('firebase-admin');
const path = require('path');
const readline = require('readline');

// Initialize Firebase Admin
const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function cleanupDuplicates() {
  console.log('\n🧹 ===== DUPLICATE CLEANUP =====\n');

  // Get all users
  const usersSnapshot = await db.collection('users').get();
  const users = {};
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    users[doc.id] = data.name || data.email || 'Unknown';
  });

  // Get all friend relationships
  const friendsSnapshot = await db.collection('friends').get();
  const friendsByUser = {};
  
  friendsSnapshot.forEach(doc => {
    const data = doc.data();
    const userId = data.userId;
    
    if (!friendsByUser[userId]) {
      friendsByUser[userId] = [];
    }
    
    friendsByUser[userId].push({
      id: doc.id,
      friendName: data.name,
      friendUserId: data.friendUserId,
      sharedHomes: data.sharedHomes || [],
      activeHomes: data.activeHomes || [],
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  });

  // Find duplicates
  const duplicatesToDelete = [];
  
  Object.keys(friendsByUser).forEach(userId => {
    const friends = friendsByUser[userId];
    const friendUserIds = new Map();
    
    friends.forEach(friend => {
      if (!friendUserIds.has(friend.friendUserId)) {
        friendUserIds.set(friend.friendUserId, []);
      }
      friendUserIds.get(friend.friendUserId).push(friend);
    });
    
    // Check for duplicates
    friendUserIds.forEach((friendDocs, friendUserId) => {
      if (friendDocs.length > 1) {
        console.log(`\n⚠️  Found ${friendDocs.length} duplicate friend docs:`);
        console.log(`   ${users[userId]} → ${users[friendUserId]}`);
        
        // Sort by most recent updatedAt or createdAt
        friendDocs.sort((a, b) => {
          const aTime = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const bTime = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return bTime - aTime; // Most recent first
        });
        
        // Keep the first (most recent), delete the rest
        console.log(`   ✅ Keeping: ${friendDocs[0].id} (most recent)`);
        console.log(`      Shared: ${friendDocs[0].sharedHomes.length} zones`);
        console.log(`      Active: ${friendDocs[0].activeHomes.length} zones`);
        
        for (let i = 1; i < friendDocs.length; i++) {
          console.log(`   ❌ Will delete: ${friendDocs[i].id}`);
          console.log(`      Shared: ${friendDocs[i].sharedHomes.length} zones`);
          console.log(`      Active: ${friendDocs[i].activeHomes.length} zones`);
          duplicatesToDelete.push(friendDocs[i].id);
        }
      }
    });
  });

  if (duplicatesToDelete.length === 0) {
    console.log('\n✅ No duplicates found!');
    rl.close();
    process.exit(0);
    return;
  }

  console.log(`\n\n⚠️  Found ${duplicatesToDelete.length} duplicate documents to delete.`);
  const answer = await question('\nDo you want to delete these duplicates? (yes/no): ');
  
  if (answer.toLowerCase() === 'yes') {
    console.log('\n🗑️  Deleting duplicates...');
    
    for (const docId of duplicatesToDelete) {
      await db.collection('friends').doc(docId).delete();
      console.log(`   ✅ Deleted: ${docId}`);
    }
    
    console.log(`\n✅ Deleted ${duplicatesToDelete.length} duplicate documents`);
  } else {
    console.log('\n❌ Cleanup cancelled');
  }

  rl.close();
  process.exit(0);
}

cleanupDuplicates().catch(error => {
  console.error('❌ Error cleaning up duplicates:', error);
  rl.close();
  process.exit(1);
});
