const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function toggleDebug() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];
    
    if (!command || !['on', 'off', 'status'].includes(command)) {
      console.log('\n📋 Usage:');
      console.log('  node scripts/toggle-debug.js on      - Enable debug logging');
      console.log('  node scripts/toggle-debug.js off     - Disable debug logging');
      console.log('  node scripts/toggle-debug.js status  - Check current status\n');
      return;
    }
    
    const configRef = db.collection('config').doc('debug');
    
    if (command === 'status') {
      const doc = await configRef.get();
      if (doc.exists) {
        const data = doc.data();
        console.log('\n📊 Current Debug Settings:');
        console.log(`   Firestore Logging: ${data.enableFirestoreLogging ? '✅ ON' : '❌ OFF'}`);
        console.log(`   Console Logging: ${data.enableConsoleLogging ? '✅ ON' : '❌ OFF'}`);
        console.log(`   Location Service: ${data.logLocationService ? '✅ ON' : '❌ OFF'}`);
        console.log(`   UI Rendering: ${data.logUIRendering ? '✅ ON' : '❌ OFF'}\n`);
      } else {
        console.log('\n⚠️  No debug config found (using defaults)\n');
      }
      return;
    }
    
    const enable = command === 'on';
    
    await configRef.set({
      enableFirestoreLogging: enable,
      enableConsoleLogging: enable,
      logLocationService: enable,
      logUIRendering: enable,
      updatedAt: Date.now(),
    });
    
    console.log(`\n✅ Debug logging ${enable ? 'ENABLED' : 'DISABLED'}`);
    console.log('   App will pick up changes on next launch\n');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

toggleDebug();
