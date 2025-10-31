const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkNotifications() {
  try {
    const searchTerm = process.argv[2];
    
    if (!searchTerm) {
      console.log('Usage: node check-notifications.js "Name" or +1XXXXXXXXXX');
      console.log('Example: node check-notifications.js "Brad"');
      process.exit(1);
    }
    
    console.log(`\n🔍 Searching for: ${searchTerm}\n`);
    
    // Find user
    let userId = null;
    let userName = null;
    
    if (searchTerm.startsWith('+')) {
      const usersSnapshot = await db.collection('users')
        .where('phoneNumber', '==', searchTerm)
        .get();
      
      if (!usersSnapshot.empty) {
        userId = usersSnapshot.docs[0].id;
        userName = usersSnapshot.docs[0].data().name;
      }
    } else {
      const usersSnapshot = await db.collection('users').get();
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.name && data.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          userId = doc.id;
          userName = data.name;
        }
      });
    }
    
    if (!userId) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    console.log(`✅ Found: ${userName} (${userId})\n`);
    
    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    console.log('📱 PUSH NOTIFICATION STATUS:');
    console.log('═══════════════════════════════════════\n');
    
    const pushToken = userData.expoPushToken || userData.pushToken;
    console.log(`Push Token: ${pushToken ? pushToken.substring(0, 40) + '...' : '❌ NONE'}`);
    console.log(`Token Updated: ${userData.pushTokenUpdatedAt ? (userData.pushTokenUpdatedAt.toDate ? new Date(userData.pushTokenUpdatedAt.toDate()).toLocaleString() : userData.pushTokenUpdatedAt) : 'Never'}`);
    console.log(`Notifications Enabled: ${userData.notificationsEnabled !== false ? '✅ Yes' : '❌ No'}`);
    
    // Check recent friend requests TO this user
    console.log('\n\n📬 RECENT FRIEND REQUESTS (TO THIS USER):');
    console.log('═══════════════════════════════════════\n');
    
    const requestsSnapshot = await db.collection('friendRequests')
      .where('toUserId', '==', userId)
      .limit(10)
      .get();
    
    if (requestsSnapshot.empty) {
      console.log('No friend requests found');
    } else {
      requestsSnapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'Unknown';
        console.log(`[${createdAt}]`);
        console.log(`  From: ${data.fromUserName}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Zones: ${data.homeIds ? data.homeIds.length : 0}`);
        console.log('');
      });
    }
    
    // Check notification logs
    console.log('\n📋 RECENT NOTIFICATION LOGS:');
    console.log('═══════════════════════════════════════\n');
    
    const logsSnapshot = await db.collection('notificationLogs')
      .where('userId', '==', userId)
      .limit(10)
      .get();
    
    if (logsSnapshot.empty) {
      console.log('No notification logs found (notifications may not be logged)');
    } else {
      logsSnapshot.forEach(doc => {
        const data = doc.data();
        const timestamp = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString() : 'Unknown';
        console.log(`[${timestamp}]`);
        console.log(`  Type: ${data.type || 'unknown'}`);
        console.log(`  Success: ${data.success ? '✅' : '❌'}`);
        console.log(`  Error: ${data.error || 'none'}`);
        console.log('');
      });
    }
    
    // Diagnosis
    console.log('\n🔍 DIAGNOSIS:');
    console.log('═══════════════════════════════════════\n');
    
    if (!pushToken) {
      console.log('❌ PROBLEM: No push token registered');
      console.log('   User needs to:');
      console.log('   1. Grant notification permissions');
      console.log('   2. Restart the app');
      console.log('   3. Check Settings > Notifications > FriendZone is enabled');
    } else if (userData.notificationsEnabled === false) {
      console.log('❌ PROBLEM: Notifications disabled in app settings');
      console.log('   User needs to enable notifications in Profile > Settings');
    } else {
      console.log('✅ Push token registered');
      console.log('✅ Notifications enabled');
      console.log('');
      console.log('If not receiving notifications, check:');
      console.log('1. iOS Settings > Notifications > FriendZone is enabled');
      console.log('2. Device is not in Do Not Disturb mode');
      console.log('3. Friend request was sent recently (check timestamps above)');
    }
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkNotifications();
