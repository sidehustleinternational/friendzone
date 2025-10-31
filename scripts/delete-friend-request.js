const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function deleteFriendRequest(fromName, toName) {
  console.log(`\n🔍 Searching for friend request from "${fromName}" to "${toName}"...\n`);
  
  try {
    // Find the users
    const fromUserSnapshot = await db.collection('users')
      .where('name', '>=', fromName)
      .where('name', '<=', fromName + '\uf8ff')
      .get();
    
    const toUserSnapshot = await db.collection('users')
      .where('name', '>=', toName)
      .where('name', '<=', toName + '\uf8ff')
      .get();
    
    if (fromUserSnapshot.empty) {
      console.log(`❌ User "${fromName}" not found`);
      return;
    }
    
    if (toUserSnapshot.empty) {
      console.log(`❌ User "${toName}" not found`);
      return;
    }
    
    const fromUserId = fromUserSnapshot.docs[0].id;
    const toUserId = toUserSnapshot.docs[0].id;
    
    console.log(`✅ Found users:`);
    console.log(`   From: ${fromUserSnapshot.docs[0].data().name} (${fromUserId})`);
    console.log(`   To: ${toUserSnapshot.docs[0].data().name} (${toUserId})`);
    
    // Search for friend requests between these users
    const requestsSnapshot = await db.collection('friendRequests')
      .where('fromUserId', '==', fromUserId)
      .where('toUserId', '==', toUserId)
      .get();
    
    if (requestsSnapshot.empty) {
      console.log(`\n❌ No friend requests found from ${fromName} to ${toName}`);
      
      // Also check reverse direction
      const reverseSnapshot = await db.collection('friendRequests')
        .where('fromUserId', '==', toUserId)
        .where('toUserId', '==', fromUserId)
        .get();
      
      if (!reverseSnapshot.empty) {
        console.log(`\n⚠️  Found request in REVERSE direction (from ${toName} to ${fromName}):`);
        for (const doc of reverseSnapshot.docs) {
          const data = doc.data();
          console.log(`\n📄 Request ID: ${doc.id}`);
          console.log(`   Status: ${data.status}`);
          console.log(`   Created: ${new Date(data.createdAt).toLocaleString()}`);
          console.log(`   Home IDs: ${JSON.stringify(data.homeIds)}`);
        }
      }
      return;
    }
    
    console.log(`\n📋 Found ${requestsSnapshot.size} request(s):\n`);
    
    for (const doc of requestsSnapshot.docs) {
      const data = doc.data();
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📄 Request ID: ${doc.id}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Created: ${new Date(data.createdAt).toLocaleString()}`);
      console.log(`   Home IDs: ${JSON.stringify(data.homeIds)}`);
      console.log(`   Phone: ${data.phoneNumber || 'N/A'}`);
      
      // Delete the request
      await db.collection('friendRequests').doc(doc.id).delete();
      console.log(`   ✅ DELETED`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
    
    // Also check for any existing friendship records
    console.log(`\n🔍 Checking for existing friendship records...\n`);
    
    const friendsSnapshot = await db.collection('friends')
      .where('userId', '==', toUserId)
      .where('friendUserId', '==', fromUserId)
      .get();
    
    if (!friendsSnapshot.empty) {
      console.log(`Found ${friendsSnapshot.size} friendship record(s):\n`);
      for (const doc of friendsSnapshot.docs) {
        const data = doc.data();
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📄 Friendship ID: ${doc.id}`);
        console.log(`   Status: ${data.status}`);
        console.log(`   Shared Homes: ${JSON.stringify(data.sharedHomes)}`);
        console.log(`   Active Homes: ${JSON.stringify(data.activeHomes)}`);
        
        // Delete the friendship
        await db.collection('friends').doc(doc.id).delete();
        console.log(`   ✅ DELETED`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
      }
    } else {
      console.log(`No friendship records found.\n`);
    }
    
    console.log(`✅ Cleanup complete! ${fromName} can now send a new friend request to ${toName}.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get names from command line arguments
const fromName = process.argv[2];
const toName = process.argv[3];

if (!fromName || !toName) {
  console.log('Usage: node scripts/delete-friend-request.js "From Name" "To Name"');
  console.log('Example: node scripts/delete-friend-request.js "Jess Dominquez" "Jamie"');
  process.exit(1);
}

deleteFriendRequest(fromName, toName).then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
