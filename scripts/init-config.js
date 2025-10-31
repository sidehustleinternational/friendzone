#!/usr/bin/env node

/**
 * Initialize app configuration in Firestore
 * Run this once to create the initial config document
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

async function initConfig() {
  try {
    const defaultConfig = {
      app_store_url: 'https://jamiegoldstein.github.io/homer',
      sms_invite_enabled: true,
      updated_at: Date.now()
    };

    await db.collection('config').doc('app_settings').set(defaultConfig);

    console.log('✅ Initial app config created:');
    console.log(JSON.stringify(defaultConfig, null, 2));
    console.log('\n📝 To update later:');
    console.log('node scripts/update-config.js --app-store-url "https://apps.apple.com/app/friendzone/id123456789"');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating config:', error);
    process.exit(1);
  }
}

initConfig();
