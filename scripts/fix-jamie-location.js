const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Calculate distance between two points in meters
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

async function fixJamieLocation() {
  try {
    // Jamie's phone number
    const jamiePhone = '+17812494070';
    
    // Get Jamie's user document
    const usersSnapshot = await db.collection('users')
      .where('phoneNumber', '==', jamiePhone)
      .get();
    
    if (usersSnapshot.empty) {
      console.log('❌ Jamie not found');
      return;
    }
    
    const jamieDoc = usersSnapshot.docs[0];
    const jamieId = jamieDoc.id;
    console.log(`\n👤 Found Jamie: ${jamieId}\n`);
    
    // Jamie's current GPS location (from debug button)
    const currentLat = 42.3501;
    const currentLon = -71.0744;
    
    console.log(`📍 Jamie's GPS: ${currentLat}, ${currentLon}\n`);
    
    // Get all Jamie's zones
    const homesSnapshot = await db.collection('homes')
      .where('members', 'array-contains', jamieId)
      .get();
    
    console.log(`🏠 Checking ${homesSnapshot.size} zones:\n`);
    
    let correctZone = null;
    let minDistance = Infinity;
    
    for (const homeDoc of homesSnapshot.docs) {
      const homeData = homeDoc.data();
      const homeLat = homeData.location?.latitude || homeData.latitude;
      const homeLon = homeData.location?.longitude || homeData.longitude;
      const radiusMiles = homeData.radius || 0.1;
      const radiusMeters = radiusMiles * 1609.34;
      
      const distance = calculateDistance(currentLat, currentLon, homeLat, homeLon);
      const distanceMiles = (distance / 1609.34).toFixed(2);
      const isInside = distance <= radiusMeters;
      
      console.log(`   ${homeData.name}:`);
      console.log(`      Distance: ${distance.toFixed(0)}m (${distanceMiles} miles)`);
      console.log(`      Radius: ${radiusMeters.toFixed(0)}m (${radiusMiles} miles)`);
      console.log(`      Inside: ${isInside ? '✅ YES' : '❌ NO'}`);
      console.log('');
      
      if (isInside && distance < minDistance) {
        minDistance = distance;
        correctZone = {
          id: homeDoc.id,
          name: homeData.name,
          distance
        };
      }
    }
    
    if (correctZone) {
      console.log(`\n✅ Jamie should be in: ${correctZone.name} (${correctZone.id})\n`);
      console.log('📝 Updating Firebase...\n');
      
      await db.collection('users').doc(jamieId).update({
        currentHomeId: correctZone.id,
        isAtHome: true,
        lastLocation: {
          latitude: currentLat,
          longitude: currentLon,
          timestamp: Date.now(),
          accuracy: 26
        },
        lastSeen: Date.now()
      });
      
      console.log('✅ Firebase updated successfully!\n');
    } else {
      console.log(`\n❌ Jamie is not in any zone\n`);
      console.log('📝 Updating Firebase to show not at home...\n');
      
      await db.collection('users').doc(jamieId).update({
        currentHomeId: null,
        isAtHome: false,
        lastLocation: {
          latitude: currentLat,
          longitude: currentLon,
          timestamp: Date.now(),
          accuracy: 26
        },
        lastSeen: Date.now()
      });
      
      console.log('✅ Firebase updated successfully!\n');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

fixJamieLocation();
