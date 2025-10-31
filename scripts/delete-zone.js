const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function deleteZone(userName, zoneIdOrName) {
  console.log(`\n🔍 Searching for zone "${zoneIdOrName}" for user "${userName}"...\n`);
  
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
    
    // Search for the zone by ID or name
    let zoneDoc = null;
    
    // First try by exact ID
    const zoneByIdDoc = await db.collection('homes').doc(zoneIdOrName).get();
    if (zoneByIdDoc.exists && zoneByIdDoc.data().userId === userId) {
      zoneDoc = zoneByIdDoc;
    } else {
      // Try by name
      const zonesByNameSnapshot = await db.collection('homes')
        .where('userId', '==', userId)
        .get();
      
      for (const doc of zonesByNameSnapshot.docs) {
        const data = doc.data();
        if (doc.id === zoneIdOrName || data.name === zoneIdOrName || doc.id.startsWith(zoneIdOrName)) {
          zoneDoc = doc;
          break;
        }
      }
    }
    
    if (!zoneDoc) {
      console.log(`\n❌ Zone "${zoneIdOrName}" not found for ${userName}`);
      console.log(`\nAvailable zones for ${userName}:`);
      
      const allZonesSnapshot = await db.collection('homes')
        .where('userId', '==', userId)
        .get();
      
      if (allZonesSnapshot.empty) {
        console.log('  No zones found');
      } else {
        for (const doc of allZonesSnapshot.docs) {
          const data = doc.data();
          console.log(`  • ${data.name} (${doc.id})`);
        }
      }
      return;
    }
    
    const zoneData = zoneDoc.data();
    const zoneId = zoneDoc.id;
    
    console.log(`\n📍 Found zone:`);
    console.log(`   Name: ${zoneData.name}`);
    console.log(`   ID: ${zoneId}`);
    console.log(`   Address: ${zoneData.location?.address || 'N/A'}`);
    console.log(`   Radius: ${zoneData.radius} miles`);
    
    // Find all friends that have this zone in their sharedHomes
    const friendsWithZone = await db.collection('friends')
      .where('sharedHomes', 'array-contains', zoneId)
      .get();
    
    console.log(`\n👥 Found ${friendsWithZone.size} friend(s) sharing this zone`);
    
    // Remove zone from friend records
    for (const friendDoc of friendsWithZone.docs) {
      const friendData = friendDoc.data();
      const updatedSharedHomes = (friendData.sharedHomes || []).filter(id => id !== zoneId);
      const updatedActiveHomes = (friendData.activeHomes || []).filter(id => id !== zoneId);
      
      await db.collection('friends').doc(friendDoc.id).update({
        sharedHomes: updatedSharedHomes,
        activeHomes: updatedActiveHomes
      });
      
      console.log(`   ✅ Removed zone from friend record ${friendDoc.id}`);
    }
    
    // Delete the zone
    await db.collection('homes').doc(zoneId).delete();
    console.log(`\n✅ Zone "${zoneData.name}" (${zoneId}) deleted successfully!`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get parameters from command line
const userName = process.argv[2];
const zoneIdOrName = process.argv[3];

if (!userName || !zoneIdOrName) {
  console.log('Usage: node scripts/delete-zone.js "User Name" "Zone ID or Name"');
  console.log('Example: node scripts/delete-zone.js "Coby Goldstein" "Vh8aF8ug"');
  process.exit(1);
}

deleteZone(userName, zoneIdOrName).then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
