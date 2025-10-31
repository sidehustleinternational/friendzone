const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function findAllBroadcasts() {
  console.log('\n🔍 Searching for ALL broadcasts in database...\n');
  
  try {
    // Get all broadcasts
    const broadcastsSnapshot = await db.collection('broadcasts').get();
    
    if (broadcastsSnapshot.empty) {
      console.log('❌ No broadcasts found in database');
      return;
    }
    
    console.log(`✅ Found ${broadcastsSnapshot.size} broadcast(s):\n`);
    
    for (const doc of broadcastsSnapshot.docs) {
      const data = doc.data();
      
      // Get user name
      let userName = 'Unknown';
      if (data.userId) {
        const userDoc = await db.collection('users').doc(data.userId).get();
        if (userDoc.exists) {
          userName = userDoc.data().name;
        }
      }
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📄 Broadcast ID: ${doc.id}`);
      console.log(`   From: ${userName} (${data.userId})`);
      console.log(`   Message: ${data.message || 'N/A'}`);
      console.log(`   Created: ${data.createdAt ? new Date(data.createdAt).toLocaleString() : 'N/A'}`);
      console.log(`   Expires: ${data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'N/A'}`);
      console.log(`   Is Expired: ${data.expiresAt && data.expiresAt < Date.now() ? 'YES' : 'NO'}`);
      
      // Check if this is visible to Jamie
      if (data.visibleTo) {
        console.log(`   Visible To: ${JSON.stringify(data.visibleTo)}`);
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findAllBroadcasts().then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
