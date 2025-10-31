#!/usr/bin/env node

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkFriendRequest() {
  try {
    // Get Jamie's ID
    const jamieSnapshot = await db.collection('users').where('name', '==', 'Jamie').get();
    const jamieId = jamieSnapshot.docs[0].id;
    
    // Get Jodi's ID  
    const jodiSnapshot = await db.collection('users').where('name', '==', 'Jodi').get();
    const jodiId = jodiSnapshot.docs[0].id;
    
    console.log(`Jamie ID: ${jamieId}`);
    console.log(`Jodi ID: ${jodiId}\n`);
    
    // Find the friend request
    const requestSnapshot = await db.collection('friendRequests')
      .where('fromUserId', '==', jamieId)
      .where('toUserId', '==', jodiId)
      .get();
    
    if (requestSnapshot.empty) {
      console.log('❌ No friend request found from Jamie to Jodi');
      return;
    }
    
    const requestDoc = requestSnapshot.docs[0];
    const requestData = requestDoc.data();
    
    console.log('📋 Friend Request Details:');
    console.log(`   ID: ${requestDoc.id}`);
    console.log(`   Status: ${requestData.status}`);
    console.log(`   Created At: ${requestData.createdAt} (${typeof requestData.createdAt})`);
    console.log(`   From User: ${requestData.fromUserId}`);
    console.log(`   To User: ${requestData.toUserId}`);
    console.log(`   Shared Homes: ${requestData.sharedHomeIds?.join(', ') || 'None'}`);
    console.log(`   Full Data:`, JSON.stringify(requestData, null, 2));
    
    // Check if notification was sent
    if (requestData.createdAt) {
      const createdTime = new Date(requestData.createdAt);
      const now = new Date();
      const timeDiff = now - createdTime;
      
      console.log(`\n⏰ Timing:`);
      console.log(`   Created: ${createdTime.toLocaleString()}`);
      console.log(`   Now: ${now.toLocaleString()}`);
      console.log(`   Time since creation: ${Math.round(timeDiff / 1000 / 60)} minutes ago`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkFriendRequest();
