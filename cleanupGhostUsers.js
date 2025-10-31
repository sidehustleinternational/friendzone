// Script to clean up ghost users (users without names or phone numbers)
// Run with: node cleanupGhostUsers.js

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanupGhostUsers() {
  try {
    console.log('🔍 Looking for ghost users (no name or phone)...\n');
    
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    console.log(`Found ${snapshot.size} total users\n`);
    
    const ghostUsers = [];
    
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const hasName = data.name && data.name.trim() !== '';
      const hasPhone = data.phoneNumber && data.phoneNumber.trim() !== '';
      
      if (!hasName || !hasPhone) {
        ghostUsers.push({
          id: doc.id,
          name: data.name || 'NO NAME',
          phone: data.phoneNumber || 'NO PHONE',
          email: data.email || 'NO EMAIL'
        });
      }
    });
    
    if (ghostUsers.length === 0) {
      console.log('✅ No ghost users found!');
      return;
    }
    
    console.log(`Found ${ghostUsers.length} ghost user(s):\n`);
    ghostUsers.forEach((user, index) => {
      console.log(`${index + 1}. Name: "${user.name}", Phone: "${user.phone}", Email: "${user.email}"`);
      console.log(`   ID: ${user.id}\n`);
    });
    
    console.log('Deleting ghost users in 3 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const batch = db.batch();
    ghostUsers.forEach((user) => {
      const docRef = usersRef.doc(user.id);
      batch.delete(docRef);
      console.log(`🗑️  Deleting user ${user.id}`);
    });
    
    await batch.commit();
    console.log(`\n✅ Deleted ${ghostUsers.length} ghost user(s)!`);
    
  } catch (error) {
    console.error('Error cleaning up ghost users:', error);
  } finally {
    process.exit();
  }
}

cleanupGhostUsers();
