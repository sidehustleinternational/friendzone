const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function findAllJamies() {
  try {
    console.log('\n🔍 Finding all Jamie accounts...\n');
    
    const usersSnapshot = await db.collection('users').get();
    
    const jamies = [];
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.name && data.name.toLowerCase().includes('jamie')) {
        jamies.push({
          id: doc.id,
          name: data.name,
          phone: data.phoneNumber,
          lastSeen: data.lastSeen ? (data.lastSeen.toDate ? new Date(data.lastSeen.toDate()).toLocaleString() : data.lastSeen) : 'Never',
          isAtHome: data.isAtHome,
          currentHomeIds: data.currentHomeIds || 'NONE',
          hasLocation: !!(data.lastLocation && data.lastLocation.latitude)
        });
      }
    });
    
    console.log(`Found ${jamies.length} Jamie accounts:\n`);
    
    jamies.forEach((jamie, index) => {
      console.log(`${index + 1}. ${jamie.name}`);
      console.log(`   ID: ${jamie.id}`);
      console.log(`   Phone: ${jamie.phone}`);
      console.log(`   Last Seen: ${jamie.lastSeen}`);
      console.log(`   At Home: ${jamie.isAtHome}`);
      console.log(`   Current Zones: ${jamie.currentHomeIds}`);
      console.log(`   Has Location: ${jamie.hasLocation ? '✅' : '❌'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findAllJamies();
