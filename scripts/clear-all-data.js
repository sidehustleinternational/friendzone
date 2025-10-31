#!/usr/bin/env node

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearAllData() {
  console.log('\n🗑️  ===== CLEARING ALL DATA =====\n');

  // Clear friends
  const friendsSnapshot = await db.collection('friends').get();
  console.log(`Deleting ${friendsSnapshot.size} friend documents...`);
  for (const doc of friendsSnapshot.docs) {
    await doc.ref.delete();
  }
  console.log('✅ Friends cleared');

  // Clear friend requests
  const requestsSnapshot = await db.collection('friendRequests').get();
  console.log(`Deleting ${requestsSnapshot.size} friend request documents...`);
  for (const doc of requestsSnapshot.docs) {
    await doc.ref.delete();
  }
  console.log('✅ Friend requests cleared');

  // Clear homes
  const homesSnapshot = await db.collection('homes').get();
  console.log(`Deleting ${homesSnapshot.size} home documents...`);
  for (const doc of homesSnapshot.docs) {
    await doc.ref.delete();
  }
  console.log('✅ Homes cleared');

  console.log('\n✅ ===== ALL DATA CLEARED =====\n');
  console.log('Note: User accounts are NOT deleted (they stay authenticated)');
  
  process.exit(0);
}

clearAllData().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
