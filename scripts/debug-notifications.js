#!/usr/bin/env node

/**
 * Debug notification issues
 * Check recent friend requests, user tokens, and notification logs
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function debugNotifications() {
  try {
    console.log('🔍 Debugging notification issues...\n');

    // 1. Check recent friend requests
    console.log('📋 Recent Friend Requests (last 24 hours):');
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    const friendRequestsSnapshot = await db.collection('friendRequests')
      .where('createdAt', '>', oneDayAgo)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    if (friendRequestsSnapshot.empty) {
      console.log('   No recent friend requests found\n');
    } else {
      for (const doc of friendRequestsSnapshot.docs) {
        const data = doc.data();
        const fromUser = await getUserName(data.fromUserId);
        const toUser = await getUserName(data.toUserId);
        const createdAt = new Date(data.createdAt).toLocaleString();
        
        console.log(`   ${createdAt}: ${fromUser} → ${toUser} (Status: ${data.status})`);
        console.log(`     Homes: ${data.sharedHomeIds?.join(', ') || 'None'}`);
        console.log(`     ID: ${doc.id}\n`);
      }
    }

    // 2. Check users and their push tokens
    console.log('👥 User Push Token Status:');
    const usersSnapshot = await db.collection('users').get();
    
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const hasToken = !!data.expoPushToken;
      const tokenPreview = data.expoPushToken ? 
        `${data.expoPushToken.substring(0, 20)}...` : 
        'None';
      
      console.log(`   ${data.name}: ${hasToken ? '✅' : '❌'} ${tokenPreview}`);
    }

    // 3. Check for Jamie and Jodi specifically
    console.log('\n🎯 Jamie & Jodi Status:');
    const jamie = await findUserByName('Jamie');
    const jodi = await findUserByName('Jodi');
    
    if (jamie) {
      console.log(`   Jamie (${jamie.id}): ${jamie.data.expoPushToken ? '✅ Has token' : '❌ No token'}`);
    } else {
      console.log('   Jamie: ❌ Not found');
    }
    
    if (jodi) {
      console.log(`   Jodi (${jodi.id}): ${jodi.data.expoPushToken ? '✅ Has token' : '❌ No token'}`);
    } else {
      console.log('   Jodi: ❌ Not found');
    }

    // 4. Check for pending friend requests between Jamie and Jodi
    if (jamie && jodi) {
      console.log('\n🔄 Friend Requests between Jamie & Jodi:');
      
      const requestsSnapshot = await db.collection('friendRequests')
        .where('fromUserId', 'in', [jamie.id, jodi.id])
        .get();
      
      const relevantRequests = requestsSnapshot.docs.filter(doc => {
        const data = doc.data();
        return (data.fromUserId === jamie.id && data.toUserId === jodi.id) ||
               (data.fromUserId === jodi.id && data.toUserId === jamie.id);
      });
      
      if (relevantRequests.length === 0) {
        console.log('   No friend requests found between Jamie and Jodi');
      } else {
        for (const doc of relevantRequests) {
          const data = doc.data();
          const from = data.fromUserId === jamie.id ? 'Jamie' : 'Jodi';
          const to = data.toUserId === jamie.id ? 'Jamie' : 'Jodi';
          const createdAt = new Date(data.createdAt).toLocaleString();
          
          console.log(`   ${createdAt}: ${from} → ${to} (${data.status})`);
          console.log(`     Homes: ${data.sharedHomeIds?.join(', ') || 'None'}`);
        }
      }
    }

    console.log('\n✅ Debug complete!');

  } catch (error) {
    console.error('❌ Error debugging notifications:', error);
  }
}

async function getUserName(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    return userDoc.exists ? userDoc.data().name : `Unknown (${userId})`;
  } catch (error) {
    return `Error (${userId})`;
  }
}

async function findUserByName(name) {
  try {
    const usersSnapshot = await db.collection('users')
      .where('name', '==', name)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      return null;
    }
    
    const doc = usersSnapshot.docs[0];
    return {
      id: doc.id,
      data: doc.data()
    };
  } catch (error) {
    console.error(`Error finding user ${name}:`, error);
    return null;
  }
}

debugNotifications();
