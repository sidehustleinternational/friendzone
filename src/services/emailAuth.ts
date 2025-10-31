import { logger } from '../utils/logger';
import { 
  createUserWithEmailAndPassword, 
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User as FirebaseUser,
  UserCredential,
  onAuthStateChanged
} from 'firebase/auth';
import { auth } from '../../firebaseConfig';
import { createUser, getUserData } from './firebase';

/**
 * Generate a secure random password
 */
function generateSecurePassword(): string {
  const length = 32;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    password += charset[randomValues[i] % charset.length];
  }
  return password;
}

/**
 * Create a new user account with email and password
 */
export const signUpWithEmail = async (
  name: string, 
  email: string,
  phoneNumber: string
): Promise<{ success: boolean; user?: FirebaseUser; error?: string }> => {
  try {
    logger.debug('📧 Creating user account with email:', email);
    logger.debug('📧 Auth object:', !!auth);
    
    // Generate a secure random password for the user
    // Users will use Apple Sign-In or phone auth as primary methods
    const securePassword = generateSecurePassword();
    
    // Create Firebase auth user
    logger.debug('📧 Calling createUserWithEmailAndPassword...');
    const userCredential: UserCredential = await createUserWithEmailAndPassword(auth, email, securePassword);
    const firebaseUser = userCredential.user;
    
    // Send email verification
    await sendEmailVerification(firebaseUser);
    logger.debug('📧 Email verification sent to:', email);
    
    // Create user document in Firestore (use setDoc to prevent duplicates)
    const { setDoc, doc } = await import('firebase/firestore');
    const { db } = await import('../../firebaseConfig');
    
    const userData = {
      id: firebaseUser.uid,
      name: name.trim(),
      email: email.trim(),
      phoneNumber: phoneNumber.trim(),
      isVerified: false, // Will be true after email verification
      createdAt: new Date(),
    };
    
    logger.debug('📝 Creating user document with data:', {
      name: name || 'UNDEFINED',
      nameTrimmed: name?.trim() || 'UNDEFINED',
      email: email || 'UNDEFINED',
      phoneNumber: phoneNumber || 'UNDEFINED',
      finalUserData: userData
    });
    
    await setDoc(doc(db, 'users', firebaseUser.uid), userData);
    
    logger.debug('✅ User document created in Firestore');
    
    logger.debug('✅ User account created successfully');
    return { success: true, user: firebaseUser };
    
  } catch (error: any) {
    logger.error('❌ Error creating user account:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'auth/email-already-in-use') {
      return { success: false, error: 'An account with this email already exists. Try signing in instead.' };
    } else if (error.code === 'auth/invalid-email') {
      logger.debug('📧 Invalid email error for:', email);
      logger.debug('📧 Full error object:', error);
      logger.debug('📧 Error message:', error.message);
      return { success: false, error: `Invalid email format. Firebase rejected: ${email}. Try a Gmail address.` };
    } else if (error.code === 'auth/weak-password') {
      return { success: false, error: 'Password is too weak.' };
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Sign in existing user with email and password
 */
export const signInWithEmail = async (
  email: string
): Promise<{ success: boolean; user?: any; needsProfile?: boolean; error?: string }> => {
  try {
    logger.debug('📧 Attempting to sign in with email:', email);
    
    // NOTE: Email/password auth is deprecated in favor of Apple Sign-In and phone auth
    // This function should not be used for new sign-ins
    return { 
      success: false, 
      error: 'Email/password sign-in is no longer supported. Please use Apple Sign-In or phone authentication.' 
    };
    
    /* DEPRECATED CODE - DO NOT USE
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Check if email is verified
    if (!firebaseUser.emailVerified) {
      logger.debug('⚠️ Email not verified for user:', email);
      await firebaseSignOut(auth);
      return { 
        success: false, 
        needsVerification: true,
        error: 'Please verify your email before signing in. Check your inbox for the verification link.' 
      };
    }
    
    logger.debug('✅ User signed in successfully with verified email');
    return { success: true, user: firebaseUser };
    */
    
  } catch (error: any) {
    logger.error('❌ Error signing in user:', error);
    
    // Handle specific Firebase errors
    if (error.code === 'auth/user-not-found') {
      return { success: false, error: 'No account found with this email.' };
    } else if (error.code === 'auth/wrong-password') {
      return { success: false, error: 'Incorrect password.' };
    } else if (error.code === 'auth/invalid-email') {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    
    return { success: false, error: error.message };
  }
};

/**
 * Check if current user's email is verified
 */
export const isEmailVerified = (): boolean => {
  const user = auth.currentUser;
  return user?.emailVerified || false;
};

/**
 * Resend email verification
 */
export const resendEmailVerification = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, error: 'No user logged in' };
    }
    
    await sendEmailVerification(user);
    logger.debug('📧 Email verification resent');
    return { success: true };
    
  } catch (error: any) {
    logger.error('❌ Error resending email verification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Listen for authentication state changes
 */
export const onAuthStateChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Sign out current user
 */
export const signOut = async (): Promise<{ success: boolean; error?: string }> => {
  try {
    await auth.signOut();
    logger.debug('✅ User signed out successfully');
    return { success: true };
  } catch (error: any) {
    logger.error('❌ Error signing out:', error);
    return { success: false, error: error.message };
  }
};
