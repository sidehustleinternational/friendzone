// Script to clear ALL data from Firebase database
// Run with: node clearAllDatabase.js

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function clearCollection(collectionName) {
  try {
    console.log(`\n🗑️  Clearing ${collectionName} collection...`);
    
    const collectionRef = db.collection(collectionName);
    const snapshot = await collectionRef.get();
    
    console.log(`Found ${snapshot.size} documents in ${collectionName}`);
    
    if (snapshot.empty) {
      console.log(`No documents to delete in ${collectionName}`);
      return;
    }
    
    const batch = db.batch();
    let count = 0;
    
    snapshot.docs.forEach((doc) => {
      console.log(`  Deleting ${collectionName}/${doc.id}`);
      batch.delete(doc.ref);
      count++;
      
      // Firestore batch limit is 500 operations
      if (count >= 500) {
        console.log('  Committing batch of 500...');
        batch.commit();
        count = 0;
      }
    });
    
    if (count > 0) {
      await batch.commit();
    }
    
    console.log(`✅ Cleared ${snapshot.size} documents from ${collectionName}`);
    
  } catch (error) {
    console.error(`Error clearing ${collectionName}:`, error);
  }
}

async function clearAllDatabase() {
  try {
    console.log('🚨 WARNING: This will delete ALL data from the database!');
    console.log('Collections to be cleared:');
    console.log('  - users');
    console.log('  - homes');
    console.log('  - friends');
    console.log('  - friendRequests');
    console.log('\nStarting in 3 seconds...\n');
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Clear all collections
    await clearCollection('friendRequests');
    await clearCollection('friends');
    await clearCollection('homes');
    await clearCollection('users');
    
    console.log('\n✅ ALL DATABASE DATA CLEARED!');
    console.log('Note: Firebase Auth users are NOT deleted (only Firestore data)');
    
  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    process.exit();
  }
}

clearAllDatabase();
