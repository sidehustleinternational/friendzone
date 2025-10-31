const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function mergeDuplicateZones(keepZoneId, deleteZoneIds) {
  console.log(`\n🔄 Merging zones into ${keepZoneId}...\n`);
  
  try {
    // Get the zone we're keeping
    const keepZoneDoc = await db.collection('homes').doc(keepZoneId).get();
    if (!keepZoneDoc.exists) {
      console.log(`❌ Zone ${keepZoneId} not found`);
      return;
    }
    
    const keepZoneData = keepZoneDoc.data();
    console.log(`✅ Keeping zone: "${keepZoneData.name}" (${keepZoneId})`);
    console.log(`   Address: ${keepZoneData.location?.address}`);
    console.log(`   Current members: ${keepZoneData.members?.length || 0}\n`);
    
    let totalMerged = 0;
    let totalFriendsMoved = 0;
    
    for (const deleteZoneId of deleteZoneIds) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Processing zone: ${deleteZoneId}`);
      
      const deleteZoneDoc = await db.collection('homes').doc(deleteZoneId).get();
      if (!deleteZoneDoc.exists) {
        console.log(`⚠️  Zone ${deleteZoneId} not found, skipping`);
        continue;
      }
      
      const deleteZoneData = deleteZoneDoc.data();
      console.log(`   Name: "${deleteZoneData.name}"`);
      console.log(`   Address: ${deleteZoneData.location?.address}`);
      
      // Merge members
      const deleteMembers = deleteZoneData.members || [];
      const keepMembers = keepZoneData.members || [];
      const mergedMembers = [...new Set([...keepMembers, ...deleteMembers])];
      
      console.log(`   Merging ${deleteMembers.length} member(s)`);
      
      // Update friend records that reference this zone
      const friendsSnapshot = await db.collection('friends')
        .where('sharedHomes', 'array-contains', deleteZoneId)
        .get();
      
      console.log(`   Found ${friendsSnapshot.size} friend connection(s) to update`);
      
      for (const friendDoc of friendsSnapshot.docs) {
        const friendData = friendDoc.data();
        const sharedHomes = friendData.sharedHomes || [];
        const activeHomes = friendData.activeHomes || [];
        const currentHomeIds = friendData.currentHomeIds || [];
        
        // Replace old zone ID with new zone ID
        const updatedSharedHomes = sharedHomes.map(id => id === deleteZoneId ? keepZoneId : id);
        const updatedActiveHomes = activeHomes.map(id => id === deleteZoneId ? keepZoneId : id);
        const updatedCurrentHomeIds = currentHomeIds.map(id => id === deleteZoneId ? keepZoneId : id);
        
        // Remove duplicates
        const uniqueSharedHomes = [...new Set(updatedSharedHomes)];
        const uniqueActiveHomes = [...new Set(updatedActiveHomes)];
        const uniqueCurrentHomeIds = [...new Set(updatedCurrentHomeIds)];
        
        await db.collection('friends').doc(friendDoc.id).update({
          sharedHomes: uniqueSharedHomes,
          activeHomes: uniqueActiveHomes,
          currentHomeIds: uniqueCurrentHomeIds
        });
        
        totalFriendsMoved++;
      }
      
      // Update user records that reference this zone in currentHomeIds
      const usersSnapshot = await db.collection('users').get();
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const currentHomeIds = userData.currentHomeIds || [];
        
        if (currentHomeIds.includes(deleteZoneId)) {
          const updatedHomeIds = currentHomeIds.map(id => id === deleteZoneId ? keepZoneId : id);
          const uniqueHomeIds = [...new Set(updatedHomeIds)];
          
          await db.collection('users').doc(userDoc.id).update({
            currentHomeIds: uniqueHomeIds
          });
          
          console.log(`   Updated user ${userData.name}'s currentHomeIds`);
        }
      }
      
      // Update the kept zone with merged members
      await db.collection('homes').doc(keepZoneId).update({
        members: mergedMembers
      });
      
      // Delete the duplicate zone
      await db.collection('homes').doc(deleteZoneId).delete();
      console.log(`   ✅ Deleted zone ${deleteZoneId}`);
      
      totalMerged++;
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ Merge complete!`);
    console.log(`   Merged ${totalMerged} zone(s) into ${keepZoneId}`);
    console.log(`   Updated ${totalFriendsMoved} friend connection(s)`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get zone IDs from command line
const keepZoneId = process.argv[2];
const deleteZoneIds = process.argv.slice(3);

if (!keepZoneId || deleteZoneIds.length === 0) {
  console.log('Usage: node scripts/merge-duplicate-zones.js <keep-zone-id> <delete-zone-id-1> [delete-zone-id-2] ...');
  console.log('Example: node scripts/merge-duplicate-zones.js 6nWFaDvYXuelrsJtxigp H10qW6TM0tL6thQnjqDq OQEmWkklT8mVAwhexhXA');
  process.exit(1);
}

mergeDuplicateZones(keepZoneId, deleteZoneIds).then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
