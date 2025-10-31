const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function deleteUserAccount() {
  try {
    const phoneNumber = process.argv[2];
    
    if (!phoneNumber) {
      console.log('Usage: node delete-user-account.js "+16176990686"');
      console.log('Note: Phone number must be in E.164 format (+1XXXXXXXXXX)');
      process.exit(1);
    }
    
    console.log(`\n🗑️  DELETING USER ACCOUNT: ${phoneNumber}\n`);
    console.log('⚠️  WARNING: This will permanently delete:');
    console.log('   - User document');
    console.log('   - Firebase Auth account');
    console.log('   - All friend requests (sent and received)');
    console.log('   - User from all zone memberships');
    console.log('   - All friendships');
    console.log('   - Debug logs');
    console.log('   - Zone nicknames');
    console.log('');
    
    // Find user by phone number
    const usersSnapshot = await db.collection('users')
      .where('phoneNumber', '==', phoneNumber)
      .get();
    
    if (usersSnapshot.empty) {
      console.log('❌ User not found with phone number:', phoneNumber);
      process.exit(1);
    }
    
    const userDoc = usersSnapshot.docs[0];
    const userId = userDoc.id;
    const userData = userDoc.data();
    
    console.log(`✅ Found user: ${userData.name} (${userId})\n`);
    console.log('Starting deletion process...\n');
    
    // 1. Delete friend requests where user is sender
    console.log('1️⃣  Deleting friend requests sent by user...');
    const sentRequestsSnapshot = await db.collection('friendRequests')
      .where('fromUserId', '==', userId)
      .get();
    
    let deletedSentRequests = 0;
    for (const doc of sentRequestsSnapshot.docs) {
      await doc.ref.delete();
      deletedSentRequests++;
    }
    console.log(`   ✅ Deleted ${deletedSentRequests} sent friend requests`);
    
    // 2. Delete friend requests where user is recipient
    console.log('2️⃣  Deleting friend requests received by user...');
    const receivedRequestsSnapshot = await db.collection('friendRequests')
      .where('toUserId', '==', userId)
      .get();
    
    let deletedReceivedRequests = 0;
    for (const doc of receivedRequestsSnapshot.docs) {
      await doc.ref.delete();
      deletedReceivedRequests++;
    }
    console.log(`   ✅ Deleted ${deletedReceivedRequests} received friend requests`);
    
    // 3. Remove user from all friendships
    console.log('3️⃣  Removing user from friendships...');
    const friendshipsSnapshot = await db.collection('friendships')
      .where('users', 'array-contains', userId)
      .get();
    
    let deletedFriendships = 0;
    for (const doc of friendshipsSnapshot.docs) {
      await doc.ref.delete();
      deletedFriendships++;
    }
    console.log(`   ✅ Deleted ${deletedFriendships} friendships`);
    
    // 4. Remove user from all zone memberships
    console.log('4️⃣  Removing user from zone memberships...');
    const homesSnapshot = await db.collection('homes')
      .where('members', 'array-contains', userId)
      .get();
    
    let updatedZones = 0;
    let deletedZones = 0;
    for (const doc of homesSnapshot.docs) {
      const homeData = doc.data();
      
      // If user is the only member or creator, delete the zone
      if (homeData.members.length === 1 || homeData.createdBy === userId) {
        await doc.ref.delete();
        deletedZones++;
      } else {
        // Remove user from members array
        await doc.ref.update({
          members: admin.firestore.FieldValue.arrayRemove(userId)
        });
        updatedZones++;
      }
    }
    console.log(`   ✅ Removed from ${updatedZones} zones, deleted ${deletedZones} zones`);
    
    // 5. Delete debug logs
    console.log('5️⃣  Deleting debug logs...');
    const logsSnapshot = await db.collection('users').doc(userId)
      .collection('debugLogs')
      .get();
    
    let deletedLogs = 0;
    for (const doc of logsSnapshot.docs) {
      await doc.ref.delete();
      deletedLogs++;
    }
    console.log(`   ✅ Deleted ${deletedLogs} debug logs`);
    
    // 6. Delete zone nicknames
    console.log('6️⃣  Deleting zone nicknames...');
    const nicknamesSnapshot = await db.collection('users').doc(userId)
      .collection('zoneNicknames')
      .get();
    
    let deletedNicknames = 0;
    for (const doc of nicknamesSnapshot.docs) {
      await doc.ref.delete();
      deletedNicknames++;
    }
    console.log(`   ✅ Deleted ${deletedNicknames} zone nicknames`);
    
    // 7. Delete notification logs (if they exist)
    console.log('7️⃣  Deleting notification logs...');
    const notificationLogsSnapshot = await db.collection('notificationLogs')
      .where('userId', '==', userId)
      .get();
    
    let deletedNotificationLogs = 0;
    for (const doc of notificationLogsSnapshot.docs) {
      await doc.ref.delete();
      deletedNotificationLogs++;
    }
    console.log(`   ✅ Deleted ${deletedNotificationLogs} notification logs`);
    
    // 8. Delete user document
    console.log('8️⃣  Deleting user document...');
    await db.collection('users').doc(userId).delete();
    console.log('   ✅ User document deleted');
    
    // 9. Delete Firebase Auth account
    console.log('9️⃣  Deleting Firebase Auth account...');
    try {
      await auth.deleteUser(userId);
      console.log('   ✅ Firebase Auth account deleted');
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log('   ⚠️  Firebase Auth account not found (may have been deleted already)');
      } else {
        throw error;
      }
    }
    
    console.log('\n✅ ACCOUNT DELETION COMPLETE!\n');
    console.log('Summary:');
    console.log(`  - User: ${userData.name}`);
    console.log(`  - Phone: ${phoneNumber}`);
    console.log(`  - Friend requests deleted: ${deletedSentRequests + deletedReceivedRequests}`);
    console.log(`  - Friendships deleted: ${deletedFriendships}`);
    console.log(`  - Zones updated: ${updatedZones}`);
    console.log(`  - Zones deleted: ${deletedZones}`);
    console.log(`  - Debug logs deleted: ${deletedLogs}`);
    console.log(`  - Zone nicknames deleted: ${deletedNicknames}`);
    console.log(`  - Notification logs deleted: ${deletedNotificationLogs}`);
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteUserAccount();
