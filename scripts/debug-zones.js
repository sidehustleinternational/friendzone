const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function debugZones() {
  try {
    console.log('\n🔍 DEBUGGING ZONE DATA\n');
    
    // Get your user data (assuming you're the first user or we'll search by phone)
    const usersSnapshot = await db.collection('users').get();
    
    console.log(`📱 Found ${usersSnapshot.size} users\n`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      console.log(`👤 User: ${userData.name || 'Unknown'} (${userData.phoneNumber})`);
      console.log(`   ID: ${userDoc.id}`);
      console.log(`   Current Zone ID: ${userData.currentHomeId || 'none'}`);
      console.log(`   Is At Home: ${userData.isAtHome || false}`);
      console.log(`   Location: ${userData.latitude?.toFixed(4)}, ${userData.longitude?.toFixed(4)}`);
      console.log('');
    }
    
    // Get all homes/zones
    const homesSnapshot = await db.collection('homes').get();
    
    console.log(`\n🏠 Found ${homesSnapshot.size} zones:\n`);
    
    for (const homeDoc of homesSnapshot.docs) {
      const homeData = homeDoc.data();
      console.log(`📍 Zone: ${homeData.name}`);
      console.log(`   ID: ${homeDoc.id}`);
      console.log(`   Location: ${homeData.location?.latitude?.toFixed(4) || homeData.latitude?.toFixed(4)}, ${homeData.location?.longitude?.toFixed(4) || homeData.longitude?.toFixed(4)}`);
      console.log(`   Radius: ${homeData.radius} miles`);
      console.log(`   Members: ${homeData.members?.length || 0}`);
      console.log(`   Created: ${homeData.createdAt?.toDate?.() || 'unknown'}`);
      console.log('');
    }
    
    // Check if zone ID 61JbJ4PP8lRizfOWKUsL exists
    console.log('\n🔎 Checking specific zone ID: 61JbJ4PP8lRizfOWKUsL\n');
    const specificZone = await db.collection('homes').doc('61JbJ4PP8lRizfOWKUsL').get();
    if (specificZone.exists) {
      const data = specificZone.data();
      console.log(`✅ Zone found: ${data.name}`);
      console.log(`   Full data:`, JSON.stringify(data, null, 2));
    } else {
      console.log('❌ Zone not found!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

debugZones();
