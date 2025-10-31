/**
 * Manually verify an email address in Firebase Auth
 * FOR TESTING ONLY - bypasses email verification
 * Run with: node scripts/manuallyVerifyEmail.js <email>
 */

const admin = require('firebase-admin');

// Initialize Admin SDK
try {
  admin.initializeApp({
    projectId: "homer-323fe"
  });
} catch (e) {
  console.log('Admin already initialized');
}

async function verifyEmail(email) {
  console.log(`\n🔧 Manually verifying email: ${email}\n`);
  
  try {
    // Get user by email
    const user = await admin.auth().getUserByEmail(email);
    
    console.log(`Found user:`);
    console.log(`  UID: ${user.uid}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Currently verified: ${user.emailVerified}`);
    
    if (user.emailVerified) {
      console.log(`\n✅ Email already verified!`);
      process.exit(0);
    }
    
    // Update user to mark email as verified
    await admin.auth().updateUser(user.uid, {
      emailVerified: true
    });
    
    console.log(`\n✅ Email manually verified! User can now sign in.`);
    
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.log('\nUser not found. Make sure the account was created first.');
    }
  }
  
  process.exit(0);
}

const email = process.argv[2];

if (!email) {
  console.log('\nUsage: node scripts/manuallyVerifyEmail.js <email>');
  console.log('Example: node scripts/manuallyVerifyEmail.js jamiegoldstein44@gmail.com\n');
  process.exit(1);
}

verifyEmail(email);
