const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanupOrphanedZones() {
  console.log('\n🔍 Searching for orphaned zone references...\n');
  
  try {
    // Get all zones
    const zonesSnapshot = await db.collection('homes').get();
    const validZoneIds = new Set(zonesSnapshot.docs.map(doc => doc.id));
    
    console.log(`✅ Found ${validZoneIds.size} valid zones in database\n`);
    
    // Get all friend records
    const friendsSnapshot = await db.collection('friends').get();
    
    let cleanedCount = 0;
    let totalOrphans = 0;
    
    for (const friendDoc of friendsSnapshot.docs) {
      const friendData = friendDoc.data();
      const sharedHomes = friendData.sharedHomes || [];
      const activeHomes = friendData.activeHomes || [];
      
      // Find orphaned zones
      const orphanedShared = sharedHomes.filter(id => !validZoneIds.has(id));
      const orphanedActive = activeHomes.filter(id => !validZoneIds.has(id));
      
      if (orphanedShared.length > 0 || orphanedActive.length > 0) {
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📄 Friend Record: ${friendDoc.id}`);
        
        if (orphanedShared.length > 0) {
          console.log(`   Orphaned in sharedHomes: ${orphanedShared.join(', ')}`);
          totalOrphans += orphanedShared.length;
        }
        
        if (orphanedActive.length > 0) {
          console.log(`   Orphaned in activeHomes: ${orphanedActive.join(', ')}`);
        }
        
        // Clean up
        const cleanedShared = sharedHomes.filter(id => validZoneIds.has(id));
        const cleanedActive = activeHomes.filter(id => validZoneIds.has(id));
        
        await db.collection('friends').doc(friendDoc.id).update({
          sharedHomes: cleanedShared,
          activeHomes: cleanedActive
        });
        
        console.log(`   ✅ Cleaned up`);
        cleanedCount++;
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Cleaned ${cleanedCount} friend record(s)`);
    console.log(`   Removed ${totalOrphans} orphaned zone reference(s)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

cleanupOrphanedZones().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
