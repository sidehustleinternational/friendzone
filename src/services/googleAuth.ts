/**
 * Google Sign-In Authentication Service
 * Uses Expo AuthSession for Expo Go compatibility
 */

import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth, db } from '../../firebaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { makeRedirectUri } from 'expo-auth-session';
import { logger } from '../utils/logger';

WebBrowser.maybeCompleteAuthSession();

// Your Google OAuth Client IDs from Firebase Console
// iOS client ID from Google Cloud Console (for native mobile apps)
const IOS_CLIENT_ID = '761933707709-sd68vtp1mdqkng5ftp39sf6oiedds5l1.apps.googleusercontent.com';
// Web client ID (for Expo Go and web-based auth flows)
const WEB_CLIENT_ID = '761933707709-d837csgr4b12p10Qa7nk4kj86ejbu5p5.apps.googleusercontent.com';

/**
 * Initialize Google Sign-In
 * Call this once when the app starts
 */
export const initializeGoogleSignIn = () => {
  logger.debug('✅ Google Sign-In configured for Expo');
};

/**
 * Process Google authentication token and sign in to Firebase
 */
export const processGoogleSignIn = async (idToken: string, accessToken: string): Promise<{
  success: boolean;
  user?: any;
  error?: string;
}> => {
  try {
    logger.debug('🔵 Processing Google Sign-In with Firebase...');

    // Create Google credential
    const googleCredential = GoogleAuthProvider.credential(idToken, accessToken);

    // Sign in to Firebase with Google credential
    const userCredential = await signInWithCredential(auth, googleCredential);
    const firebaseUser = userCredential.user;

    logger.debug('✅ Firebase authentication successful:', firebaseUser.email);

    // Check if user document exists in Firestore
    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // Create new user document
      const userData = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'User',
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL,
        authProvider: 'google',
        isVerified: true, // Google accounts are pre-verified
        createdAt: Date.now(),
      };

      await setDoc(userDocRef, userData);
      logger.debug('✅ User document created in Firestore');
    } else {
      logger.debug('✅ Existing user signed in');
    }

    return {
      success: true,
      user: {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
      },
    };
  } catch (error: any) {
    logger.error('❌ Google Sign-In error:', error);
    return { success: false, error: error.message || 'Google Sign-In failed' };
  }
};

// Export the client IDs for use in components
export { IOS_CLIENT_ID, WEB_CLIENT_ID };
