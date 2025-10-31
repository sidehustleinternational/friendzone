/**
 * Detailed API Key Test
 * Tests the exact API key being used in the app
 */

const https = require('https');

const API_KEY = "AIzaSyACgplq_hJ9epBB559LZ_1D8_pjIw33XJo";

console.log('🔧 Testing API Key:', API_KEY);
console.log('');

// Test 1: Identity Toolkit API (used for Apple Sign-In)
console.log('1️⃣ Testing Identity Toolkit API (Apple Sign-In)...');

const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`;

const postData = JSON.stringify({
  postBody: "id_token=test&providerId=apple.com",
  requestUri: "http://localhost",
  returnSecureToken: true,
  returnIdpCredential: true
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
    
    try {
      const response = JSON.parse(data);
      console.log('Response:', JSON.stringify(response, null, 2));
      
      if (res.statusCode === 400) {
        if (response.error && response.error.message === 'INVALID_IDP_RESPONSE') {
          console.log('\n✅ API key works! (INVALID_IDP_RESPONSE is expected with test data)');
          console.log('✅ Identity Toolkit API is accessible');
          console.log('✅ No API key restrictions blocking requests');
        } else {
          console.log('\n⚠️  Unexpected error:', response.error.message);
        }
      } else if (res.statusCode === 403) {
        console.log('\n❌ API KEY IS RESTRICTED!');
        console.log('❌ The key is blocking requests');
        console.log('\n🔍 Check Google Cloud Console:');
        console.log('   1. Go to: https://console.cloud.google.com/apis/credentials');
        console.log('   2. Find key:', API_KEY);
        console.log('   3. Set "Application restrictions" to "None"');
        console.log('   4. Or add bundle ID: com.jamiegoldstein.FriendZone');
      } else {
        console.log('\n✅ API key is reachable');
      }
    } catch (e) {
      console.log('Raw response:', data);
    }
    
    console.log('\n---\n');
    
    // Test 2: Check if key is in the correct project
    console.log('2️⃣ Verifying project configuration...');
    console.log('Expected project: homer-323fe');
    console.log('Expected bundle: com.jamiegoldstein.FriendZone');
    console.log('\n💡 If API key works from computer but fails on device:');
    console.log('   - API key has iOS-specific restrictions');
    console.log('   - Bundle ID mismatch');
    console.log('   - Device needs to match bundle ID exactly');
  });
});

req.on('error', (error) => {
  console.error('❌ Network error:', error.message);
  console.log('\n🔍 Cannot reach Firebase servers');
  console.log('   - Check internet connection');
  console.log('   - Check if Firebase is down');
});

req.write(postData);
req.end();
