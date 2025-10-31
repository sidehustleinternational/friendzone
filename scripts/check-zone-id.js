const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkZone() {
  try {
    const zoneId = process.argv[2];
    
    if (!zoneId) {
      console.log('Usage: node check-zone-id.js ZONE_ID');
      process.exit(1);
    }
    
    const zoneDoc = await db.collection('homes').doc(zoneId).get();
    
    if (!zoneDoc.exists) {
      console.log('❌ Zone not found');
      process.exit(1);
    }
    
    const zoneData = zoneDoc.data();
    console.log('\n📍 ZONE INFO:\n');
    console.log(`Name: ${zoneData.name}`);
    console.log(`Location: ${zoneData.location.address || 'No address'}`);
    console.log(`Coordinates: ${zoneData.location.latitude}, ${zoneData.location.longitude}`);
    console.log(`Radius: ${zoneData.radius} miles`);
    console.log(`Members: ${zoneData.members.length}`);
    console.log('');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkZone();
