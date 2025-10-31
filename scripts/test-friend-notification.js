#!/usr/bin/env node

/**
 * Test friend request notification for existing request
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function testFriendNotification() {
  try {
    // Get Jodi's push token
    const jodiSnapshot = await db.collection('users').where('name', '==', 'Jodi').get();
    const jodiDoc = jodiSnapshot.docs[0];
    const jodiData = jodiDoc.data();
    const jodiId = jodiDoc.id;
    
    console.log(`Jodi ID: ${jodiId}`);
    console.log(`Jodi Push Token: ${jodiData.expoPushToken ? 'Present' : 'Missing'}`);
    
    if (!jodiData.expoPushToken) {
      console.log('❌ Jodi has no push token');
      return;
    }
    
    // Send friend request notification using our new function
    const message = {
      to: jodiData.expoPushToken,
      sound: 'default',
      title: '👋 Friend Request',
      body: 'Jamie wants to connect and share Dartmouth',
      data: { 
        type: 'friend_request',
        fromUserName: 'Jamie',
        homeNames: ['Dartmouth'],
        screen: 'Friends'
      },
    };
    
    console.log('📤 Sending test friend request notification...');
    
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    
    if (result.data && result.data.status === 'ok') {
      console.log(`✅ Friend request notification sent successfully!`);
      console.log(`   Ticket ID: ${result.data.id}`);
    } else {
      console.error(`❌ Failed to send notification:`, result);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testFriendNotification();
