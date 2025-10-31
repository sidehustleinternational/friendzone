const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function viewDebugLogs() {
  try {
    console.log('\n🔍 VIEWING DEBUG LOGS FROM FIRESTORE\n');
    
    // Get all debug logs, sorted by timestamp
    const logsSnapshot = await db.collection('debugLogs')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    
    if (logsSnapshot.empty) {
      console.log('📭 No debug logs found yet.\n');
      return;
    }
    
    console.log(`📊 Found ${logsSnapshot.size} debug logs (showing last 20):\n`);
    
    logsSnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const date = new Date(data.timestamp);
      
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Log #${index + 1} - ${date.toLocaleString()}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Type: ${data.type}`);
      console.log(`User ID: ${data.userId}`);
      console.log(`\n🎯 Current Zone ID: ${data.currentUserZoneId}`);
      console.log(`✅ Found Zone Name: ${data.foundZoneName}`);
      console.log(`✅ Found Zone ID: ${data.foundZoneId}`);
      console.log(`\n📍 All Zones in Array (${data.homesCount}):`);
      
      if (data.allZones && data.allZones.length > 0) {
        data.allZones.forEach(zone => {
          const match = zone.id === data.currentUserZoneId ? '👉 ' : '   ';
          console.log(`${match}${zone.name} (${zone.id})`);
        });
      }
      
      // Highlight if there's a mismatch
      if (data.currentUserZoneId && data.foundZoneId !== data.currentUserZoneId) {
        console.log(`\n⚠️  MISMATCH DETECTED!`);
        console.log(`   Looking for: ${data.currentUserZoneId}`);
        console.log(`   But found: ${data.foundZoneId}`);
      }
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

viewDebugLogs();
