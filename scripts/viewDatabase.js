/**
 * Quick script to view Firebase database contents
 * Run with: node scripts/viewDatabase.js
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAvzlI4PJl_cqcWJcXgyXyImUuF5c_Hiek",
  authDomain: "homer-323fe.firebaseapp.com",
  projectId: "homer-323fe",
  storageBucket: "homer-323fe.firebasestorage.app",
  messagingSenderId: "761933707709",
  appId: "1:761933707709:ios:0b6c4aacc39b58e6803ad4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function viewDatabase() {
  console.log('\n📊 FIREBASE DATABASE CONTENTS\n');
  console.log('='.repeat(60));

  try {
    // Users
    console.log('\n👥 USERS:');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    console.log(`Total users: ${usersSnapshot.size}`);
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n  User ID: ${doc.id}`);
      console.log(`  Name: ${data.name || 'N/A'}`);
      console.log(`  Email: ${data.email || 'N/A'}`);
      console.log(`  Created: ${data.createdAt ? new Date(data.createdAt).toLocaleString() : 'N/A'}`);
    });

    // Homes/Zones
    console.log('\n\n🏠 HOMES/ZONES:');
    const homesSnapshot = await getDocs(collection(db, 'homes'));
    console.log(`Total homes: ${homesSnapshot.size}`);
    homesSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n  Home ID: ${doc.id}`);
      console.log(`  Name: ${data.name || 'N/A'}`);
      console.log(`  Address: ${data.address || 'N/A'}`);
      console.log(`  Members: ${data.members?.length || 0}`);
    });

    // Friends
    console.log('\n\n👫 FRIENDS:');
    const friendsSnapshot = await getDocs(collection(db, 'friends'));
    console.log(`Total friend relationships: ${friendsSnapshot.size}`);
    friendsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n  Friend ID: ${doc.id}`);
      console.log(`  User: ${data.userId || 'N/A'}`);
      console.log(`  Friend: ${data.friendUserId || 'N/A'}`);
      console.log(`  Status: ${data.status || 'N/A'}`);
    });

    // Friend Requests
    console.log('\n\n📬 FRIEND REQUESTS:');
    const requestsSnapshot = await getDocs(collection(db, 'friendRequests'));
    console.log(`Total requests: ${requestsSnapshot.size}`);
    requestsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n  Request ID: ${doc.id}`);
      console.log(`  From: ${data.fromUserName || 'N/A'}`);
      console.log(`  Status: ${data.status || 'N/A'}`);
    });

    // Locations (encrypted)
    console.log('\n\n📍 LOCATIONS:');
    const locationsSnapshot = await getDocs(collection(db, 'locations'));
    console.log(`Total location records: ${locationsSnapshot.size}`);
    locationsSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n  User ID: ${doc.id}`);
      console.log(`  Encrypted: ${data.encryptedLocation ? 'Yes ✅' : 'No'}`);
      console.log(`  Timestamp: ${data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A'}`);
      console.log(`  Updated: ${data.updatedAt ? new Date(data.updatedAt).toLocaleString() : 'N/A'}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('\n✅ Database view complete!\n');

  } catch (error) {
    console.error('\n❌ Error viewing database:', error);
  }

  process.exit(0);
}

viewDatabase();
