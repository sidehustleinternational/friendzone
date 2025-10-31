const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function deleteBroadcast(userName) {
  console.log(`\n🔍 Searching for broadcasts from "${userName}"...\n`);
  
  try {
    // Find the user
    const userSnapshot = await db.collection('users')
      .where('name', '>=', userName)
      .where('name', '<=', userName + '\uf8ff')
      .get();
    
    if (userSnapshot.empty) {
      console.log(`❌ User "${userName}" not found`);
      return;
    }
    
    const userId = userSnapshot.docs[0].id;
    const userData = userSnapshot.docs[0].data();
    console.log(`✅ Found user: ${userData.name} (${userId})`);
    
    // Find all broadcasts from this user
    const broadcastsSnapshot = await db.collection('broadcasts')
      .where('userId', '==', userId)
      .get();
    
    if (broadcastsSnapshot.empty) {
      console.log(`\n❌ No broadcasts found from ${userName}`);
      return;
    }
    
    console.log(`\n📡 Found ${broadcastsSnapshot.size} broadcast(s):\n`);
    
    for (const doc of broadcastsSnapshot.docs) {
      const data = doc.data();
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📄 Broadcast ID: ${doc.id}`);
      console.log(`   Message: ${data.message || 'N/A'}`);
      console.log(`   Created: ${data.createdAt ? new Date(data.createdAt).toLocaleString() : 'N/A'}`);
      console.log(`   Expires: ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'N/A'}`);
      
      // Delete the broadcast
      await db.collection('broadcasts').doc(doc.id).delete();
      console.log(`   ✅ DELETED`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
    
    console.log(`✅ Deleted ${broadcastsSnapshot.size} broadcast(s) from ${userName}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get name from command line argument
const userName = process.argv[2];

if (!userName) {
  console.log('Usage: node scripts/delete-broadcast.js "User Name"');
  console.log('Example: node scripts/delete-broadcast.js "Tim Collins"');
  process.exit(1);
}

deleteBroadcast(userName).then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
