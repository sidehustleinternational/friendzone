/**
 * Apple Sign-In Service
 * Clean, simple implementation for native iOS
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth, db } from '../../firebaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';

interface AppleSignInResult {
  success: boolean;
  user?: any;
  error?: string;
  needsProfile?: boolean;
}

/**
 * Check if Apple Sign-In is available
 */
export const isAppleSignInAvailable = async (): Promise<boolean> => {
  return await AppleAuthentication.isAvailableAsync();
};

/**
 * Sign in with Apple
 * Simple, clean implementation without workarounds
 */
export const signInWithApple = async (): Promise<AppleSignInResult> => {
  try {
    // Step 1: Get Apple credentials
    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!appleCredential.identityToken) {
      return { success: false, error: 'No identity token received from Apple' };
    }

    // Step 2: Create Firebase credential
    const provider = new OAuthProvider('apple.com');
    const firebaseCredential = provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce: appleCredential.identityToken, // Use token as nonce (worked before)
    });

    // Step 3: Sign in to Firebase
    const userCredential = await signInWithCredential(auth, firebaseCredential);
    const firebaseUser = userCredential.user;

    // Step 4: Check/create user document
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // New user - create document
      const displayName = appleCredential.fullName
        ? `${appleCredential.fullName.givenName || ''} ${appleCredential.fullName.familyName || ''}`.trim()
        : firebaseUser.displayName || 'User';

      await setDoc(userDocRef, {
        id: firebaseUser.uid,
        name: displayName,
        email: firebaseUser.email || appleCredential.email,
        authProvider: 'apple',
        isVerified: true,
        createdAt: Date.now(),
      });

      return {
        success: true,
        needsProfile: true, // Need phone number
        user: {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: displayName,
        },
      };
    }

    // Existing user - check if profile is complete
    const userData = userDoc.data();
    const needsProfile = !userData?.phoneNumber;

    return {
      success: true,
      needsProfile: needsProfile,
      user: {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
      },
    };

  } catch (error: any) {
    // Handle cancellation
    if (error.code === 'ERR_CANCELED' || error.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, error: 'Sign-in cancelled' };
    }

    // Log error for debugging
    console.error('Apple Sign-In error:', error);
    
    return {
      success: false,
      error: error.message || 'Apple Sign-In failed',
    };
  }
};
