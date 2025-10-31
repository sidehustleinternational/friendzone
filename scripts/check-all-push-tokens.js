const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkAllPushTokens() {
  try {
    console.log('\n📱 CHECKING ALL USER PUSH TOKENS\n');
    console.log('═══════════════════════════════════════\n');
    
    const usersSnapshot = await db.collection('users').get();
    
    let totalUsers = 0;
    let usersWithToken = 0;
    let usersWithoutToken = 0;
    
    const usersWithoutTokenList = [];
    const usersWithTokenList = [];
    
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      totalUsers++;
      
      if (data.pushToken || data.expoPushToken) {
        usersWithToken++;
        usersWithTokenList.push({
          name: data.name || 'Unknown',
          phone: data.phoneNumber || 'No phone',
          token: data.expoPushToken || data.pushToken || 'None',
          tokenUpdated: data.pushTokenUpdatedAt ? (data.pushTokenUpdatedAt.toDate ? new Date(data.pushTokenUpdatedAt.toDate()).toLocaleString() : data.pushTokenUpdatedAt) : 'Never'
        });
      } else {
        usersWithoutToken++;
        usersWithoutTokenList.push({
          name: data.name || 'Unknown',
          phone: data.phoneNumber || 'No phone',
          lastSeen: data.lastSeen ? (data.lastSeen.toDate ? new Date(data.lastSeen.toDate()).toLocaleString() : data.lastSeen) : 'Never'
        });
      }
    });
    
    console.log('📊 SUMMARY:');
    console.log(`Total Users: ${totalUsers}`);
    console.log(`With Push Token: ${usersWithToken} (${Math.round(usersWithToken/totalUsers*100)}%)`);
    console.log(`Without Push Token: ${usersWithoutToken} (${Math.round(usersWithoutToken/totalUsers*100)}%)`);
    
    console.log('\n\n✅ USERS WITH PUSH TOKENS:');
    console.log('═══════════════════════════════════════\n');
    usersWithTokenList.forEach(user => {
      console.log(`${user.name}`);
      console.log(`  Phone: ${user.phone}`);
      console.log(`  Token: ${user.token.substring(0, 30)}...`);
      console.log(`  Token Updated: ${user.tokenUpdated}`);
      console.log('');
    });
    
    console.log('\n❌ USERS WITHOUT PUSH TOKENS:');
    console.log('═══════════════════════════════════════\n');
    usersWithoutTokenList.forEach(user => {
      console.log(`${user.name}`);
      console.log(`  Phone: ${user.phone}`);
      console.log(`  Last Seen: ${user.lastSeen}`);
      console.log('');
    });
    
    console.log('\n✅ Done!\n');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllPushTokens();
