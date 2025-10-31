const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
const crypto = require('crypto');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Decryption function (matches locationEncryption.ts)
const ENCRYPTION_KEY = 'friendzone-location-encryption-key-2024';

function simpleDecrypt(encryptedText, key) {
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = Buffer.from(parts[1], 'hex');
    
    const keyHash = crypto.createHash('sha256').update(key).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
    
    let decrypted = decipher.update(encryptedData);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

function decryptLocation(encryptedLocation) {
  if (!encryptedLocation) return null;
  
  const decrypted = simpleDecrypt(encryptedLocation, ENCRYPTION_KEY);
  if (!decrypted) return null;
  
  const [latStr, lonStr] = decrypted.split(',');
  return {
    latitude: parseFloat(latStr),
    longitude: parseFloat(lonStr)
  };
}

async function checkUserLocation() {
  try {
    const searchTerm = process.argv[2];
    
    if (!searchTerm) {
      console.log('Usage: node check-brad-location.js "Name" or +1XXXXXXXXXX');
      console.log('Example: node check-brad-location.js "Brad"');
      console.log('Example: node check-brad-location.js +16175551234');
      process.exit(1);
    }
    
    console.log(`\n🔍 Searching for: ${searchTerm}\n`);
    
    // Find user
    let userId = null;
    let userName = null;
    
    if (searchTerm.startsWith('+')) {
      // Search by phone
      const usersSnapshot = await db.collection('users')
        .where('phoneNumber', '==', searchTerm)
        .get();
      
      if (!usersSnapshot.empty) {
        userId = usersSnapshot.docs[0].id;
        userName = usersSnapshot.docs[0].data().name;
      }
    } else {
      // Search by name
      const usersSnapshot = await db.collection('users').get();
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.name && data.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          userId = doc.id;
          userName = data.name;
        }
      });
    }
    
    if (!userId) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    console.log(`✅ Found: ${userName} (${userId})\n`)
    
    console.log(`\n👤 ${userName.toUpperCase()}\'S CURRENT USER DOCUMENT:`);
    console.log('═══════════════════════════════════════\n');
    
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    console.log(`Name: ${userData.name}`);
    console.log(`Phone: ${userData.phoneNumber}`);
    console.log(`isAtHome: ${userData.isAtHome}`);
    console.log(`currentHomeIds: ${userData.currentHomeIds?.join(', ') || 'NONE ❌'}`);
    console.log(`lastSeen: ${userData.lastSeen ? new Date(userData.lastSeen).toLocaleString() : 'NONE'}`);
    console.log(`\nlastLocation:`);
    if (userData.lastLocation) {
      // Try to decrypt coordinates if they're encrypted
      let coords = null;
      if (userData.lastLocation.encryptedCoordinates) {
        coords = decryptLocation(userData.lastLocation.encryptedCoordinates);
      } else if (userData.lastLocation.latitude) {
        // Old format (unencrypted)
        coords = {
          latitude: userData.lastLocation.latitude,
          longitude: userData.lastLocation.longitude
        };
      }
      
      console.log(`  latitude: ${coords?.latitude || 'UNDEFINED ❌'}`);
      console.log(`  longitude: ${coords?.longitude || 'UNDEFINED ❌'}`);
      console.log(`  timestamp: ${userData.lastLocation.timestamp ? new Date(userData.lastLocation.timestamp).toLocaleString() : 'NONE'}`);
      console.log(`  accuracy: ${userData.lastLocation.accuracy || 'NONE'}`);
      console.log(`  address: ${userData.lastLocation.address || 'NONE'}`);
      
      // Store decrypted coords for distance calculations
      if (coords) {
        userData.lastLocation.latitude = coords.latitude;
        userData.lastLocation.longitude = coords.longitude;
      }
    } else {
      console.log(`  ❌ UNDEFINED - No location data at all!`);
    }
    
    // Get user's zones
    console.log(`\n\n🏠 ${userName.toUpperCase()}\'S ZONES:`);
    console.log('═══════════════════════════════════════\n');
    
    const zonesSnapshot = await db.collection('homes')
      .where('createdBy', '==', userId)
      .get();
    
    if (zonesSnapshot.empty) {
      console.log('No zones owned');
    } else {
      for (const doc of zonesSnapshot.docs) {
        const zone = doc.data();
        console.log(`📍 ${zone.name} (${doc.id})`);
        console.log(`   Location: ${zone.location.address}`);
        console.log(`   Coordinates: ${zone.location.latitude}, ${zone.location.longitude}`);
        console.log(`   Radius: ${zone.radius} miles`);
        console.log(`   Members: ${zone.members?.length || 0}`);
        
        // Calculate distance if we have Brad's location
        if (userData.lastLocation?.latitude && userData.lastLocation?.longitude) {
          const distance = calculateDistance(
            userData.lastLocation.latitude,
            userData.lastLocation.longitude,
            zone.location.latitude,
            zone.location.longitude
          );
          const distanceMiles = (distance / 1609.34).toFixed(2);
          const isInside = distance <= (zone.radius * 1609.34);
          console.log(`   Distance from ${userName}: ${distance.toFixed(0)}m (${distanceMiles} miles) ${isInside ? '✅ INSIDE' : '❌ OUTSIDE'}`);
        } else {
          console.log(`   Distance from ${userName}: ❌ Cannot calculate (no location data)`);
        }
        console.log('');
      }
    }
    
    // Check recent debug logs (without index)
    console.log('\n📋 RECENT DEBUG LOGS (last 20, unordered):');
    console.log('═══════════════════════════════════════\n');
    
    const logsSnapshot = await db.collection('debugLogs')
      .where('userId', '==', userId)
      .limit(20)
      .get();
    
    if (logsSnapshot.empty) {
      console.log('❌ No debug logs found');
      console.log('\n⚠️  DIAGNOSIS: Location service is NOT logging!');
      console.log('   This means either:');
      console.log(`   1. ${userName}'s app is not running the location service`);
      console.log(`   2. ${userName} is on an old app version without debug logging`);
      console.log('   3. Location service is crashing before it can log');
    } else {
      const logs = logsSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })).sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(a.timestamp);
        const timeB = b.timestamp?.toDate?.() || new Date(b.timestamp);
        return timeB - timeA;
      });
      
      logs.forEach(log => {
        const timestamp = log.timestamp?.toDate?.() || new Date(log.timestamp);
        const timeStr = timestamp.toLocaleString();
        
        console.log(`[${timeStr}] ${log.event}`);
        if (log.data) {
          Object.keys(log.data).forEach(key => {
            console.log(`  ${key}: ${JSON.stringify(log.data[key])}`);
          });
        }
        console.log('');
      });
    }
    
    // DIAGNOSIS
    console.log('\n\n🔍 DIAGNOSIS:');
    console.log('═══════════════════════════════════════\n');
    
    if (!userData.lastLocation || !userData.lastLocation.latitude) {
      console.log('❌ PROBLEM: No valid GPS coordinates');
      console.log(`   ${userName}'s location service is not getting GPS data`);
      console.log('   Possible causes:');
      console.log('   1. Location permissions issue (even though set to "Always")');
      console.log('   2. GPS hardware issue on device');
      console.log('   3. Location service crashing before GPS lock');
      console.log('   4. App not requesting location properly');
    } else if (!userData.currentHomeIds || userData.currentHomeIds.length === 0) {
      console.log('❌ PROBLEM: Has GPS but no currentHomeIds');
      console.log('   Location service is running but zone detection failing');
      console.log('   Possible causes:');
      console.log('   1. Zone detection logic bug');
      console.log('   2. Hysteresis buffer preventing detection');
      console.log('   3. currentHomeIds field not being written to Firestore');
    } else {
      console.log('✅ Everything looks normal!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

checkUserLocation().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
