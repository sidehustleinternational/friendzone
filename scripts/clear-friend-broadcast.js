const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function clearFriendBroadcast(friendName, yourName) {
  console.log(`\n🔍 Searching for broadcast from "${friendName}" visible to "${yourName}"...\n`);
  
  try {
    // Find your user ID
    const yourUserSnapshot = await db.collection('users')
      .where('name', '>=', yourName)
      .where('name', '<=', yourName + '\uf8ff')
      .get();
    
    if (yourUserSnapshot.empty) {
      console.log(`❌ User "${yourName}" not found`);
      return;
    }
    
    const yourUserId = yourUserSnapshot.docs[0].id;
    console.log(`✅ Found you: ${yourName} (${yourUserId})`);
    
    // Find the friend's user ID
    const friendUserSnapshot = await db.collection('users')
      .where('name', '>=', friendName)
      .where('name', '<=', friendName + '\uf8ff')
      .get();
    
    if (friendUserSnapshot.empty) {
      console.log(`❌ User "${friendName}" not found`);
      return;
    }
    
    const friendUserId = friendUserSnapshot.docs[0].id;
    console.log(`✅ Found friend: ${friendName} (${friendUserId})`);
    
    // Find the friend record
    const friendRecordSnapshot = await db.collection('friends')
      .where('userId', '==', yourUserId)
      .where('friendUserId', '==', friendUserId)
      .get();
    
    if (friendRecordSnapshot.empty) {
      console.log(`\n❌ No friend record found between ${yourName} and ${friendName}`);
      return;
    }
    
    console.log(`\n📄 Found ${friendRecordSnapshot.size} friend record(s):\n`);
    
    for (const doc of friendRecordSnapshot.docs) {
      const data = doc.data();
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Friend Record ID: ${doc.id}`);
      console.log(`Broadcast Location: ${data.broadcastLocation || 'None'}`);
      console.log(`Broadcast Message: ${data.broadcastMessage || 'None'}`);
      console.log(`Broadcast Timestamp: ${data.broadcastTimestamp || 'None'}`);
      
      if (data.broadcastLocation || data.broadcastMessage || data.broadcastTimestamp) {
        // Clear the broadcast fields
        await db.collection('friends').doc(doc.id).update({
          broadcastLocation: admin.firestore.FieldValue.delete(),
          broadcastMessage: admin.firestore.FieldValue.delete(),
          broadcastTimestamp: admin.firestore.FieldValue.delete()
        });
        
        console.log(`✅ CLEARED broadcast data`);
      } else {
        console.log(`⚠️  No broadcast data to clear`);
      }
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get names from command line
const friendName = process.argv[2];
const yourName = process.argv[3];

if (!friendName || !yourName) {
  console.log('Usage: node scripts/clear-friend-broadcast.js "Friend Name" "Your Name"');
  console.log('Example: node scripts/clear-friend-broadcast.js "Tim Collins" "Jamie"');
  process.exit(1);
}

clearFriendBroadcast(friendName, yourName).then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
