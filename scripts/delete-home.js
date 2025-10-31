// Script to delete a specific home from Firestore
// Usage: node scripts/delete-home.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteHome() {
  const homeId = 'A7ks4SpJWQvLMpaiHG4C';
  
  try {
    await db.collection('homes').doc(homeId).delete();
    console.log(`✅ Successfully deleted home: ${homeId}`);
  } catch (error) {
    console.error('❌ Error deleting home:', error);
  }
  
  process.exit(0);
}

deleteHome();
