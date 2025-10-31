// Script to view all users in the database
// Run with: node viewUsers.js

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function viewUsers() {
  try {
    console.log('👥 All users in database:\n');
    
    const usersRef = db.collection('users');
    const snapshot = await usersRef.get();
    
    console.log(`Total users: ${snapshot.size}\n`);
    
    snapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      console.log(`${index + 1}. User ID: ${doc.id}`);
      console.log(`   Name: ${data.name || 'NO NAME'}`);
      console.log(`   Phone: ${data.phoneNumber || 'NO PHONE'}`);
      console.log(`   Email: ${data.email || 'NO EMAIL'}`);
      console.log(`   Auth Provider: ${data.authProvider || 'UNKNOWN'}`);
      console.log(`   Created: ${data.createdAt ? new Date(data.createdAt).toLocaleString() : 'UNKNOWN'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error viewing users:', error);
  } finally {
    process.exit();
  }
}

viewUsers();
