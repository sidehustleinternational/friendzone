#!/usr/bin/env node

// Client script to clear FriendZone database using existing Firebase config
// Run with: node clearDatabaseClient.js

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, connectFirestoreEmulator } = require('firebase/firestore');
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
    
    // You'll need to provide your admin credentials
    const adminEmail = '17812494070@homer.app'; // Your admin email
    const adminPassword = 'tempPassword123'; // Your admin password
    
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
    console.log('✅ Authenticated successfully');
    
  } catch (error) {
    console.error('❌ Authentication failed:', error);
    console.log('💡 Make sure you have an account with email: 17812494070@homer.app');
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
    
    // Delete documents one by one (client SDK doesn't support batch deletes as easily)
    let deleted = 0;
    for (const doc of snapshot.docs) {
      try {
        await deleteDoc(doc.ref);
        deleted++;
        if (deleted % 10 === 0) {
          console.log(`   Deleted ${deleted}/${snapshot.docs.length} documents...`);
        }
      } catch (deleteError) {
        console.error(`   Failed to delete document ${doc.id}:`, deleteError);
      }
    }
    
    console.log(`✅ Cleared ${deleted} documents from ${collectionName}`);
    return deleted;
    
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
  console.log('🚀 FriendZone Client Database Cleaner');
  console.log('====================================');
  console.log('Using Firebase Client SDK with admin authentication');
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
        console.log('  node clearDatabaseClient.js requests  - Clear only friend requests');
        console.log('  node clearDatabaseClient.js friends   - Clear friends and friend requests');
        console.log('  node clearDatabaseClient.js all       - Clear entire database');
        console.log('');
        console.log('Examples:');
        console.log('  node clearDatabaseClient.js requests');
        console.log('  node clearDatabaseClient.js all');
        console.log('');
        console.log('Note: This script authenticates as admin user 17812494070@homer.app');
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
