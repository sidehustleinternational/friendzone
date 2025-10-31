#!/usr/bin/env node

// Admin script to clear FriendZone database using Firebase Admin SDK
// Run with: node clearDatabaseAdmin.js

const admin = require('firebase-admin');

// Initialize Firebase Admin with service account
// You'll need to download the service account key from Firebase Console
const serviceAccount = require('./serviceAccountKey.json'); // You'll need to add this file

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://homer-323fe-default-rtdb.firebaseio.com"
});

const db = admin.firestore();

async function clearCollection(collectionName) {
  try {
    console.log(`🧹 Clearing collection: ${collectionName}`);
    
    const snapshot = await db.collection(collectionName).get();
    console.log(`Found ${snapshot.docs.length} documents in ${collectionName}`);
    
    if (snapshot.docs.length === 0) {
      console.log(`✅ Collection ${collectionName} is already empty`);
      return 0;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`✅ Cleared ${snapshot.docs.length} documents from ${collectionName}`);
    return snapshot.docs.length;
    
  } catch (error) {
    console.error(`❌ Error clearing ${collectionName}:`, error);
    throw error;
  }
}

async function clearFriendRequests() {
  console.log('🎯 Clearing friend requests only...');
  const cleared = await clearCollection('friendRequests');
  console.log(`✅ Total cleared: ${cleared} friend requests`);
}

async function clearFriendData() {
  console.log('🎯 Clearing all friend-related data...');
  
  const collections = ['friends', 'friendRequests'];
  let totalCleared = 0;
  
  for (const collectionName of collections) {
    const cleared = await clearCollection(collectionName);
    totalCleared += cleared;
  }
  
  console.log(`✅ Total cleared: ${totalCleared} friend-related documents`);
}

async function clearEntireDatabase() {
  console.log('🎯 Clearing entire FriendZone database...');
  console.log('⚠️  This will delete ALL data including users, friends, homes, and locations!');
  
  const collections = ['users', 'friends', 'homes', 'friendRequests', 'locations'];
  let totalCleared = 0;
  
  for (const collectionName of collections) {
    const cleared = await clearCollection(collectionName);
    totalCleared += cleared;
  }
  
  console.log(`✅ Total cleared: ${totalCleared} documents from entire database`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  console.log('🚀 FriendZone Admin Database Cleaner');
  console.log('===================================');
  console.log('Using Firebase Admin SDK with full permissions');
  console.log('');
  
  try {
    switch (command) {
      case 'requests':
        await clearFriendRequests();
        break;
      case 'friends':
        await clearFriendData();
        break;
      case 'all':
        await clearEntireDatabase();
        break;
      default:
        console.log('Usage:');
        console.log('  node clearDatabaseAdmin.js requests  - Clear only friend requests');
        console.log('  node clearDatabaseAdmin.js friends   - Clear friends and friend requests');
        console.log('  node clearDatabaseAdmin.js all       - Clear entire database');
        console.log('');
        console.log('Examples:');
        console.log('  node clearDatabaseAdmin.js requests');
        console.log('  node clearDatabaseAdmin.js all');
        break;
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
  
  console.log('');
  console.log('✅ Script completed successfully');
  process.exit(0);
}

main().catch(console.error);
