const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function findDuplicates() {
  console.log('\n🔍 Searching for duplicates...\n');
  
  try {
    // Find duplicate users by phone number
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 DUPLICATE USERS BY PHONE NUMBER:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const usersSnapshot = await db.collection('users').get();
    const phoneMap = new Map();
    
    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      if (data.phoneNumber) {
        if (!phoneMap.has(data.phoneNumber)) {
          phoneMap.set(data.phoneNumber, []);
        }
        phoneMap.set(data.phoneNumber, [...phoneMap.get(data.phoneNumber), {
          id: doc.id,
          name: data.name,
          email: data.email,
          createdAt: data.createdAt ? (typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : new Date(data.createdAt)) : null
        }]);
      }
    }
    
    let duplicatePhoneCount = 0;
    for (const [phone, users] of phoneMap.entries()) {
      if (users.length > 1) {
        console.log(`📱 Phone: ${phone}`);
        users.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.name} (${user.id})`);
          console.log(`      Email: ${user.email || 'N/A'}`);
          console.log(`      Created: ${user.createdAt ? user.createdAt.toLocaleString() : 'N/A'}`);
        });
        console.log('');
        duplicatePhoneCount++;
      }
    }
    
    if (duplicatePhoneCount === 0) {
      console.log('✅ No duplicate phone numbers found\n');
    } else {
      console.log(`⚠️  Found ${duplicatePhoneCount} duplicate phone number(s)\n`);
    }
    
    // Find duplicate zones by location
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🏠 DUPLICATE ZONES BY LOCATION:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const homesSnapshot = await db.collection('homes').get();
    const locationMap = new Map();
    
    for (const doc of homesSnapshot.docs) {
      const data = doc.data();
      if (data.location && data.location.address) {
        // Normalize address for comparison
        const normalizedAddress = data.location.address.toLowerCase().trim();
        
        if (!locationMap.has(normalizedAddress)) {
          locationMap.set(normalizedAddress, []);
        }
        
        // Get owner name
        let ownerName = 'Unknown';
        if (data.userId) {
          const userDoc = await db.collection('users').doc(data.userId).get();
          if (userDoc.exists) {
            ownerName = userDoc.data().name;
          }
        }
        
        locationMap.set(normalizedAddress, [...locationMap.get(normalizedAddress), {
          id: doc.id,
          name: data.name,
          owner: ownerName,
          ownerId: data.userId,
          address: data.location.address,
          radius: data.radius
        }]);
      }
    }
    
    let duplicateLocationCount = 0;
    for (const [address, zones] of locationMap.entries()) {
      if (zones.length > 1) {
        console.log(`📍 Address: ${zones[0].address}`);
        zones.forEach((zone, index) => {
          console.log(`   ${index + 1}. "${zone.name}" by ${zone.owner}`);
          console.log(`      Zone ID: ${zone.id}`);
          console.log(`      Radius: ${zone.radius} miles`);
        });
        console.log('');
        duplicateLocationCount++;
      }
    }
    
    if (duplicateLocationCount === 0) {
      console.log('✅ No duplicate zone locations found\n');
    } else {
      console.log(`⚠️  Found ${duplicateLocationCount} duplicate zone location(s)\n`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

findDuplicates().then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
