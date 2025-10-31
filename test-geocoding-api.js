#!/usr/bin/env node

/**
 * Quick test script for Google Maps Geocoding API
 * Tests if the API key is properly configured
 */

const API_KEY = 'AIzaSyBWwXnGiHMd6Pp3ywGMxD47taQ11Dn--2w'; // Old working key

// Test addresses
const TEST_ADDRESSES = [
  'Boston, MA',
  'Stowe, VT',
  'Weston, MA',
  '1600 Amphitheatre Parkway, Mountain View, CA'
];

async function testGeocode(address) {
  console.log(`\n🔍 Testing: "${address}"`);
  console.log('─'.repeat(60));
  
  const encoded = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    console.log(`Status: ${data.status}`);
    
    if (data.status === 'OK' && data.results?.length > 0) {
      const result = data.results[0];
      const location = result.geometry.location;
      console.log(`✅ SUCCESS`);
      console.log(`   Address: ${result.formatted_address}`);
      console.log(`   Coordinates: ${location.lat}, ${location.lng}`);
      return true;
    } else if (data.status === 'REQUEST_DENIED') {
      console.log(`❌ REQUEST DENIED`);
      console.log(`   Error: ${data.error_message || 'No error message'}`);
      console.log(`   \n   Possible causes:`);
      console.log(`   - Geocoding API not enabled in Google Cloud Console`);
      console.log(`   - API key has incorrect application restrictions`);
      console.log(`   - API key doesn't have Geocoding API in API restrictions`);
      return false;
    } else {
      console.log(`❌ FAILED: ${data.status}`);
      console.log(`   Error: ${data.error_message || 'No error message'}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ NETWORK ERROR: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     Google Maps Geocoding API Test                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n🔑 API Key: ${API_KEY.substring(0, 20)}...`);
  console.log(`📱 Expected Bundle ID: com.jamiegoldstein.FriendZone`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (const address of TEST_ADDRESSES) {
    const success = await testGeocode(address);
    if (success) {
      successCount++;
    } else {
      failCount++;
      // If first test fails with REQUEST_DENIED, no point testing others
      if (failCount === 1) {
        console.log('\n⚠️  Skipping remaining tests due to API access issue...\n');
        break;
      }
    }
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Results: ${successCount} passed, ${failCount} failed`);
  
  if (failCount > 0) {
    console.log('\n🔧 To fix API key issues:');
    console.log('   1. Go to https://console.cloud.google.com/');
    console.log('   2. Select your project');
    console.log('   3. Navigate to: APIs & Services > Credentials');
    console.log(`   4. Find key: ${API_KEY.substring(0, 20)}...`);
    console.log('   5. Under "API restrictions", ensure "Geocoding API" is enabled');
    console.log('   6. Under "Application restrictions":');
    console.log('      - Select "iOS apps"');
    console.log('      - Add bundle ID: com.jamiegoldstein.FriendZone');
    console.log('   7. Save and wait 5 minutes for changes to propagate\n');
  } else {
    console.log('\n✅ All tests passed! API key is working correctly.\n');
  }
}

// Run the tests
runTests().catch(console.error);
