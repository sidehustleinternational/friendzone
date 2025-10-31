const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkFriendRequests() {
  try {
    // Get your user ID from command line or use default
    const phoneNumber = process.argv[2];
    
    if (!phoneNumber) {
      console.log('Usage: node check-friend-requests.js +1XXXXXXXXXX');
      console.log('Example: node check-friend-requests.js +16175551234');
      process.exit(1);
    }

    console.log(`\n🔍 Looking up user with phone: ${phoneNumber}`);
    
    // Find user by phone number
    const usersSnapshot = await db.collection('users')
      .where('phoneNumber', '==', phoneNumber)
      .get();
    
    if (usersSnapshot.empty) {
      console.log('❌ No user found with that phone number');
      process.exit(1);
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    console.log(`✅ Found user: ${userData.name} (${userId})`);
    console.log(`\n📋 Checking friend requests...\n`);
    
    // Get all friend requests
    const requestsSnapshot = await db.collection('friendRequests').get();
    
    let incomingCount = 0;
    let outgoingCount = 0;
    
    requestsSnapshot.forEach(doc => {
      const request = doc.data();
      
      // Incoming requests (to this user)
      if (request.toUserId === userId) {
        incomingCount++;
        console.log(`📥 INCOMING REQUEST #${incomingCount}:`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   From: ${request.fromUserName} (${request.fromUserId})`);
        console.log(`   Status: ${request.status || 'pending'}`);
        console.log(`   Zones: ${request.homeIds?.length || 0}`);
        console.log(`   Created: ${request.createdAt?.toDate?.() || 'unknown'}`);
        console.log('');
      }
      
      // Outgoing requests (from this user)
      if (request.fromUserId === userId) {
        outgoingCount++;
        console.log(`📤 OUTGOING REQUEST #${outgoingCount}:`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   To: ${request.toUserName || request.toPhoneNumber} (${request.toUserId || 'not registered'})`);
        console.log(`   Status: ${request.status || 'pending'}`);
        console.log(`   Zones: ${request.homeIds?.length || 0}`);
        console.log(`   Created: ${request.createdAt?.toDate?.() || 'unknown'}`);
        console.log('');
      }
    });
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Incoming requests: ${incomingCount} (this is what badge should show)`);
    console.log(`   Outgoing requests: ${outgoingCount}`);
    console.log(`   Total requests: ${incomingCount + outgoingCount}`);
    
    if (incomingCount === 0 && outgoingCount === 0) {
      console.log('\n✅ No pending friend requests - badge should be clear!');
    } else if (incomingCount > 0) {
      console.log(`\n⚠️  You have ${incomingCount} incoming request(s) - badge should show ${incomingCount}`);
    } else {
      console.log(`\n✅ No incoming requests - badge should be clear (${outgoingCount} outgoing don't count)`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkFriendRequests().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
