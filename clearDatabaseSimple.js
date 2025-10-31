#!/usr/bin/env node

// Simple script to clear FriendZone database 
// Run with: node clearDatabaseSimple.js
// Note: This requires the Firestore rules to allow admin access

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc } = require('firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Your Firebase config (from firebaseConfig.ts)
const firebaseConfig = {
  apiKey: "AIzaSyAvzlI4PJl_cqcWJcXgyXyImUuF5c_Hiek",
  authDomain: "homer-323fe.firebaseapp.com",
  projectId: "homer-323fe",
  storageBucket: "homer-323fe.firebasestorage.app",
  messagingSenderId: "761933707709",
  appId: "1:761933707709:ios:0b6c4aacc39b58e6803ad4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function authenticateAsAdmin() {
  try {
    console.log('🔐 Authenticating as admin user...');
    
    // Use the same email/password format as your app
    const adminEmail = '17812494070@homer.app'; // Your phone number
    const adminPassword = 'tempPassword123';
    
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    console.log('✅ Authenticated as admin successfully');
    
  } catch (error) {
    console.error('❌ Authentication failed:', error.message);
    console.log('💡 Make sure you have completed profile setup with phone number 7812494070');
    throw error;
  }
}

async function clearCollection(collectionName) {
  try {
    console.log(`🧹 Clearing collection: ${collectionName}`);
    
    const snapshot = await getDocs(collection(db, collectionName));
    console.log(`Found ${snapshot.docs.length} documents in ${collectionName}`);
    
    if (snapshot.docs.length === 0) {
      console.log(`✅ Collection ${collectionName} is already empty`);
      return 0;
    }
    
    // Delete documents one by one
    let deleted = 0;
    let failed = 0;
    
    for (const doc of snapshot.docs) {
      try {
        await deleteDoc(doc.ref);
        deleted++;
        if (deleted % 5 === 0) {
          console.log(`   Progress: ${deleted}/${snapshot.docs.length} deleted...`);
        }
      } catch (deleteError) {
        failed++;
        console.error(`   ❌ Failed to delete document ${doc.id}:`, deleteError.message);
      }
    }
    
    console.log(`✅ Results: ${deleted} deleted, ${failed} failed from ${collectionName}`);
    return deleted;
    
  } catch (error) {
    console.error(`❌ Error accessing ${collectionName}:`, error.message);
    return 0;
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
  console.log('⚠️  This will attempt to delete ALL data!');
  
  const collections = ['users', 'friends', 'homes', 'friendRequests', 'locations'];
  let totalCleared = 0;
  
  for (const collectionName of collections) {
    const cleared = await clearCollection(collectionName);
    totalCleared += cleared;
  }
  
  console.log(`✅ Total cleared: ${totalCleared} documents from database`);
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  console.log('🚀 FriendZone Simple Database Cleaner');
  console.log('====================================');
  console.log('⚠️  Note: This script authenticates as admin user 7812494070');
  console.log('');
  
  try {
    // Authenticate first
    await authenticateAsAdmin();
    console.log('');
    
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
        console.log('  node clearDatabaseSimple.js requests  - Clear only friend requests');
        console.log('  node clearDatabaseSimple.js friends   - Clear friends and friend requests');
        console.log('  node clearDatabaseSimple.js all       - Clear entire database');
        console.log('');
        console.log('Examples:');
        console.log('  node clearDatabaseSimple.js requests');
        console.log('  node clearDatabaseSimple.js all');
        console.log('');
        console.log('Prerequisites:');
        console.log('  1. Deploy Firestore rules with admin permissions');
        console.log('  2. firebase deploy --only firestore:rules');
        break;
    }
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
  
  console.log('');
  console.log('✅ Script completed');
  process.exit(0);
}

main().catch(console.error);
