#!/usr/bin/env node

const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.json'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteRequest() {
  const requestId = 'TflnRcbWOitRgLr0IBoe';
  
  console.log(`\n🗑️  Deleting friend request: ${requestId}\n`);
  
  await db.collection('friendRequests').doc(requestId).delete();
  
  console.log('✅ Request deleted!\n');
  
  process.exit(0);
}

deleteRequest().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
