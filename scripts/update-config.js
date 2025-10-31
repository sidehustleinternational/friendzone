#!/usr/bin/env node

/**
 * Admin script to update app configuration
 * Usage: node scripts/update-config.js --app-store-url "https://apps.apple.com/app/friendzone/id123456789"
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://homer-323fe-default-rtdb.firebaseio.com"
  });
}

const db = admin.firestore();

async function updateConfig() {
  try {
    const args = process.argv.slice(2);
    const updates = {};

    // Parse command line arguments
    for (let i = 0; i < args.length; i += 2) {
      const flag = args[i];
      const value = args[i + 1];

      switch (flag) {
        case '--app-store-url':
          updates.app_store_url = value;
          break;
        case '--enable-sms':
          updates.sms_invite_enabled = value === 'true';
          break;
        case '--disable-sms':
          updates.sms_invite_enabled = false;
          break;
        default:
          console.log(`Unknown flag: ${flag}`);
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log('Usage examples:');
      console.log('  node scripts/update-config.js --app-store-url "https://apps.apple.com/app/friendzone/id123456789"');
      console.log('  node scripts/update-config.js --enable-sms true');
      console.log('  node scripts/update-config.js --disable-sms');
      return;
    }

    // Get current config
    const configDoc = await db.collection('config').doc('app_settings').get();
    const currentConfig = configDoc.exists() ? configDoc.data() : {};

    // Merge updates
    const newConfig = {
      ...currentConfig,
      ...updates,
      updated_at: Date.now()
    };

    // Update Firestore
    await db.collection('config').doc('app_settings').set(newConfig);

    console.log('✅ App config updated successfully:');
    console.log(JSON.stringify(newConfig, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating config:', error);
    process.exit(1);
  }
}

updateConfig();
