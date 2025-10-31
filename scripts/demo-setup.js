#!/usr/bin/env node

/**
 * FriendZone Demo Setup Script
 * 
 * Commands:
 * 1. Create Zone: node demo-setup.js create-zone <userId> <zoneName> <address>
 * 2. Add Friend: node demo-setup.js add-friend <userId1> <userId2>
 * 3. Add Friend to Zone: node demo-setup.js add-friend-zone <userId> <friendUserId> <zoneId>
 * 4. List Users: node demo-setup.js list-users
 * 5. List Zones: node demo-setup.js list-zones <userId>
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Helper to resolve user ID from name or ID
async function resolveUserId(nameOrId) {
  // If it looks like a Firebase ID, return as-is
  if (nameOrId.length > 15) {
    return nameOrId;
  }
  
  // Otherwise, search by name (exact match, case-sensitive)
  const usersSnapshot = await db.collection('users')
    .where('name', '==', nameOrId)
    .get();
  
  if (usersSnapshot.empty) {
    throw new Error(`User "${nameOrId}" not found. Use exact name (case-sensitive) or user ID.`);
  }
  
  if (usersSnapshot.size > 1) {
    console.log(`\n⚠️  Multiple users found with name "${nameOrId}":`);
    usersSnapshot.forEach(doc => {
      console.log(`   - ${doc.data().name} (ID: ${doc.id})`);
    });
    throw new Error('Please use the specific user ID instead.');
  }
  
  const userId = usersSnapshot.docs[0].id;
  console.log(`✓ Resolved "${nameOrId}" to user ID: ${userId}`);
  return userId;
}

// Helper to get coordinates from address
async function geocodeAddress(address) {
  const locations = {
    'New York, NY': { latitude: 40.7128, longitude: -74.0060 },
    'West Village': { latitude: 40.7358, longitude: -74.0036 },
    'Stowe, VT': { latitude: 44.4654, longitude: -72.6874 },
    'Weston, MA': { latitude: 42.3668, longitude: -71.3031 },
    'Boston, MA': { latitude: 42.3601, longitude: -71.0589 },
  };
  
  return locations[address] || { latitude: 40.7128, longitude: -74.0060 };
}

// Command 1: Create Zone
async function createZone(userNameOrId, zoneName, address) {
  try {
    const userId = await resolveUserId(userNameOrId);
    console.log(`\n📍 Creating zone "${zoneName}" for user ${userId}...`);
    
    const coords = await geocodeAddress(address);
    
    const zoneData = {
      name: zoneName,
      location: {
        latitude: coords.latitude,
        longitude: coords.longitude,
        address: address
      },
      radius: 0.25,
      createdBy: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      members: [userId]
    };
    
    const zoneRef = await db.collection('homes').add(zoneData);
    console.log(`✅ Zone created with ID: ${zoneRef.id}`);
    console.log(`   Name: ${zoneName}`);
    console.log(`   Address: ${address}`);
    console.log(`   Coordinates: ${coords.latitude}, ${coords.longitude}`);
    
    return zoneRef.id;
  } catch (error) {
    console.error('❌ Error creating zone:', error);
    throw error;
  }
}

// Command 2: Add Friend
async function addFriend(user1NameOrId, user2NameOrId) {
  try {
    const userId1 = await resolveUserId(user1NameOrId);
    const userId2 = await resolveUserId(user2NameOrId);
    
    console.log(`\n👥 Adding friendship between ${userId1} and ${userId2}...`);
    
    const user1Doc = await db.collection('users').doc(userId1).get();
    const user2Doc = await db.collection('users').doc(userId2).get();
    
    if (!user1Doc.exists || !user2Doc.exists) {
      throw new Error('One or both users not found');
    }
    
    const user1Data = user1Doc.data();
    const user2Data = user2Doc.data();
    
    const friend1Data = {
      userId: userId1,
      friendUserId: userId2,
      name: user2Data.name || 'Friend',
      phoneNumber: user2Data.phoneNumber || '',
      status: 'connected',
      sharedHomes: [],
      proximityAlertEnabled: false,
      proximityAlertRadius: 0.5,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const friend2Data = {
      userId: userId2,
      friendUserId: userId1,
      name: user1Data.name || 'Friend',
      phoneNumber: user1Data.phoneNumber || '',
      status: 'connected',
      sharedHomes: [],
      proximityAlertEnabled: false,
      proximityAlertRadius: 0.5,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await db.collection('friends').add(friend1Data);
    await db.collection('friends').add(friend2Data);
    
    console.log(`✅ Friendship created!`);
    console.log(`   ${user1Data.name} ↔️ ${user2Data.name}`);
    
  } catch (error) {
    console.error('❌ Error adding friend:', error);
    throw error;
  }
}

// Command 3: Add Friend to Zone
async function addFriendToZone(userNameOrId, friendNameOrId, zoneId) {
  try {
    const userId = await resolveUserId(userNameOrId);
    const friendUserId = await resolveUserId(friendNameOrId);
    
    console.log(`\n🏠 Adding friend to zone...`);
    
    const friendsQuery1 = await db.collection('friends')
      .where('userId', '==', userId)
      .where('friendUserId', '==', friendUserId)
      .get();
    
    const friendsQuery2 = await db.collection('friends')
      .where('userId', '==', friendUserId)
      .where('friendUserId', '==', userId)
      .get();
    
    if (friendsQuery1.empty || friendsQuery2.empty) {
      throw new Error('Friendship not found. Add friend first.');
    }
    
    const batch = db.batch();
    
    friendsQuery1.forEach(doc => {
      const currentHomes = doc.data().sharedHomes || [];
      if (!currentHomes.includes(zoneId)) {
        batch.update(doc.ref, {
          sharedHomes: admin.firestore.FieldValue.arrayUnion(zoneId)
        });
      }
    });
    
    friendsQuery2.forEach(doc => {
      const currentHomes = doc.data().sharedHomes || [];
      if (!currentHomes.includes(zoneId)) {
        batch.update(doc.ref, {
          sharedHomes: admin.firestore.FieldValue.arrayUnion(zoneId)
        });
      }
    });
    
    const zoneRef = db.collection('homes').doc(zoneId);
    batch.update(zoneRef, {
      members: admin.firestore.FieldValue.arrayUnion(friendUserId)
    });
    
    await batch.commit();
    
    console.log(`✅ Friend added to zone!`);
    console.log(`   Zone ID: ${zoneId}`);
    
  } catch (error) {
    console.error('❌ Error adding friend to zone:', error);
    throw error;
  }
}

// Command 4: Create Fake User
async function createFakeUser(name, phone = null) {
  try {
    console.log(`\n👤 Creating fake user "${name}"...`);
    
    const now = Date.now();
    const userData = {
      name: name,
      email: `${name.toLowerCase()}@demo.friendzone.app`,
      phoneNumber: phone || `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
      createdAt: now,
      isAtHome: false,
      latitude: 40.7128,
      longitude: -74.0060,
      lastSeen: now
    };
    
    const userRef = await db.collection('users').add(userData);
    console.log(`✅ User created with ID: ${userRef.id}`);
    console.log(`   Name: ${name}`);
    console.log(`   Email: ${userData.email}`);
    console.log(`   Phone: ${userData.phoneNumber}`);
    
    return userRef.id;
  } catch (error) {
    console.error('❌ Error creating user:', error);
    throw error;
  }
}

// Helper to check if location is in a zone
function isInZone(userLat, userLon, zoneLat, zoneLon, radiusMiles) {
  const R = 3959; // Earth's radius in miles
  const dLat = (zoneLat - userLat) * Math.PI / 180;
  const dLon = (zoneLon - userLon) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(userLat * Math.PI / 180) * Math.cos(zoneLat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance <= radiusMiles;
}

// Command 5: Set User Location
async function setUserLocation(userNameOrId, address) {
  try {
    const userId = await resolveUserId(userNameOrId);
    console.log(`\n📍 Setting location for user ${userId}...`);
    
    const coords = await geocodeAddress(address);
    
    // Check if user is in any of their zones
    const homesSnapshot = await db.collection('homes')
      .where('members', 'array-contains', userId)
      .get();
    
    let isAtHome = false;
    let currentHomeId = null;
    
    homesSnapshot.forEach(doc => {
      const home = doc.data();
      const inZone = isInZone(
        coords.latitude,
        coords.longitude,
        home.location.latitude,
        home.location.longitude,
        home.radius || 0.25
      );
      
      if (inZone) {
        isAtHome = true;
        currentHomeId = doc.id;
        console.log(`   ✓ User is in zone: ${home.name}`);
      }
    });
    
    await db.collection('users').doc(userId).update({
      latitude: coords.latitude,
      longitude: coords.longitude,
      isAtHome: isAtHome,
      currentHomeId: currentHomeId,
      lastSeen: Date.now()
    });
    
    console.log(`✅ Location updated!`);
    console.log(`   Address: ${address}`);
    console.log(`   Coordinates: ${coords.latitude}, ${coords.longitude}`);
    console.log(`   At home: ${isAtHome ? 'Yes' : 'No'}`);
    
  } catch (error) {
    console.error('❌ Error setting location:', error);
    throw error;
  }
}

// Command 6: List Users
async function listUsers() {
  try {
    console.log(`\n👤 Listing all users...\n`);
    
    const usersSnapshot = await db.collection('users').get();
    
    if (usersSnapshot.empty) {
      console.log('No users found.');
      return;
    }
    
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`   Name: ${data.name || 'N/A'}`);
      console.log(`   Phone: ${data.phoneNumber || 'N/A'}`);
      console.log(`   Email: ${data.email || 'N/A'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error listing users:', error);
    throw error;
  }
}

// Command 5: List Zones
async function listZones(userNameOrId) {
  try {
    const userId = await resolveUserId(userNameOrId);
    console.log(`\n🏠 Listing zones for user ${userId}...\n`);
    
    const zonesSnapshot = await db.collection('homes')
      .where('members', 'array-contains', userId)
      .get();
    
    if (zonesSnapshot.empty) {
      console.log('No zones found for this user.');
      return;
    }
    
    zonesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}`);
      console.log(`   Name: ${data.name}`);
      console.log(`   Address: ${data.location?.address || 'N/A'}`);
      console.log(`   Members: ${data.members?.length || 0}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error listing zones:', error);
    throw error;
  }
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
FriendZone Demo Setup Script

Commands:
  list-users
  create-user <name> [phone]
  set-location <user> <address>
  create-zone <userId> <zoneName> <address>
  add-friend <userId1> <userId2>
  add-friend-zone <userId> <friendUserId> <zoneId>
  list-zones <userId>
    `);
    process.exit(0);
  }
  
  try {
    switch (command) {
      case 'create-user':
        await createFakeUser(args[1], args[2]);
        break;
      case 'set-location':
        await setUserLocation(args[1], args[2]);
        break;
      case 'create-zone':
        await createZone(args[1], args[2], args[3]);
        break;
      case 'add-friend':
        await addFriend(args[1], args[2]);
        break;
      case 'add-friend-zone':
        await addFriendToZone(args[1], args[2], args[3]);
        break;
      case 'list-users':
        await listUsers();
        break;
      case 'list-zones':
        await listZones(args[1]);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
    
    console.log('\n✅ Done!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
