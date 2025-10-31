const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function debugUser(searchName) {
  console.log(`\n🔍 Searching for user: ${searchName}\n`);
  
  try {
    // Search for user by name
    const usersSnapshot = await db.collection('users')
      .where('name', '>=', searchName)
      .where('name', '<=', searchName + '\uf8ff')
      .get();
    
    if (usersSnapshot.empty) {
      console.log('❌ No user found with that name');
      return;
    }
    
    console.log(`✅ Found ${usersSnapshot.size} user(s):\n`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('👤 USER DATA:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`User ID: ${userDoc.id}`);
      console.log(`Name: ${userData.name}`);
      console.log(`Phone: ${userData.phoneNumber}`);
      console.log(`Email: ${userData.email}`);
      console.log(`\n📍 LOCATION DATA:`);
      console.log(`isAtHome: ${userData.isAtHome}`);
      console.log(`currentHomeId: ${userData.currentHomeId}`);
      console.log(`currentHomeIds: ${JSON.stringify(userData.currentHomeIds)}`);
      console.log(`lastSeen: ${userData.lastSeen ? new Date(userData.lastSeen).toLocaleString() : 'N/A'}`);
      
      if (userData.lastKnownLocation) {
        console.log(`\n🗺️  LAST KNOWN LOCATION:`);
        console.log(`Latitude: ${userData.lastKnownLocation.latitude}`);
        console.log(`Longitude: ${userData.lastKnownLocation.longitude}`);
        console.log(`Timestamp: ${new Date(userData.lastKnownLocation.timestamp).toLocaleString()}`);
      }
      
      // Get user's homes
      console.log(`\n🏠 USER'S ZONES:`);
      const homesSnapshot = await db.collection('homes')
        .where('userId', '==', userDoc.id)
        .get();
      
      if (homesSnapshot.empty) {
        console.log('No zones found');
      } else {
        for (const homeDoc of homesSnapshot.docs) {
          const homeData = homeDoc.data();
          console.log(`  • ${homeData.name} (${homeDoc.id})`);
          console.log(`    Address: ${homeData.location?.address}`);
          console.log(`    Radius: ${homeData.radius} miles`);
        }
      }
      
      // Get friendships where this user is the friend
      console.log(`\n👥 FRIENDSHIPS (as friend):`);
      const friendshipsSnapshot = await db.collection('friends')
        .where('friendUserId', '==', userDoc.id)
        .get();
      
      if (friendshipsSnapshot.empty) {
        console.log('No friendships found');
      } else {
        for (const friendDoc of friendshipsSnapshot.docs) {
          const friendData = friendDoc.data();
          
          // Get the other user's name
          const otherUserDoc = await db.collection('users').doc(friendData.userId).get();
          const otherUserName = otherUserDoc.exists ? otherUserDoc.data().name : 'Unknown';
          
          console.log(`\n  Friend with: ${otherUserName} (${friendData.userId})`);
          console.log(`  Status: ${friendData.status}`);
          console.log(`  Shared Zones: ${JSON.stringify(friendData.sharedHomes)}`);
          console.log(`  Active Zones: ${JSON.stringify(friendData.activeHomes)}`);
          console.log(`  isCurrentlyAtHome: ${friendData.isCurrentlyAtHome}`);
          console.log(`  currentHomeIds: ${JSON.stringify(friendData.currentHomeIds)}`);
          console.log(`  lastSeen: ${friendData.lastSeen ? new Date(friendData.lastSeen).toLocaleString() : 'N/A'}`);
        }
      }
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get name from command line argument
const searchName = process.argv[2];

if (!searchName) {
  console.log('Usage: node scripts/debug-user.js "User Name"');
  console.log('Example: node scripts/debug-user.js "Tim Collins"');
  process.exit(1);
}

debugUser(searchName).then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
