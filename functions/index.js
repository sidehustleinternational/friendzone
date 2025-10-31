const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

/**
 * Send SMS verification code using Firebase Admin SDK
 * This Cloud Function handles phone verification for React Native clients
 */
exports.sendVerificationCode = functions.https.onCall(async (data, context) => {
  // Verify the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to send verification code.'
    );
  }

  const { phoneNumber } = data;

  // Validate phone number format (E.164)
  if (!phoneNumber || !phoneNumber.match(/^\+1\d{10}$/)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Phone number must be in E.164 format (+1XXXXXXXXXX)'
    );
  }

  try {
    // For reverse SMS verification - just create the pending verification
    // User will text us to verify
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store the verification request in Firestore with expiration (5 minutes)
    const verificationRef = admin.firestore().collection('phoneVerifications').doc();
    await verificationRef.set({
      userId: context.auth.uid,
      phoneNumber: phoneNumber,
      code: verificationCode,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
      verified: false,
    });

    console.log(`✅ Verification request created for ${phoneNumber}`);
    console.log(`📱 User should text JOIN to +16065030588 to verify`);

    // Return success - app will open SMS app with pre-filled message
    return {
      success: true,
      verificationId: verificationRef.id,
      message: 'Verification request created - user should text JOIN',
    };
  } catch (error) {
    console.error('Error in sendVerificationCode:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to send verification code'
    );
  }
});

/**
 * Verify the SMS code entered by the user
 */
exports.verifyCode = functions.https.onCall(async (data, context) => {
  // Verify the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'User must be authenticated to verify code.'
    );
  }

  const { verificationId, code } = data;

  if (!verificationId || !code) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Verification ID and code are required'
    );
  }

  try {
    // Get the verification document
    const verificationRef = admin.firestore().collection('phoneVerifications').doc(verificationId);
    const verificationDoc = await verificationRef.get();

    if (!verificationDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Verification session not found or expired'
      );
    }

    const verificationData = verificationDoc.data();

    // Check if already verified
    if (verificationData.verified) {
      throw new functions.https.HttpsError(
        'already-exists',
        'This code has already been used'
      );
    }

    // Check if expired
    if (verificationData.expiresAt.toMillis() < Date.now()) {
      throw new functions.https.HttpsError(
        'deadline-exceeded',
        'Verification code has expired. Please request a new code.'
      );
    }

    // Check if user matches
    if (verificationData.userId !== context.auth.uid) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'This verification code belongs to a different user'
      );
    }

    // Verify the code
    if (verificationData.code !== code) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Invalid verification code'
      );
    }

    // Mark as verified
    await verificationRef.update({
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      phoneNumber: verificationData.phoneNumber,
      message: 'Phone number verified successfully',
    };
  } catch (error) {
    console.error('Error in verifyCode:', error);
    
    // Re-throw HttpsErrors as-is
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError(
      'internal',
      'Failed to verify code'
    );
  }
});

/**
 * Webhook to receive incoming SMS from Twilio for reverse verification
 * User texts "JOIN" to our Twilio number to verify their phone
 */
exports.receiveSMS = functions.https.onRequest(async (req, res) => {
  try {
    // Twilio sends POST requests with form data
    const { From, Body } = req.body;
    
    console.log(`📱 Received SMS from ${From}: ${Body}`);
    
    // Normalize phone number to E.164 format
    const phoneNumber = From.startsWith('+') ? From : `+${From}`;
    
    // Check if message contains JOIN (case insensitive)
    const messageText = (Body || '').trim().toUpperCase();
    if (!messageText.includes('JOIN')) {
      console.log(`⚠️ Invalid message text: ${Body}`);
      // Respond with TwiML
      res.set('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Please text JOIN to verify your phone number.</Message></Response>`);
      return;
    }
    
    // Find pending verification for this phone number
    const verificationsRef = admin.firestore().collection('phoneVerifications');
    const snapshot = await verificationsRef
      .where('phoneNumber', '==', phoneNumber)
      .where('verified', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      console.log(`⚠️ No pending verification found for ${phoneNumber}`);
      res.set('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>No pending verification found. Please start verification in the FriendZone app first.</Message></Response>`);
      return;
    }
    
    const verificationDoc = snapshot.docs[0];
    const verificationData = verificationDoc.data();
    
    // Check if expired (5 minutes)
    if (verificationData.expiresAt.toMillis() < Date.now()) {
      console.log(`⚠️ Verification expired for ${phoneNumber}`);
      res.set('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Verification expired. Please start again in the FriendZone app.</Message></Response>`);
      return;
    }
    
    // Mark as verified
    await verificationDoc.ref.update({
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      verifiedVia: 'reverse_sms',
    });
    
    console.log(`✅ Phone verified: ${phoneNumber}`);
    
    // Respond with success message
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>✅ Phone verified! You can now continue in the FriendZone app.</Message></Response>`);
    
  } catch (error) {
    console.error('Error in receiveSMS:', error);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Error processing verification. Please try again.</Message></Response>`);
  }
});
