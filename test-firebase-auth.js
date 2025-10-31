/**
 * Simple Firebase Auth Test Script
 * Run with: node test-firebase-auth.js
 * 
 * This tests if Firebase auth is configured correctly
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAiYx6hUO97uuiRwmH4sRiFjrb9g3ZMECk",
  authDomain: "homer-323fe.firebaseapp.com",
  projectId: "homer-323fe",
  storageBucket: "homer-323fe.firebasestorage.app",
  messagingSenderId: "761933707709",
  appId: "1:761933707709:ios:ec5767d76b766b44803ad4"
};

console.log('🔧 Testing Firebase Configuration...\n');
console.log('Config:', JSON.stringify(firebaseConfig, null, 2));
console.log('\n---\n');

try {
  // Initialize Firebase
  console.log('1️⃣ Initializing Firebase app...');
  const app = initializeApp(firebaseConfig);
  console.log('✅ Firebase app initialized successfully\n');

  // Initialize Auth
  console.log('2️⃣ Initializing Firebase Auth...');
  const auth = getAuth(app);
  console.log('✅ Firebase Auth initialized successfully\n');

  // Test anonymous sign-in (doesn't require Apple Sign-In)
  console.log('3️⃣ Testing anonymous authentication...');
  signInAnonymously(auth)
    .then((userCredential) => {
      console.log('✅ Anonymous auth successful!');
      console.log('User ID:', userCredential.user.uid);
      console.log('\n🎉 Firebase is configured correctly!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Anonymous auth failed:');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('\n🔍 This indicates a Firebase configuration issue.\n');
      
      if (error.code === 'auth/network-request-failed') {
        console.log('💡 Possible causes:');
        console.log('   - API key restrictions blocking requests');
        console.log('   - Bundle ID mismatch');
        console.log('   - Network connectivity issue');
        console.log('   - Firebase project settings');
      }
      
      process.exit(1);
    });

} catch (error) {
  console.error('❌ Firebase initialization failed:');
  console.error(error);
  process.exit(1);
}
