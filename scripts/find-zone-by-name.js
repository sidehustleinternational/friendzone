const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function findZonesByName(zoneName) {
  console.log(`\n🔍 Searching for zones matching "${zoneName}"...\n`);
  
  try {
    const homesSnapshot = await db.collection('homes').get();
    const matchingZones = [];
    
    for (const doc of homesSnapshot.docs) {
      const data = doc.data();
      if (data.name && data.name.toLowerCase().includes(zoneName.toLowerCase())) {
        // Get owner name
        let ownerName = 'Unknown';
        if (data.userId) {
          const userDoc = await db.collection('users').doc(data.userId).get();
          if (userDoc.exists) {
            ownerName = userDoc.data().name;
          }
        }
        
        matchingZones.push({
          id: doc.id,
          name: data.name,
          owner: ownerName,
          ownerId: data.userId,
          address: data.location?.address,
          latitude: data.location?.latitude,
          longitude: data.location?.longitude,
          radius: data.radius,
          createdBy: data.createdBy,
          members: data.members || []
        });
      }
    }
    
    if (matchingZones.length === 0) {
      console.log(`❌ No zones found matching "${zoneName}"\n`);
      return;
    }
    
    console.log(`✅ Found ${matchingZones.length} zone(s):\n`);
    
    for (const zone of matchingZones) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📍 "${zone.name}"`);
      console.log(`   Zone ID: ${zone.id}`);
      console.log(`   Owner: ${zone.owner} (${zone.ownerId})`);
      console.log(`   Address: ${zone.address}`);
      console.log(`   Coords: ${zone.latitude}, ${zone.longitude}`);
      console.log(`   Radius: ${zone.radius} miles`);
      console.log(`   Members: ${zone.members.length}`);
      
      // Find friends sharing this zone
      const friendsSnapshot = await db.collection('friends')
        .where('sharedHomes', 'array-contains', zone.id)
        .get();
      
      console.log(`   Shared with: ${friendsSnapshot.size} friend connection(s)`);
      console.log('');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get zone name from command line
const zoneName = process.argv[2];

if (!zoneName) {
  console.log('Usage: node scripts/find-zone-by-name.js "Zone Name"');
  console.log('Example: node scripts/find-zone-by-name.js "Weston"');
  process.exit(1);
}

findZonesByName(zoneName).then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
