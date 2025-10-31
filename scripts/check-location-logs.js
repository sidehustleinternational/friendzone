const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkLocationLogs() {
  try {
    const searchName = process.argv[2];
    
    if (!searchName) {
      console.log('Usage: node check-location-logs.js "Name" or +1XXXXXXXXXX');
      process.exit(1);
    }

    console.log(`\n🔍 Searching for: ${searchName}\n`);
    
    let userId = null;
    
    // Find user
    if (searchName.startsWith('+')) {
      const usersSnapshot = await db.collection('users')
        .where('phoneNumber', '==', searchName)
        .get();
      if (!usersSnapshot.empty) {
        userId = usersSnapshot.docs[0].id;
      }
    } else {
      const usersSnapshot = await db.collection('users').get();
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.name && data.name.toLowerCase().includes(searchName.toLowerCase())) {
          userId = doc.id;
        }
      });
    }
    
    if (!userId) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    console.log(`✅ Found user ID: ${userId}\n`);
    
    // Get debug logs for this user
    console.log('📋 RECENT DEBUG LOGS (last 50):');
    console.log('═══════════════════════════════════════\n');
    
    const logsSnapshot = await db.collection('debugLogs')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();
    
    if (logsSnapshot.empty) {
      console.log('❌ No debug logs found for this user');
    } else {
      logsSnapshot.forEach(doc => {
        const log = doc.data();
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
    
    // Check for location-specific logs
    console.log('\n📍 LOCATION-SPECIFIC LOGS:');
    console.log('═══════════════════════════════════════\n');
    
    const locationLogs = await db.collection('debugLogs')
      .where('userId', '==', userId)
      .where('event', 'in', ['location_check_start', 'gps_reading', 'zone_detected', 'firebase_updated'])
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    
    if (locationLogs.empty) {
      console.log('❌ No location logs found');
      console.log('\n⚠️  This means the location service is NOT running for this user!');
      console.log('   Possible causes:');
      console.log('   1. App is not open');
      console.log('   2. Location permissions denied');
      console.log('   3. Location service crashed');
      console.log('   4. Old app version without location logging');
    } else {
      locationLogs.forEach(doc => {
        const log = doc.data();
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
    
    // Get current user document
    console.log('\n👤 CURRENT USER DOCUMENT:');
    console.log('═══════════════════════════════════════\n');
    
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    console.log(`isAtHome: ${userData.isAtHome}`);
    console.log(`currentHomeIds: ${userData.currentHomeIds?.join(', ') || 'NONE'}`);
    console.log(`lastSeen: ${userData.lastSeen ? new Date(userData.lastSeen).toLocaleString() : 'NONE'}`);
    console.log(`lastLocation:`);
    if (userData.lastLocation) {
      console.log(`  latitude: ${userData.lastLocation.latitude}`);
      console.log(`  longitude: ${userData.lastLocation.longitude}`);
      console.log(`  timestamp: ${userData.lastLocation.timestamp ? new Date(userData.lastLocation.timestamp).toLocaleString() : 'NONE'}`);
      console.log(`  accuracy: ${userData.lastLocation.accuracy || 'NONE'}`);
    } else {
      console.log(`  UNDEFINED - No location data!`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkLocationLogs().then(() => {
  console.log('\n✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
