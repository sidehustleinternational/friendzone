const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function getUserInfo() {
  try {
    const searchTerm = process.argv[2];
    
    if (!searchTerm) {
      console.log('Usage: node user-info.js "Name" or node user-info.js +1XXXXXXXXXX');
      console.log('Example: node user-info.js "Brad Rosen"');
      console.log('Example: node user-info.js +16175551234');
      console.log('Example: node user-info.js <USER_ID>');
      process.exit(1);
    }

    console.log(`\n🔍 Searching for: ${searchTerm}\n`);
    
    let userDoc = null;
    let userId = null;
    let userData = null;
    
    // Check if it's a user ID (long alphanumeric string)
    if (searchTerm.length > 20 && !searchTerm.includes(' ') && !searchTerm.startsWith('+')) {
      // Direct user ID lookup
      userDoc = await db.collection('users').doc(searchTerm).get();
      if (userDoc.exists) {
        userId = userDoc.id;
        userData = userDoc.data();
      }
    } else if (searchTerm.startsWith('+')) {
      // Search by phone
      const usersSnapshot = await db.collection('users')
        .where('phoneNumber', '==', searchTerm)
        .get();
      
      if (!usersSnapshot.empty) {
        userDoc = usersSnapshot.docs[0];
        userId = userDoc.id;
        userData = userDoc.data();
      }
    } else {
      // Search by name (case-insensitive)
      const usersSnapshot = await db.collection('users').get();
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.name && data.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          userDoc = doc;
          userId = doc.id;
          userData = data;
        }
      });
    }
    
    if (!userData) {
      console.log('❌ User not found');
      process.exit(1);
    }
    
    console.log('👤 USER INFORMATION:');
    console.log('═══════════════════════════════════════');
    console.log(`Name: ${userData.name || 'N/A'}`);
    console.log(`User ID: ${userId}`);
    console.log(`Phone: ${userData.phoneNumber || 'N/A'}`);
    console.log(`Email: ${userData.email || 'N/A'}`);
    console.log(`Created: ${userData.createdAt?.toDate?.() || 'N/A'}`);
    console.log(`Last Seen: ${userData.lastSeen ? new Date(userData.lastSeen).toLocaleString() : 'N/A'}`);
    console.log(`Currently At Home: ${userData.isAtHome ? 'Yes' : 'No'}`);
    console.log(`Current Zone IDs: ${userData.currentHomeIds?.join(', ') || 'None'}`);
    if (userData.lastLocation) {
      console.log(`Last Location: ${userData.lastLocation.latitude}, ${userData.lastLocation.longitude}`);
      console.log(`Location Address: ${userData.lastLocation.address || 'N/A'}`);
    }
    
    // Get zones this user owns
    console.log('\n🏠 ZONES OWNED:');
    console.log('═══════════════════════════════════════');
    const ownedZones = await db.collection('homes')
      .where('createdBy', '==', userId)
      .get();
    
    if (ownedZones.empty) {
      console.log('No zones owned');
    } else {
      ownedZones.forEach(doc => {
        const zone = doc.data();
        console.log(`\n📍 ${zone.name} (${doc.id})`);
        console.log(`   Location: ${zone.location.address}`);
        console.log(`   Radius: ${zone.radius} miles`);
        console.log(`   Members: ${zone.members?.length || 0}`);
        console.log(`   Created: ${zone.createdAt?.toDate?.() || 'N/A'}`);
      });
    }
    
    // Get zones this user is a member of (but doesn't own)
    console.log('\n🏠 ZONES MEMBER OF:');
    console.log('═══════════════════════════════════════');
    const memberZones = await db.collection('homes')
      .where('members', 'array-contains', userId)
      .get();
    
    const memberZonesNotOwned = memberZones.docs.filter(doc => doc.data().createdBy !== userId);
    
    if (memberZonesNotOwned.length === 0) {
      console.log('Not a member of any zones (besides owned)');
    } else {
      memberZonesNotOwned.forEach(doc => {
        const zone = doc.data();
        console.log(`\n📍 ${zone.name} (${doc.id})`);
        console.log(`   Owner: ${zone.createdBy}`);
        console.log(`   Location: ${zone.location.address}`);
        console.log(`   Radius: ${zone.radius} miles`);
      });
    }
    
    // Get friends
    console.log('\n👥 FRIENDS:');
    console.log('═══════════════════════════════════════');
    const friendsSnapshot = await db.collection('friends')
      .where('userId', '==', userId)
      .get();
    
    if (friendsSnapshot.empty) {
      console.log('No friends');
    } else {
      for (const doc of friendsSnapshot.docs) {
        const friend = doc.data();
        console.log(`\n🤝 ${friend.name}`);
        console.log(`   Friend User ID: ${friend.friendUserId}`);
        console.log(`   Phone: ${friend.phoneNumber}`);
        console.log(`   Status: ${friend.status}`);
        console.log(`   Shared Zones: ${friend.sharedHomes?.length || 0}`);
        console.log(`   Active Zones: ${friend.activeHomes?.length || 0}`);
        console.log(`   Currently At Home: ${friend.isCurrentlyAtHome ? 'Yes' : 'No'}`);
        console.log(`   Current Zone IDs: ${friend.currentHomeIds?.join(', ') || 'None'}`);
        console.log(`   Magnet Enabled: ${friend.proximityAlertEnabled ? 'Yes' : 'No'}`);
        if (friend.proximityAlertEnabled) {
          console.log(`   Magnet Radius: ${friend.proximityAlertRadius} miles`);
        }
      }
    }
    
    // Get incoming friend requests
    console.log('\n📥 INCOMING FRIEND REQUESTS:');
    console.log('═══════════════════════════════════════');
    const incomingRequests = await db.collection('friendRequests')
      .where('toUserId', '==', userId)
      .get();
    
    if (incomingRequests.empty) {
      console.log('No incoming requests');
    } else {
      incomingRequests.forEach(doc => {
        const req = doc.data();
        console.log(`\n📨 From: ${req.fromUserName} (${req.fromUserId})`);
        console.log(`   Request ID: ${doc.id}`);
        console.log(`   Status: ${req.status || 'pending'}`);
        console.log(`   Zones: ${req.homeIds?.length || 0}`);
        console.log(`   Created: ${req.createdAt?.toDate?.() || 'N/A'}`);
      });
    }
    
    // Get outgoing friend requests
    console.log('\n📤 OUTGOING FRIEND REQUESTS:');
    console.log('═══════════════════════════════════════');
    const outgoingRequests = await db.collection('friendRequests')
      .where('fromUserId', '==', userId)
      .get();
    
    if (outgoingRequests.empty) {
      console.log('No outgoing requests');
    } else {
      outgoingRequests.forEach(doc => {
        const req = doc.data();
        console.log(`\n📨 To: ${req.toUserName || req.toPhoneNumber} (${req.toUserId || 'not registered'})`);
        console.log(`   Request ID: ${doc.id}`);
        console.log(`   Status: ${req.status || 'pending'}`);
        console.log(`   Zones: ${req.homeIds?.length || 0}`);
        console.log(`   Created: ${req.createdAt?.toDate?.() || 'N/A'}`);
      });
    }
    
    console.log('\n═══════════════════════════════════════\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

getUserInfo().then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
