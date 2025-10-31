const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function migrateCurrentHomeId() {
  console.log('\n🔄 Migrating currentHomeId to currentHomeIds...\n');
  
  try {
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      
      // Check if user has old currentHomeId but empty/missing currentHomeIds
      if (userData.currentHomeId && (!userData.currentHomeIds || userData.currentHomeIds.length === 0)) {
        console.log(`📝 Migrating ${userData.name} (${userDoc.id})`);
        console.log(`   Old: currentHomeId = ${userData.currentHomeId}`);
        console.log(`   New: currentHomeIds = [${userData.currentHomeId}]`);
        
        await db.collection('users').doc(userDoc.id).update({
          currentHomeIds: [userData.currentHomeId]
        });
        
        migratedCount++;
      } else {
        skippedCount++;
      }
    }
    
    console.log(`\n✅ Migration complete!`);
    console.log(`   Migrated: ${migratedCount} users`);
    console.log(`   Skipped: ${skippedCount} users`);
    
    // Now update friend records
    console.log(`\n🔄 Updating friend records...\n`);
    
    const friendsSnapshot = await db.collection('friends').get();
    let friendsMigrated = 0;
    
    for (const friendDoc of friendsSnapshot.docs) {
      const friendData = friendDoc.data();
      
      // Get the friend's user data
      if (friendData.friendUserId) {
        const friendUserDoc = await db.collection('users').doc(friendData.friendUserId).get();
        
        if (friendUserDoc.exists) {
          const friendUserData = friendUserDoc.data();
          
          // Update friend record with current location from user record
          await db.collection('friends').doc(friendDoc.id).update({
            isCurrentlyAtHome: friendUserData.isAtHome || false,
            currentHomeIds: friendUserData.currentHomeIds || [],
            lastSeen: friendUserData.lastSeen || Date.now()
          });
          
          friendsMigrated++;
        }
      }
    }
    
    console.log(`✅ Updated ${friendsMigrated} friend records\n`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

migrateCurrentHomeId().then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
