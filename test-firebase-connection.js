/**
 * Firebase Connection Test
 * Tests basic Firebase connectivity without authentication
 */

const https = require('https');

const firebaseConfig = {
  apiKey: "AIzaSyACgplq_hJ9epBB559LZ_1D8_pjIw33XJo",
  authDomain: "homer-323fe.firebaseapp.com",
  projectId: "homer-323fe",
  appId: "1:761933707709:ios:ec5767d76b766b44803ad4"
};

console.log('🔧 Testing Firebase API Key and Network Connectivity...\n');

// Test 1: Check if API key is valid by making a simple request
console.log('1️⃣ Testing API key validity...');

const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;

const postData = JSON.stringify({
  returnSecureToken: true
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': postData.length
  }
};

const req = https.request(url, options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response status:', res.statusCode);
    console.log('Response:', data);
    
    if (res.statusCode === 400) {
      const response = JSON.parse(data);
      if (response.error && response.error.message === 'OPERATION_NOT_ALLOWED') {
        console.log('\n✅ API key is VALID and can reach Firebase!');
        console.log('⚠️  Anonymous auth is disabled (expected)');
        console.log('\n🎯 This means the API key works from your computer.');
        console.log('   The issue is likely iOS-specific restrictions.\n');
      }
    } else if (res.statusCode === 403) {
      console.log('\n❌ API key is RESTRICTED and blocking requests');
      console.log('   Check Google Cloud Console API key restrictions\n');
    } else {
      console.log('\n✅ Firebase is reachable!');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Network error:', error.message);
  console.log('\n🔍 Cannot reach Firebase servers\n');
});

req.write(postData);
req.end();

// Test 2: Check bundle ID in Firebase
console.log('\n2️⃣ Checking Firebase iOS app configuration...');
console.log('Expected bundle ID: com.jamiegoldstein.FriendZone');
console.log('App ID in config:', firebaseConfig.appId);
console.log('\n💡 Verify in Firebase Console that:');
console.log('   - iOS app exists with bundle ID: com.jamiegoldstein.FriendZone');
console.log('   - Apple Sign-In is enabled in Authentication > Sign-in methods');
console.log('   - API key restrictions allow iOS apps with this bundle ID\n');
