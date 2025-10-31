// Quick test script to debug geocoding issue
const fetch = require('node-fetch');

async function testGeocoding() {
  const apiKey = 'AIzaSyBWwXnGiHMd6Pp3ywGMxD47taQ11Dn--2w';
  const address = 'Stowe, VT';
  const encoded = encodeURIComponent(address.trim());
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;

  console.log('🗺️ Testing geocoding with URL:', url.replace(apiKey, 'API_KEY_HIDDEN'));
  
  try {
    const resp = await fetch(url);
    console.log('📡 Response status:', resp.status);
    console.log('📡 Response ok:', resp.ok);
    
    const data = await resp.json();
    console.log('📊 Full response data:', JSON.stringify(data, null, 2));
    
    if (data.status !== 'OK') {
      console.error('🚨 Google API Error:', data.status);
      console.error('🚨 Error message:', data.error_message);
    } else {
      console.log('✅ Success! Location:', data.results[0].geometry.location);
    }
    
  } catch (error) {
    console.error('💥 Network/Fetch error:', error.message);
  }
}

testGeocoding();