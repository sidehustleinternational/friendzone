import { auth, db } from '../../firebaseConfig';
import {
  PhoneAuthProvider,
  signInWithCredential,
  RecaptchaVerifier,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { logger } from '../utils/logger';

// Store the verificationId globally for use in verification
let currentVerificationId: string | null = null;

/**
 * Send SMS verification code to phone number
 * @param phoneNumber - Phone number in E.164 format (e.g., +1234567890)
 * @param recaptchaVerifier - Recaptcha verifier instance
 */
export async function sendSMSVerification(
  phoneNumber: string,
  recaptchaVerifier: RecaptchaVerifier
): Promise<{ success: boolean; verificationId?: string; error?: string }> {
  try {
    logger.debug('📱 Sending SMS verification');

    const phoneProvider = new PhoneAuthProvider(auth);
    const verificationId = await phoneProvider.verifyPhoneNumber(
      phoneNumber,
      recaptchaVerifier
    );

    currentVerificationId = verificationId;

    logger.debug('✅ SMS sent successfully, verification ID:', verificationId);

    return {
      success: true,
      verificationId,
    };
  } catch (error: any) {
    logger.error('❌ Error sending SMS:', error);
    return {
      success: false,
      error: error.message || 'Failed to send verification code',
    };
  }
}

/**
 * Verify SMS code and sign in user
 * @param verificationCode - 6-digit code received via SMS
 * @param name - User's full name (for new users)
 */
export async function verifySMSCode(
  verificationCode: string,
  name?: string
): Promise<{
  success: boolean;
  user?: any;
  needsProfile?: boolean;
  error?: string;
}> {
  try {
    if (!currentVerificationId) {
      return {
        success: false,
        error: 'No verification in progress. Please request a new code.',
      };
    }

    logger.debug('🔐 Verifying SMS code...');

    // Create credential with verification ID and code
    const credential = PhoneAuthProvider.credential(
      currentVerificationId,
      verificationCode
    );

    // Sign in with the credential
    const userCredential = await signInWithCredential(auth, credential);
    const user = userCredential.user;

    logger.debug('✅ Phone auth successful:', user.uid);

    // Check if user document exists
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (!userDoc.exists()) {
      // New user - create document
      logger.debug('📝 Creating new user document');

      await setDoc(doc(db, 'users', user.uid), {
        name: name || '',
        phoneNumber: user.phoneNumber,
        email: user.email || '',
        createdAt: serverTimestamp(),
        emailVerified: false,
      });

      // Clear verification ID
      currentVerificationId = null;

      return {
        success: true,
        user,
        needsProfile: !name, // Need profile if name wasn't provided
      };
    } else {
      // Existing user
      logger.debug('✅ Existing user signed in');

      // Clear verification ID
      currentVerificationId = null;

      const userData = userDoc.data();

      return {
        success: true,
        user,
        needsProfile: !userData.name, // Need profile if name is missing
      };
    }
  } catch (error: any) {
    logger.error('❌ Error verifying SMS code:', error);

    // Clear verification ID on error
    currentVerificationId = null;

    return {
      success: false,
      error: error.message || 'Invalid verification code',
    };
  }
}

/**
 * Clear the current verification ID (for cleanup/reset)
 */
export function clearVerification() {
  currentVerificationId = null;
}
