const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkLocations(userName) {
  console.log(`\n🔍 Checking location data for "${userName}"...\n`);
  
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
    
    console.log(`✅ Found ${userSnapshot.size} user(s) matching "${userName}":\n`);
    
    for (const userDoc of userSnapshot.docs) {
      const userData = userDoc.data();
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`👤 USER: ${userData.name}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`User ID: ${userDoc.id}`);
      console.log(`Phone: ${userData.phoneNumber}`);
      console.log(`Email: ${userData.email}`);
      
      console.log(`\n📍 LOCATION STATUS:`);
      console.log(`isAtHome: ${userData.isAtHome}`);
      console.log(`currentHomeId (OLD): ${userData.currentHomeId || 'none'}`);
      console.log(`currentHomeIds (NEW): ${JSON.stringify(userData.currentHomeIds || [])}`);
      console.log(`lastSeen: ${userData.lastSeen ? new Date(userData.lastSeen).toLocaleString() : 'N/A'}`);
      
      if (userData.lastKnownLocation) {
        console.log(`\n🗺️  LAST KNOWN LOCATION:`);
        console.log(`Latitude: ${userData.lastKnownLocation.latitude}`);
        console.log(`Longitude: ${userData.lastKnownLocation.longitude}`);
        console.log(`Timestamp: ${new Date(userData.lastKnownLocation.timestamp).toLocaleString()}`);
        console.log(`Accuracy: ${userData.lastKnownLocation.accuracy || 'N/A'}m`);
      }
      
      // Get user's zones
      console.log(`\n🏠 USER'S ZONES:`);
      const homesSnapshot = await db.collection('homes')
        .where('userId', '==', userDoc.id)
        .get();
      
      if (homesSnapshot.empty) {
        console.log('No zones owned by this user');
      } else {
        for (const homeDoc of homesSnapshot.docs) {
          const homeData = homeDoc.data();
          console.log(`\n  📍 ${homeData.name} (${homeDoc.id})`);
          console.log(`     Address: ${homeData.location?.address}`);
          console.log(`     Coords: ${homeData.location?.latitude}, ${homeData.location?.longitude}`);
          console.log(`     Radius: ${homeData.radius} miles`);
          
          // Calculate distance if we have user's location
          if (userData.lastKnownLocation && homeData.location) {
            const distance = calculateDistance(
              userData.lastKnownLocation.latitude,
              userData.lastKnownLocation.longitude,
              homeData.location.latitude,
              homeData.location.longitude
            );
            const distanceMiles = distance * 0.621371;
            console.log(`     Distance from user: ${distance.toFixed(0)}m (${distanceMiles.toFixed(2)} miles)`);
            console.log(`     Within radius: ${distanceMiles <= homeData.radius ? '✅ YES' : '❌ NO'}`);
          }
        }
      }
      
      // Check friend records where this user is the friend
      console.log(`\n👥 FRIEND RECORDS (where ${userData.name} is the friend):`);
      const friendRecordsSnapshot = await db.collection('friends')
        .where('friendUserId', '==', userDoc.id)
        .get();
      
      if (friendRecordsSnapshot.empty) {
        console.log('No friend records found');
      } else {
        for (const friendDoc of friendRecordsSnapshot.docs) {
          const friendData = friendDoc.data();
          
          // Get the other user's name
          const otherUserDoc = await db.collection('users').doc(friendData.userId).get();
          const otherUserName = otherUserDoc.exists ? otherUserDoc.data().name : 'Unknown';
          
          console.log(`\n  Friend with: ${otherUserName}`);
          console.log(`  isCurrentlyAtHome: ${friendData.isCurrentlyAtHome}`);
          console.log(`  currentHomeIds: ${JSON.stringify(friendData.currentHomeIds || [])}`);
          console.log(`  lastSeen: ${friendData.lastSeen ? new Date(friendData.lastSeen).toLocaleString() : 'N/A'}`);
          console.log(`  sharedHomes: ${JSON.stringify(friendData.sharedHomes || [])}`);
        }
      }
      
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

// Get name from command line or check multiple users
const userName = process.argv[2];

if (!userName) {
  console.log('Usage: node scripts/check-locations.js "User Name"');
  console.log('Example: node scripts/check-locations.js "Brad"');
  console.log('\nOr check multiple users:');
  console.log('node scripts/check-locations.js "Brad" && node scripts/check-locations.js "Coby"');
  process.exit(1);
}

checkLocations(userName).then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
