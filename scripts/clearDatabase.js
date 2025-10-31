/**
 * Clear Firebase database
 * Run with: node scripts/clearDatabase.js
 * WARNING: This will delete ALL data!
 */

const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, deleteDoc, doc } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyAvzlI4PJl_cqcWJcXgyXyImUuF5c_Hiek",
  authDomain: "homer-323fe.firebaseapp.com",
  projectId: "homer-323fe",
  storageBucket: "homer-323fe.firebasestorage.app",
  messagingSenderId: "761933707709",
  appId: "1:761933707709:ios:0b6c4aacc39b58e6803ad4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function clearCollection(collectionName) {
  console.log(`\n🗑️  Clearing ${collectionName}...`);
  const snapshot = await getDocs(collection(db, collectionName));
  
  if (snapshot.empty) {
    console.log(`   ✓ ${collectionName} already empty`);
    return 0;
  }

  const deletePromises = snapshot.docs.map(document => 
    deleteDoc(doc(db, collectionName, document.id))
  );
  
  await Promise.all(deletePromises);
  console.log(`   ✓ Deleted ${snapshot.size} documents from ${collectionName}`);
  return snapshot.size;
}

async function clearDatabase() {
  console.log('\n⚠️  WARNING: This will DELETE ALL DATA from Firebase!');
  console.log('='.repeat(60));
  
  try {
    let totalDeleted = 0;

    // Clear all collections
    totalDeleted += await clearCollection('users');
    totalDeleted += await clearCollection('homes');
    totalDeleted += await clearCollection('friends');
    totalDeleted += await clearCollection('friendRequests');
    totalDeleted += await clearCollection('locations');
    totalDeleted += await clearCollection('securityLogs');

    console.log('\n' + '='.repeat(60));
    console.log(`\n✅ Database cleared! Total documents deleted: ${totalDeleted}\n`);

  } catch (error) {
    console.error('\n❌ Error clearing database:', error);
  }

  process.exit(0);
}

clearDatabase();
