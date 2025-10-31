#!/usr/bin/env node

/**
 * FriendZone Notification Sender
 * 
 * Usage:
 *   node send-notification.js <userId> <title> <body>
 * 
 * Example:
 *   node send-notification.js Jamie "Welcome to Stowe" "You have 2 friends here"
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin (reuse existing initialization if already done)
if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const messaging = admin.messaging();

// Helper to resolve user ID from name or ID
async function resolveUserId(nameOrId) {
  if (nameOrId.length > 15) {
    return nameOrId;
  }
  
  const usersSnapshot = await db.collection('users')
    .where('name', '==', nameOrId)
    .get();
  
  if (usersSnapshot.empty) {
    throw new Error(`User "${nameOrId}" not found. Use exact name (case-sensitive) or user ID.`);
  }
  
  if (usersSnapshot.size > 1) {
    console.log(`\n⚠️  Multiple users found with name "${nameOrId}":`);
    usersSnapshot.forEach(doc => {
      console.log(`   - ${doc.data().name} (ID: ${doc.id})`);
    });
    throw new Error('Please use the specific user ID instead.');
  }
  
  const userId = usersSnapshot.docs[0].id;
  console.log(`✓ Resolved "${nameOrId}" to user ID: ${userId}`);
  return userId;
}

// Get user's push token
async function getUserPushToken(userId) {
  const userDoc = await db.collection('users').doc(userId).get();
  
  if (!userDoc.exists) {
    throw new Error(`User ${userId} not found`);
  }
  
  const userData = userDoc.data();
  const pushToken = userData.expoPushToken;
  
  if (!pushToken) {
    throw new Error(`User ${userData.name || userId} has no push token registered`);
  }
  
  return pushToken;
}

// Send notification
async function sendNotification(userNameOrId, title, body) {
  try {
    console.log(`\n🔔 Sending notification...`);
    
    const userId = await resolveUserId(userNameOrId);
    const pushToken = await getUserPushToken(userId);
    
    console.log(`   To: ${userNameOrId}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    
    // Send via Expo Push Notification service
    const message = {
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: { 
        type: 'custom',
        timestamp: Date.now()
      },
    };
    
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
      console.log(`\n✅ Notification sent successfully!`);
      console.log(`   Ticket ID: ${result.data.id}`);
    } else {
      console.error(`\n❌ Failed to send notification:`, result);
    }
    
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
    throw error;
  }
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log(`
FriendZone Notification Sender

Usage:
  node send-notification.js <user> <title> <body>

Examples:
  node send-notification.js Jamie "Welcome to Stowe" "You have 2 friends here"
  node send-notification.js CEEE6qK8grOjqPQpzWtsGI7eZ7J2 "Test" "This is a test"
    `);
    process.exit(0);
  }
  
  const user = args[0];
  const title = args[1];
  const body = args[2];
  
  try {
    await sendNotification(user, title, body);
    console.log('\n✅ Done!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
