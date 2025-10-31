/**
 * Set admin custom claim for a user
 * Usage: node scripts/set-admin.js <userId>
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const userId = process.argv[2];

if (!userId) {
  console.error('❌ Error: Please provide a user ID');
  console.log('Usage: node scripts/set-admin.js <userId>');
  console.log('\nTo find your user ID, run: node scripts/debug-zones.js');
  process.exit(1);
}

async function setAdminClaim() {
  try {
    console.log(`🔧 Setting admin claim for user: ${userId}`);
    
    // Set custom claim
    await admin.auth().setCustomUserClaims(userId, { admin: true });
    
    console.log('✅ Admin claim set successfully!');
    console.log('\n⚠️  IMPORTANT: User must sign out and sign back in for changes to take effect.');
    console.log('   The custom claim will be included in their next auth token.');
    
    // Verify the claim was set
    const user = await admin.auth().getUser(userId);
    console.log('\n✅ Verified custom claims:', user.customClaims);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting admin claim:', error);
    process.exit(1);
  }
}

setAdminClaim();
