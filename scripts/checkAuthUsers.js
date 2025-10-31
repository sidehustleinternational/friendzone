/**
 * Check Firebase Auth users and their verification status
 * Run with: node scripts/checkAuthUsers.js
 */

const { initializeApp } = require('firebase/app');
const { getAuth, listUsers } = require('firebase-admin/auth');
const admin = require('firebase-admin');

const firebaseConfig = {
  apiKey: "AIzaSyAvzlI4PJl_cqcWJcXgyXyImUuF5c_Hiek",
  authDomain: "homer-323fe.firebaseapp.com",
  projectId: "homer-323fe",
  storageBucket: "homer-323fe.firebasestorage.app",
  messagingSenderId: "761933707709",
  appId: "1:761933707709:ios:0b6c4aacc39b58e6803ad4"
};

// Initialize Admin SDK
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "homer-323fe"
});

async function checkAuthUsers() {
  console.log('\n👥 FIREBASE AUTH USERS\n');
  console.log('='.repeat(60));

  try {
    const listUsersResult = await admin.auth().listUsers();
    
    console.log(`Total users: ${listUsersResult.users.length}\n`);
    
    listUsersResult.users.forEach((user) => {
      console.log(`Email: ${user.email}`);
      console.log(`  UID: ${user.uid}`);
      console.log(`  Email Verified: ${user.emailVerified ? '✅ Yes' : '❌ No'}`);
      console.log(`  Created: ${new Date(user.metadata.creationTime).toLocaleString()}`);
      console.log(`  Last Sign In: ${user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : 'Never'}`);
      console.log('');
    });

    console.log('='.repeat(60));
    console.log('\n✅ Auth check complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nNote: This script requires Firebase Admin SDK credentials.');
    console.log('For now, check users in Firebase Console:');
    console.log('https://console.firebase.google.com/project/homer-323fe/authentication/users\n');
  }

  process.exit(0);
}

checkAuthUsers();
