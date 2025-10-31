/**
 * Migration script to encrypt existing location data in Firestore
 * Run this once to encrypt all existing user locations
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Simple encryption function (matches locationEncryption.ts logic)
async function encryptLocation(latitude, longitude) {
  const crypto = require('crypto');
  const key = 'HOMER_LOCATION_ENCRYPTION_KEY_2025';
  
  // Hash the key
  const hashedKey = crypto.createHash('sha256').update(key).digest();
  
  // Convert location to string
  const locationString = `${latitude},${longitude}`;
  const textBytes = Buffer.from(locationString, 'utf8');
  
  // XOR encryption
  const encrypted = Buffer.alloc(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ hashedKey[i % hashedKey.length];
  }
  
  // Convert to base64
  return encrypted.toString('base64');
}

async function migrateLocations() {
  try {
    console.log('🔐 Starting location encryption migration...\n');
    
    // Get all users
    const usersSnapshot = await db.collection('users').get();
    
    let totalUsers = 0;
    let migratedUsers = 0;
    let skippedUsers = 0;
    let errorUsers = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      totalUsers++;
      const userData = userDoc.data();
      const userId = userDoc.id;
      
      // Check if user has location data
      if (!userData.lastLocation) {
        console.log(`⏭️  User ${userId}: No location data`);
        skippedUsers++;
        continue;
      }
      
      const location = userData.lastLocation;
      
      // Check if already encrypted
      if (location.encryptedCoordinates) {
        console.log(`✓ User ${userId}: Already encrypted`);
        skippedUsers++;
        continue;
      }
      
      // Check if has coordinates to encrypt
      if (!location.latitude || !location.longitude) {
        console.log(`⚠️  User ${userId}: Missing coordinates`);
        skippedUsers++;
        continue;
      }
      
      try {
        // Encrypt the coordinates
        const encryptedCoordinates = await encryptLocation(
          location.latitude,
          location.longitude
        );
        
        // Update the document
        await db.collection('users').doc(userId).update({
          lastLocation: {
            encryptedCoordinates,
            timestamp: location.timestamp || Date.now(),
            accuracy: location.accuracy || null
          }
        });
        
        console.log(`✅ User ${userId}: Encrypted (${location.latitude}, ${location.longitude})`);
        migratedUsers++;
        
      } catch (error) {
        console.error(`❌ User ${userId}: Encryption failed:`, error.message);
        errorUsers++;
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 Migration Summary:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   ✅ Migrated: ${migratedUsers}`);
    console.log(`   ⏭️  Skipped: ${skippedUsers}`);
    console.log(`   ❌ Errors: ${errorUsers}`);
    console.log('='.repeat(50));
    
    if (errorUsers > 0) {
      console.log('\n⚠️  Some users failed to migrate. Check errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ Migration complete!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateLocations();
