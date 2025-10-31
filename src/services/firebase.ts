import { 
  signInWithPhoneNumber, 
  PhoneAuthProvider, 
  signInWithCredential,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
  ApplicationVerifier
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  getDocs,
  setDoc,
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  onSnapshot,
  serverTimestamp,
  orderBy,
  arrayUnion,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { User as AppUser, Home, Friend, ZoneRequest } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

// React Native SMS Authentication Services
// Note: React Native doesn't need reCAPTCHA - it uses native verification

export const sendSMSVerification = async (phoneNumber: string) => {
  try {
    logger.debug('Attempting to send SMS verification');
    
    // Import SMS service
    const { sendAuthenticationSMS, generateVerificationCode, formatPhoneForSMS } = await import('./smsService');
    
    // Generate verification code
    const verificationCode = generateVerificationCode();
    const formattedPhone = formatPhoneForSMS(phoneNumber);
    
    logger.debug('Generated verification code for phone');
    
    // Send SMS
    const result = await sendAuthenticationSMS(formattedPhone, verificationCode);
    
    if (result.success) {
      // Return a mock confirmation result that includes the code for development
      return {
        verificationId: result.messageId || 'mock-verification-id',
        verificationCode: verificationCode, // Include for development/testing
        phoneNumber: formattedPhone,
        confirm: async (code: string) => {
          if (code === verificationCode) {
            return { user: { uid: 'mock-user-' + Date.now() } };
          } else {
            throw new Error('Invalid verification code');
          }
        }
      };
    } else {
      throw new Error('Failed to send SMS verification');
    }
    
  } catch (error: any) {
    logger.error('Error sending SMS verification:', error);
    logger.error('❌ Error message:', error.message);
    logger.error('❌ Error stack:', error.stack);
    throw error;
  }
};

export const verifySMSCode = async (
  confirmationResult: any, 
  code: string,
  userData: Omit<AppUser, 'id' | 'createdAt'>
) => {
  try {
    logger.debug(`🔍 Verifying SMS code: ${code}`);
    
    // Use our custom confirmation result from sendSMSVerification
    if (confirmationResult && confirmationResult.confirm) {
      const result = await confirmationResult.confirm(code);
      
      // Create user account after successful verification
      const userAccount = await createOrSignInUser({
        ...userData,
        isVerified: true
      });
      
      logger.debug('✅ SMS verification successful, user created');
      return userAccount;
    } else {
      throw new Error('Invalid confirmation result');
    }
  } catch (error: any) {
    logger.error('Error verifying SMS code:', error);
    throw error;
  }
};

// Generate deterministic but secure password from phone number
// This allows the same password to be used for sign-in without storing it
// NOTE: This is a workaround - proper solution is to use Firebase Phone Auth directly
function generatePasswordFromPhone(phoneNumber: string): string {
  // Simple deterministic password generation for React Native
  // Uses a combination of phone number and salt to create a consistent password
  const salt = 'HOMER_APP_SECRET_SALT_2025';
  const combined = phoneNumber + salt;
  
  // Simple hash function (not cryptographically secure, but deterministic)
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to base64-like string
  const hashStr = Math.abs(hash).toString(36);
  const paddedHash = (hashStr + salt).substring(0, 32);
  
  return paddedHash;
}

// Mock authentication for development
export const createOrSignInUser = async (userData: Omit<AppUser, 'id' | 'createdAt'>) => {
  try {
    if (!userData.phoneNumber) {
      throw new Error('Phone number is required');
    }
    const tempEmail = `${userData.phoneNumber.replace(/\D/g, '')}@homer.app`;
    const tempPassword = generatePasswordFromPhone(userData.phoneNumber);
    
    let userCredential;
    let isNewUser = false;
    
    try {
      // Try to create new user
      userCredential = await createUserWithEmailAndPassword(auth, tempEmail, tempPassword);
      isNewUser = true;
      logger.debug('Created new user');
    } catch (createError: any) {
      if (createError.code === 'auth/email-already-in-use') {
        // User exists, sign them in instead
        userCredential = await signInWithEmailAndPassword(auth, tempEmail, tempPassword);
        logger.debug('Signed in existing user');
      } else {
        throw createError;
      }
    }
    
    const user = userCredential.user;
    
    // Create or update user document in Firestore
    const userDoc: AppUser = {
      id: user.uid,
      ...userData,
      createdAt: new Date(),
    };
    
    await setDoc(doc(db, 'users', user.uid), userDoc);
    
    return { 
      user: userDoc, 
      isNewUser,
      message: isNewUser ? 'New account created!' : 'Welcome back! Signed in to existing account.'
    };
  } catch (error) {
    logger.error('Error with user auth:', error);
    throw error;
  }
};

// Keep the old function for backward compatibility
export const createUser = createOrSignInUser;

export const signInUser = async (phoneNumber: string) => {
  try {
    const tempEmail = `${phoneNumber.replace(/\D/g, '')}@homer.app`;
    const tempPassword = generatePasswordFromPhone(phoneNumber);
    
    const userCredential = await signInWithEmailAndPassword(auth, tempEmail, tempPassword);
    return userCredential.user;
  } catch (error) {
    logger.error('Error signing in:', error);
    throw error;
  }
};

export const signOutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    logger.error('Error signing out:', error);
    throw error;
  }
};

// User Data Services
export const getUserData = async (userId: string): Promise<AppUser | null> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data() as AppUser;
    }
    
    // If user document doesn't exist but user is authenticated, 
    // they might need to recreate their profile
    logger.debug(`User document not found for userId: ${userId}`);
    return null;
  } catch (error) {
    logger.error('Error getting user data:', error);
    throw error;
  }
};

// Home Services
export const getHomesByIds = async (homeIds: string[]): Promise<Home[]> => {
  try {
    if (homeIds.length === 0) return [];
    
    const homePromises = homeIds.map(async (homeId) => {
      const homeDoc = await getDoc(doc(db, 'homes', homeId));
      if (homeDoc.exists()) {
        return {
          id: homeDoc.id,
          ...homeDoc.data(),
          createdAt: homeDoc.data().createdAt?.toDate() || new Date(),
        } as Home;
      }
      return null;
    });
    
    const homes = await Promise.all(homePromises);
    return homes.filter(home => home !== null) as Home[];
  } catch (error) {
    logger.error('Error getting homes by IDs:', error);
    throw error;
  }
};

/**
 * Save a personal nickname for a zone (doesn't affect other users)
 */
export const saveZoneNickname = async (userId: string, zoneId: string, nickname: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      [`zoneNicknames.${zoneId}`]: nickname
    });
    logger.debug(`✅ Saved nickname "${nickname}" for zone ${zoneId}`);
  } catch (error) {
    logger.error('Error saving zone nickname:', error);
    throw error;
  }
};

/**
 * Get user's zone nicknames
 */
export const getUserZoneNicknames = async (userId: string): Promise<{ [zoneId: string]: string }> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      return userDoc.data().zoneNicknames || {};
    }
    return {};
  } catch (error) {
    logger.error('Error getting zone nicknames:', error);
    return {};
  }
};

/**
 * Find existing zones near a location (within 5 miles)
 */
export const findSimilarZones = async (
  latitude: number, 
  longitude: number, 
  userId: string
): Promise<Array<Home & { creatorName: string; distance: number }>> => {
  try {
    // Get ALL zones (not just user's own)
    const snapshot = await getDocs(collection(db, 'homes'));
    const nearbyZones: Array<Home & { creatorName: string; distance: number }> = [];
    
    // Calculate distance to each zone
    for (const zoneDoc of snapshot.docs) {
      const data = zoneDoc.data();
      const zoneLat = data.location?.latitude;
      const zoneLon = data.location?.longitude;
      
      if (!zoneLat || !zoneLon) continue;
      
      // Calculate distance in meters
      const R = 6371e3; // Earth's radius in meters
      const φ1 = latitude * Math.PI/180;
      const φ2 = zoneLat * Math.PI/180;
      const Δφ = (zoneLat - latitude) * Math.PI/180;
      const Δλ = (zoneLon - longitude) * Math.PI/180;
      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      const distanceMiles = distance / 1609.34;
      
      // If within 5 miles, get creator name
      if (distanceMiles <= 5) {
        const creatorId = data.createdBy || data.userId;
        let creatorName = 'Unknown';
        
        if (creatorId) {
          try {
            const userRef = doc(db, 'users', creatorId);
            const userDoc = await getDoc(userRef);
            const userData = userDoc.data();
            creatorName = userData?.name || 'Unknown';
          } catch (err) {
            logger.error('Error fetching creator name:', err);
          }
        }
        
        nearbyZones.push({
          id: zoneDoc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          creatorName,
          distance: distanceMiles
        } as Home & { creatorName: string; distance: number });
      }
    }
    
    // Sort by distance
    return nearbyZones.sort((a, b) => a.distance - b.distance);
  } catch (error) {
    logger.error('Error finding similar zones:', error);
    return [];
  }
};

export const createHome = async (homeData: Omit<Home, 'id' | 'createdAt'>) => {
  try {
    const homeDoc = {
      ...homeData,
      createdAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, 'homes'), homeDoc);
    
    // Check location in background (non-blocking) after creating zone
    // This improves zone creation speed significantly
    const { checkLocationAndUpdateZones } = await import('./locationService');
    checkLocationAndUpdateZones().catch(error => {
      logger.error('Background location check failed:', error);
      // Don't throw - this is a background operation
    });
    
    return { id: docRef.id, ...homeData, createdAt: new Date() };
  } catch (error) {
    logger.error('Error creating home:', error);
    throw error;
  }
};

export const getUserHomes = async (userId: string): Promise<Home[]> => {
  try {
    const q = query(
      collection(db, 'homes'), 
      where('members', 'array-contains', userId)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as Home[];
  } catch (error) {
    logger.error('Error getting user homes:', error);
    throw error;
  }
};

// Friend Services
export const addFriend = async (userId: string, friendData: Omit<Friend, 'id'>) => {
  try {
    const friendDoc = {
      ...friendData,
      userId,
      createdAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, 'friends'), friendDoc);
    return { id: docRef.id, ...friendData };
  } catch (error) {
    logger.error('Error adding friend:', error);
    throw error;
  }
};

export const getUserFriends = async (userId: string): Promise<Friend[]> => {
  try {
    const q = query(
      collection(db, 'friends'), 
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Friend[];
  } catch (error) {
    logger.error('Error getting user friends:', error);
    throw error;
  }
};

// Database Management
export const clearUserData = async (userId: string) => {
  try {
    const currentUser = auth.currentUser;
    
    // First, delete user from Firebase Authentication (most important)
    if (currentUser && currentUser.uid === userId) {
      await deleteUser(currentUser);
      logger.debug('Firebase Auth user deleted');
    }
    
    // Then delete Firestore data (this can happen even after user is deleted)
    try {
      // Delete user document from Firestore
      await deleteDoc(doc(db, 'users', userId));
      
      // Delete user's friends
      const friendsQuery = query(
        collection(db, 'friends'), 
        where('userId', '==', userId)
      );
      const friendsSnapshot = await getDocs(friendsQuery);
      const friendsDeletePromises = friendsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(friendsDeletePromises);
      
      // Delete user's homes
      const homesQuery = query(
        collection(db, 'homes'), 
        where('createdBy', '==', userId)
      );
      const homesSnapshot = await getDocs(homesQuery);
      const homesDeletePromises = homesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(homesDeletePromises);
      
      logger.debug('Firestore data cleared');
    } catch (firestoreError) {
      logger.debug('Firestore cleanup failed (user already signed out):', firestoreError);
      // This is okay - the auth user deletion is what matters most
    }
    
    logger.debug('User account and data cleared successfully');
  } catch (error) {
    logger.error('Error clearing user data:', error);
    throw error;
  }
};

export const clearAllData = async () => {
  try {
    // Clear all collections that store app data
    const collections = ['users', 'friends', 'homes', 'friendRequests', 'locations'];
    
    for (const collectionName of collections) {
      const snapshot = await getDocs(collection(db, collectionName));
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      logger.debug(`Cleared ${snapshot.docs.length} documents from ${collectionName}`);
    }
    
    logger.debug('All database data cleared successfully');
  } catch (error) {
    logger.error('Error clearing all data:', error);
    throw error;
  }
};

// Helper function to check if email exists and provide debugging info
export const checkEmailExists = async (phoneNumber: string) => {
  try {
    const email = `${phoneNumber.replace(/\D/g, '')}@homer.app`;
    logger.debug('Checking email:', email);
    
    // Try to sign in to see if account exists
    try {
      await signInWithEmailAndPassword(auth, email, 'tempPassword123');
      logger.debug('Account exists and can sign in');
      return true;
    } catch (signInError: any) {
      if (signInError.code === 'auth/user-not-found') {
        logger.debug('Account does not exist - safe to create');
        return false;
      } else if (signInError.code === 'auth/wrong-password') {
        logger.debug('Account exists but wrong password');
        return true;
      } else {
        logger.debug('Other sign in error:', signInError.code);
        return true; // Assume it exists to be safe
      }
    }
  } catch (error) {
    logger.error('Error checking email:', error);
    return true; // Assume it exists to be safe
  }
};

// Check if a phone number belongs to an existing FriendZone user
export const checkUserExistsByPhone = async (phoneNumber: string): Promise<{exists: boolean, userId?: string, userData?: any}> => {
  try {
    // Format the phone number to E.164 format to match how users are stored
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    let e164Phone: string;
    
    if (cleanDigits.length === 10) {
      e164Phone = `+1${cleanDigits}`;
    } else if (cleanDigits.length === 11 && cleanDigits.startsWith('1')) {
      e164Phone = `+${cleanDigits}`;
    } else {
      logger.debug('❌ Invalid phone number format:', phoneNumber);
      return { exists: false };
    }
    
    logger.debug('🔍 Checking user existence with E.164 phone:', e164Phone);
    
    // Single query with E.164 format to match user storage
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phoneNumber', '==', e164Phone));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      logger.debug('✅ Found existing user:', userData.name, userData.email);
      return {
        exists: true,
        userId: userDoc.id, // Use document ID (Firebase Auth UID)
        userData: userData
      };
    }
    
    logger.debug('❌ No user found with phone:', e164Phone);
    return { exists: false };
  } catch (error) {
    logger.error('Error checking user by phone:', error);
    return { exists: false };
  }
};

// Friend Request Services
export const sendFriendRequest = async (
  fromUserId: string, 
  toPhoneNumber: string, 
  fromUserName: string, 
  homeIds: string[] = [],
  proximityAlertEnabled: boolean = false,
  proximityAlertRadius: number = 0.5
) => {
  try {
    const currentUser = auth.currentUser;

    // Validate required parameters
    if (!fromUserId) {
      throw new Error('fromUserId is required but was undefined');
    }
    if (!toPhoneNumber) {
      throw new Error('toPhoneNumber is required but was undefined');
    }
    
    // Bulletproof fromUserName validation and fallback
    if (!fromUserName || typeof fromUserName !== 'string' || fromUserName.trim() === '') {
      logger.debug('⚠️ fromUserName is invalid, applying emergency fallback:', fromUserName);
      fromUserName = 'FriendZone User';
      logger.debug('✅ Emergency fallback applied:', fromUserName);
    } else {
      fromUserName = fromUserName.trim(); // Ensure no whitespace issues
    }

    // Format the phone number to E.164 format to match user storage
    const cleanDigits = toPhoneNumber.replace(/\D/g, '');
    let e164Phone: string;
    
    if (cleanDigits.length === 10) {
      e164Phone = `+1${cleanDigits}`;
    } else if (cleanDigits.length === 11 && cleanDigits.startsWith('1')) {
      e164Phone = `+${cleanDigits}`;
    } else {
      throw new Error('Please enter a valid US phone number');
    }
    
    logger.debug('📤 Sending friend request to E.164 phone:', e164Phone);
    
    // Find the user by phone number (E.164 format lookup)
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phoneNumber', '==', e164Phone));
    const usersSnapshot = await getDocs(q);
    
    let toUserId = null;
    
    if (usersSnapshot && !usersSnapshot.empty) {
      // User exists - send normal friend request
      const userDoc = usersSnapshot.docs[0];
      const userData = userDoc.data();
      // Use the document ID (which is the Firebase Auth UID) or the id field if it exists
      toUserId = userData.id || userDoc.id;
      
      // Check if they're already friends (bidirectional check)
      const existingFriendshipQuery1 = query(
        collection(db, 'friends'),
        where('userId', '==', fromUserId),
        where('friendUserId', '==', toUserId),
        where('status', '==', 'connected')
      );
      const existingFriendshipQuery2 = query(
        collection(db, 'friends'),
        where('userId', '==', toUserId),
        where('friendUserId', '==', fromUserId),
        where('status', '==', 'connected')
      );
      
      const [friendship1, friendship2] = await Promise.all([
        getDocs(existingFriendshipQuery1),
        getDocs(existingFriendshipQuery2)
      ]);
      
      if (!friendship1.empty || !friendship2.empty) {
        // Already friends - check if they're trying to add NEW zones
        const existingFriendship = friendship1.empty ? friendship2.docs[0] : friendship1.docs[0];
        const existingSharedHomes = existingFriendship.data().sharedHomes || [];
        
        // Check if any of the requested zones are NEW (not already shared)
        const newZones = homeIds.filter(id => !existingSharedHomes.includes(id));
        
        if (newZones.length === 0) {
          logger.debug(`⚠️ Already friends and all zones already shared with user ${toUserId}`);
          throw new Error('You are already sharing all these zones with this person');
        }
        
        // Allow the request to proceed - it will add new zones to existing friendship
        logger.debug(`✅ Already friends but adding ${newZones.length} new zone(s)`);
      }
      
      // Check if request already exists
      const existingRequestQuery = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', fromUserId),
        where('toUserId', '==', toUserId),
        where('status', '==', 'pending')
      );
      const existingSnapshot = await getDocs(existingRequestQuery);
      
      if (!existingSnapshot.empty) {
        // Request already exists - add new zones to it
        const existingRequest = existingSnapshot.docs[0];
        const existingData = existingRequest.data();
        const existingHomeIds = existingData.homeIds || [];
        
        // Merge new zones with existing ones (remove duplicates)
        const mergedHomeIds = [...new Set([...existingHomeIds, ...homeIds])];
        
        // Update the existing request
        await updateDoc(doc(db, 'friendRequests', existingRequest.id), {
          homeIds: mergedHomeIds,
        });
        
        logger.debug(`✅ Added zones to existing friend request. Total zones: ${mergedHomeIds.length}`);
        return; // Exit early - request already exists and was updated
      }
    } else {
      // User doesn't exist - create pending friend request and send SMS invitation
      logger.debug(`📱 User not found for ${e164Phone}, creating pending request and sending SMS`);
      
      // Check if request already exists for this phone number
      const existingPhoneRequestQuery = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', fromUserId),
        where('toPhoneNumber', '==', e164Phone),
        where('status', '==', 'pending')
      );
      const existingPhoneSnapshot = await getDocs(existingPhoneRequestQuery);
      
      if (!existingPhoneSnapshot.empty) {
        // Request already exists - add new zones to it
        const existingRequest = existingPhoneSnapshot.docs[0];
        const existingData = existingRequest.data();
        const existingHomeIds = existingData.homeIds || [];
        
        // Merge new zones with existing ones (remove duplicates)
        const mergedHomeIds = [...new Set([...existingHomeIds, ...homeIds])];
        
        // Update the existing request
        await updateDoc(doc(db, 'friendRequests', existingRequest.id), {
          homeIds: mergedHomeIds,
        });
        
        logger.debug(`✅ Added zones to existing phone request. Total zones: ${mergedHomeIds.length}`);
        return; // Exit early - request already exists and was updated
      }
    }
    
    // Create friend request (with or without toUserId)
    const requestDoc = {
      fromUserId,
      toUserId, // null if user doesn't exist yet
      toPhoneNumber: e164Phone, // Always include phone number
      fromUserName,
      status: 'pending' as const,
      homeIds: homeIds,
      proximityAlertEnabled,
      proximityAlertRadius,
      createdAt: serverTimestamp(),
    };
    
    logger.debug('📝 Creating friend request document:', {
      fromUserId,
      toUserId,
      toPhoneNumber: e164Phone,
      fromUserName,
      status: 'pending',
      homeIds,
      proximityAlertEnabled,
      proximityAlertRadius,
      hasServerTimestamp: !!requestDoc.createdAt
    });
    
    const docRef = await addDoc(collection(db, 'friendRequests'), requestDoc);
    logger.debug(`✅ Friend request created: ${toUserId ? 'existing user' : 'pending phone number'} ${e164Phone}`);
    
    // Send push notification to recipient if they're an existing user
    if (toUserId) {
      try {
        const { sendFriendRequestNotification } = await import('./notificationService');
        const homes = await getHomesByIds(homeIds);
        const homeNames = homes.map(home => home.name);
        
        // Send push notification to recipient
        await sendFriendRequestNotification(toUserId, fromUserName, homeNames, fromUserId);
        logger.debug(`📬 Sent push notification to ${toUserId} from ${fromUserName}`);
      } catch (notificationError) {
        logger.error('Error sending friend request notification:', notificationError);
        // Don't fail the friend request if notification fails
      }
    }
    
    // Send SMS invitation if user doesn't exist on FriendZone yet
    if (!toUserId) {
      logger.debug('🔍 User not found, attempting to send SMS invitation...');
      try {
        logger.debug('📱 Importing SMS service...');
        const { sendInvitationSMS, formatPhoneForSMS } = await import('./smsService');
        logger.debug('✅ SMS service imported successfully');
        
        // Get home names for the invitation
        const homes = await getHomesByIds(homeIds);
        const homeNames = homes.map(home => home.name);
        logger.debug(`🏠 Found ${homes.length} homes:`, homeNames);
        
        const smsPhone = formatPhoneForSMS(e164Phone);
        logger.debug(`📞 Formatted phone: ${smsPhone}`);
        logger.debug(`👤 From user: ${fromUserName}`);
        
        logger.debug('🚀 Calling sendInvitationSMS...');
        const smsResult = await sendInvitationSMS(smsPhone, fromUserName, homeNames);
        logger.debug('📋 SMS Result:', smsResult);
        
        if (smsResult.success) {
          logger.debug(`✅ SMS invitation sent to ${smsPhone}`);
        } else {
          logger.debug(`⚠️ SMS invitation failed for ${smsPhone}, but friend request created`);
        }
      } catch (smsError) {
        logger.error('❌ Error sending SMS invitation:', smsError);
        logger.error('SMS Error details:', JSON.stringify(smsError, null, 2));
        // Continue anyway - the friend request is still created
      }
    }
    
    return { id: docRef.id, ...requestDoc, createdAt: new Date() };
  } catch (error) {
    logger.error('Error sending friend request:', error);
    throw error;
  }
};

// Process pending friend requests when a new user signs up
// Debug function to help identify duplicate users
export const debugUserDocuments = async () => {
  try {
    const usersRef = collection(db, 'users');
    const querySnapshot = await getDocs(usersRef);
    
    logger.debug('🔍 All user documents in database:');
    querySnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      logger.debug(`User ${index + 1}:`, {
        documentId: doc.id,
        userId: data.id,
        name: data.name || 'NO NAME',
        email: data.email || 'NO EMAIL',
        phone: data.phoneNumber || 'NO PHONE',
        createdAt: data.createdAt
      });
    });
    
    return querySnapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
  } catch (error) {
    logger.error('Error debugging user documents:', error);
    return [];
  }
};

export const processPendingFriendRequests = async (newUserId: string, phoneNumber: string) => {
  try {
    // Use E.164 format to match how phone numbers are stored
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    let e164Phone: string;
    
    if (cleanDigits.length === 10) {
      e164Phone = `+1${cleanDigits}`;
    } else if (cleanDigits.length === 11 && cleanDigits.startsWith('1')) {
      e164Phone = `+${cleanDigits}`;
    } else {
      e164Phone = phoneNumber; // fallback to original
    }
    
    logger.debug('🔍 Processing pending requests for:', e164Phone);
    
    // Find pending friend requests for this phone number
    const pendingRequestsQuery = query(
      collection(db, 'friendRequests'),
      where('toPhoneNumber', '==', e164Phone),
      where('toUserId', '==', null),
      where('status', '==', 'pending')
    );
    
    const pendingSnapshot = await getDocs(pendingRequestsQuery);
    
    if (!pendingSnapshot.empty) {
      logger.debug(`📬 Found ${pendingSnapshot.docs.length} pending friend requests for ${e164Phone}`);
      
      // Update each pending request with the new user ID
      const batch = writeBatch(db);
      
      pendingSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, {
          toUserId: newUserId,
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      logger.debug(`✅ Updated ${pendingSnapshot.docs.length} pending friend requests with new user ID`);
    }
  } catch (error) {
    logger.error('Error processing pending friend requests:', error);
  }
};

export const acceptFriendRequest = async (requestId: string, selectedHomeIds: string[] = []) => {
  try {
    logger.debug('🤝 Accepting friend request:', { requestId, selectedHomeIds });
    
    // Get the friend request
    const requestDoc = await getDoc(doc(db, 'friendRequests', requestId));
    if (!requestDoc.exists()) {
      throw new Error('Friend request not found');
    }
    
    const requestData = requestDoc.data();
    logger.debug('📋 Friend request data:', requestData);
    
    // Get user data for both users using document ID (Firebase Auth UID)
    const [fromUserDoc, toUserDoc] = await Promise.all([
      getDoc(doc(db, 'users', requestData.fromUserId)),
      getDoc(doc(db, 'users', requestData.toUserId))
    ]);
    
    if (!fromUserDoc.exists() || !toUserDoc.exists()) {
      logger.error('User lookup failed:', {
        fromUserId: requestData.fromUserId,
        toUserId: requestData.toUserId,
        fromUserFound: fromUserDoc.exists(),
        toUserFound: toUserDoc.exists()
      });
      throw new Error('User data not found');
    }
    
    const fromUser = fromUserDoc.data();
    const toUser = toUserDoc.data();
    
    logger.debug('👥 User data for friend relationship:', {
      fromUser: {
        id: fromUser?.id,
        name: fromUser?.name || 'UNDEFINED',
        email: fromUser?.email,
        phone: fromUser?.phoneNumber
      },
      toUser: {
        id: toUser?.id,
        name: toUser?.name || 'UNDEFINED', 
        email: toUser?.email,
        phone: toUser?.phoneNumber
      }
    });
    
    // Create friend relationships for both users
    // Use selectedHomeIds if provided, otherwise use homeIds from request, fallback to legacy homeId
    const requestHomeIds = requestData.homeIds || (requestData.homeId ? [requestData.homeId] : []);
    const sharedHomeIds = selectedHomeIds.length > 0 ? selectedHomeIds : requestHomeIds;
    
    // Robust name fallbacks to prevent undefined field errors
    const toUserName = toUser?.name?.trim() || toUser?.email?.split('@')[0] || 'Friend';
    const fromUserName = fromUser?.name?.trim() || fromUser?.email?.split('@')[0] || 'Friend';
    const toUserPhone = toUser?.phoneNumber || '';
    const fromUserPhone = fromUser?.phoneNumber || '';
    
    // Get proximity alert settings from the request
    const proximityAlertEnabled = requestData.proximityAlertEnabled || false;
    const proximityAlertRadius = requestData.proximityAlertRadius || 0.5;
    
    // Friend record for the person who SENT the request (fromUser)
    // This record belongs to fromUser and contains info about toUser
    const friendDoc1 = {
      userId: requestData.fromUserId,  // Jamie's user ID (owner of this record)
      friendUserId: requestData.toUserId, // Jodi's user ID (the friend)
      name: toUserName,               // Jodi's name (with fallback)
      phoneNumber: toUserPhone,       // Jodi's phone (with fallback)
      status: 'connected' as const,
      sharedHomes: sharedHomeIds,     // Permission to share these zones
      activeHomes: sharedHomeIds,     // Currently actively sharing (mutual consent on accept)
      proximityAlertEnabled,          // Magnet setting
      proximityAlertRadius,           // Magnet radius
      createdAt: serverTimestamp(),
    };
    
    // Friend record for the person who RECEIVED the request (toUser)
    // This record belongs to toUser and contains info about fromUser
    const friendDoc2 = {
      userId: requestData.toUserId,    // Jodi's user ID (owner of this record)
      friendUserId: requestData.fromUserId, // Jamie's user ID (the friend)
      name: fromUserName,             // Jamie's name (with fallback)
      phoneNumber: fromUserPhone,     // Jamie's phone (with fallback)
      status: 'connected' as const,
      sharedHomes: sharedHomeIds,     // Permission to share these zones
      activeHomes: sharedHomeIds,     // Currently actively sharing (mutual consent on accept)
      proximityAlertEnabled,          // Magnet setting (same for both)
      proximityAlertRadius,           // Magnet radius (same for both)
      createdAt: serverTimestamp(),
    };
    
    // Add both friend relationships and update request status
    logger.debug('Creating friend relationships:');
    logger.debug('friendDoc1 (for fromUser):', friendDoc1);
    logger.debug('friendDoc2 (for toUser):', friendDoc2);
    
    // Also add the accepting user (toUser) to all shared homes as a member
    // IMPORTANT: The accepting user needs to be added to the zone members
    // so they can be detected as "in" the zone and see it in their zones list
    
    // OPTIMIZED: Fetch all homes in parallel first, then update in parallel
    logger.debug(`🏠 Adding user ${requestData.toUserId} to ${sharedHomeIds.length} home(s)`);
    
    // Fetch all homes in parallel
    const homeDocsPromises = sharedHomeIds.map((homeId: string) => getDoc(doc(db, 'homes', homeId)));
    const homeDocs = await Promise.all(homeDocsPromises);
    
    // Prepare updates for homes where user is not already a member
    const homeUpdatePromises = homeDocs
      .map((homeDoc, index) => {
        const homeId = sharedHomeIds[index];
        
        if (!homeDoc.exists()) {
          logger.warn(`⚠️ Home ${homeId} not found, skipping member add`);
          return null;
        }
        
        const homeData = homeDoc.data();
        const currentMembers = homeData.members || [];
        
        // Check if user is already a member
        if (currentMembers.includes(requestData.toUserId)) {
          logger.debug(`✅ User ${requestData.toUserId} already a member of ${homeId}`);
          return null;
        }
        
        // Return the update promise
        return updateDoc(doc(db, 'homes', homeId), {
          members: arrayUnion(requestData.toUserId)
        });
      })
      .filter(promise => promise !== null);
    
    try {
      // Check for existing friendship to prevent duplicates (parallel queries)
      logger.debug('🔄 Step 0: Checking for existing friendship...');
      const [existingFriendship1, existingFriendship2] = await Promise.all([
        getDocs(query(
          collection(db, 'friends'),
          where('userId', '==', requestData.fromUserId),
          where('friendUserId', '==', requestData.toUserId)
        )),
        getDocs(query(
          collection(db, 'friends'),
          where('userId', '==', requestData.toUserId),
          where('friendUserId', '==', requestData.fromUserId)
        ))
      ]);
      
      if (!existingFriendship1.empty || !existingFriendship2.empty) {
        logger.warn('⚠️ Friendship already exists, updating with new zones');
        
        // Update existing friendships to add new zones
        if (!existingFriendship1.empty) {
          const existingDoc1 = existingFriendship1.docs[0];
          const existingData1 = existingDoc1.data();
          const existingSharedHomes = existingData1.sharedHomes || [];
          const existingActiveHomes = existingData1.activeHomes || [];
          
          // Merge new zones with existing ones
          const updatedSharedHomes = [...new Set([...existingSharedHomes, ...sharedHomeIds])];
          const updatedActiveHomes = [...new Set([...existingActiveHomes, ...sharedHomeIds])];
          
          await updateDoc(doc(db, 'friends', existingDoc1.id), {
            sharedHomes: updatedSharedHomes,
            activeHomes: updatedActiveHomes,
          });
          logger.debug('✅ Updated friend document 1 with new zones');
        }
        
        if (!existingFriendship2.empty) {
          const existingDoc2 = existingFriendship2.docs[0];
          const existingData2 = existingDoc2.data();
          const existingSharedHomes = existingData2.sharedHomes || [];
          const existingActiveHomes = existingData2.activeHomes || [];
          
          // Merge new zones with existing ones
          const updatedSharedHomes = [...new Set([...existingSharedHomes, ...sharedHomeIds])];
          const updatedActiveHomes = [...new Set([...existingActiveHomes, ...sharedHomeIds])];
          
          await updateDoc(doc(db, 'friends', existingDoc2.id), {
            sharedHomes: updatedSharedHomes,
            activeHomes: updatedActiveHomes,
          });
          logger.debug('✅ Updated friend document 2 with new zones');
        }
        
        await deleteDoc(doc(db, 'friendRequests', requestId));
        logger.debug('✅ Deleted friend request after updating existing friendship');
        return;
      }
      
      // Execute friend creation and request deletion in parallel
      logger.debug('🔄 Steps 1-3: Creating friend documents and deleting request (parallel)...');
      logger.debug('📋 Friend doc 1 data:', JSON.stringify(friendDoc1, null, 2));
      logger.debug('📋 Friend doc 2 data:', JSON.stringify(friendDoc2, null, 2));
      
      await Promise.all([
        addDoc(collection(db, 'friends'), friendDoc1),
        addDoc(collection(db, 'friends'), friendDoc2),
        deleteDoc(doc(db, 'friendRequests', requestId))
      ]);
      
      logger.debug('✅ Steps 1-3 complete: Friend documents created and request deleted');
      
      // Clean up notification tracking for this request
      const currentUser = auth.currentUser;
      if (currentUser) {
        const NOTIFIED_KEY = `@friendzone_notified_requests_${currentUser.uid}`;
        try {
          const stored = await AsyncStorage.getItem(NOTIFIED_KEY);
          if (stored) {
            const notifiedIds = JSON.parse(stored);
            const filtered = notifiedIds.filter((id: string) => id !== requestId);
            await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(filtered));
            logger.debug('🧹 Cleaned up notification tracking for accepted request');
          }
        } catch (storageError) {
          logger.error('Error cleaning up notification tracking:', storageError);
        }
      }
      
      logger.debug('🔄 Step 4: Adding user to home members (parallel)...');
      logger.debug('🏠 Home update details:', {
        sharedHomeIds,
        homeUpdatePromises: homeUpdatePromises.length,
        toUserId: requestData.toUserId,
        currentAuthUser: auth.currentUser?.uid
      });
      
      // Try to add user to home members in parallel, but don't fail the whole operation if it fails
      // This can fail due to Firestore permissions if the accepting user isn't the zone creator
      const homeResults = await Promise.allSettled(homeUpdatePromises);
      
      const failedHomes = homeResults.filter((result, i) => {
        if (result.status === 'rejected') {
          logger.warn(`⚠️ Could not add to home ${sharedHomeIds[i]}:`, result.reason);
          logger.warn('This is expected if you are not the zone creator. The zone will still work through the friend relationship.');
          return true;
        }
        logger.debug(`✅ Added to home ${sharedHomeIds[i]}`);
        return false;
      });
      
      if (failedHomes.length > 0) {
        logger.debug(`⚠️ Step 4 complete with warnings: ${failedHomes.length}/${homeUpdatePromises.length} home memberships could not be updated (this is OK)`);
      } else {
        logger.debug('✅ Step 4 complete: All home memberships updated');
      }
      
      // Check location in background (non-blocking) after accepting friend request
      const { checkLocationAndUpdateZones } = await import('./locationService');
      checkLocationAndUpdateZones().catch(error => {
        logger.error('Background location check failed:', error);
        // Don't throw - this is a background operation
      });
      
      // Send notification to the original requester that their request was accepted
      try {
        const { sendFriendRequestAcceptedNotification } = await import('./notificationService');
        
        // Get zone names for the shared zones
        const sharedZoneNames: string[] = [];
        for (const homeId of sharedHomeIds) {
          try {
            const homeDoc = await getDoc(doc(db, 'homes', homeId));
            if (homeDoc.exists()) {
              sharedZoneNames.push(homeDoc.data().name);
            }
          } catch (homeError) {
            logger.warn(`Could not get name for home ${homeId}:`, homeError);
          }
        }
        
        await sendFriendRequestAcceptedNotification(
          requestData.fromUserId, 
          toUser.name, 
          sharedZoneNames,
          sharedHomeIds[0] // Pass first zone ID for navigation
        );
        logger.debug(`📬 Sent acceptance notification to ${fromUser.name}`);
      } catch (notificationError) {
        logger.error('Error sending acceptance notification:', notificationError);
        // Don't fail the whole operation if notification fails
      }
      
      logger.debug('✅ Friend request accepted successfully - all operations completed');
    } catch (batchError: any) {
      logger.error('❌ Operation failed:', batchError);
      logger.error('Error details:', {
        code: batchError.code,
        message: batchError.message,
        stack: batchError.stack
      });
      
      // Try to identify which operation failed
      if (batchError.message?.includes('permission')) {
        logger.error('🔒 Permission error - likely Firestore rules issue');
      }
      
      throw new Error(`Failed to complete friend request acceptance: ${batchError.message}`);
    }
  } catch (error) {
    logger.error('❌ Error accepting friend request:', error);
    throw error;
  }
};

// Update friend's last known location for proximity detection
export const updateFriendLocation = async (
  userId: string,
  location: { latitude: number; longitude: number }
) => {
  try {
    const friendsRef = collection(db, 'friends');
    // Find all friend documents where this user is the friend
    const q = query(friendsRef, where('friendUserId', '==', userId));
    const querySnapshot = await getDocs(q);

    const batch = writeBatch(db);
    querySnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        lastKnownLocation: {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: Date.now(),
        },
      });
    });

    await batch.commit();
    logger.debug(`📍 Updated location for ${querySnapshot.docs.length} friend documents`);
  } catch (error) {
    logger.error('Error updating friend location:', error);
  }
};

export const rejectFriendRequest = async (requestId: string) => {
  try {
    logger.debug('🚫 Rejecting friend request:', requestId);
    
    // Delete the request entirely instead of just marking as rejected
    await deleteDoc(doc(db, 'friendRequests', requestId));
    logger.debug('✅ Friend request deleted successfully');
    
    // Clean up notification tracking for this request
    const currentUser = auth.currentUser;
    if (currentUser) {
      const NOTIFIED_KEY = `@friendzone_notified_requests_${currentUser.uid}`;
      try {
        const stored = await AsyncStorage.getItem(NOTIFIED_KEY);
        if (stored) {
          const notifiedIds = JSON.parse(stored);
          const filtered = notifiedIds.filter((id: string) => id !== requestId);
          await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(filtered));
          logger.debug('🧹 Cleaned up notification tracking for rejected request');
        }
      } catch (storageError) {
        logger.error('Error cleaning up notification tracking:', storageError);
      }
    }
  } catch (error) {
    logger.error('❌ Error rejecting friend request:', error);
    throw error;
  }
};

export const cancelFriendRequest = async (requestId: string) => {
  try {
    await deleteDoc(doc(db, 'friendRequests', requestId));
    logger.debug('Friend request cancelled');
  } catch (error) {
    logger.error('Error cancelling friend request:', error);
    throw error;
  }
};

export const subscribeToFriendRequests = async (userId: string, callback: (requests: any[]) => void) => {
  // Get user's phone number to also check for requests sent to phone
  const userData = await getUserData(userId);
  const userPhone = userData?.phoneNumber;
  
  logger.debug(`🔍 Setting up friend request listener for userId: ${userId}, phone: ${userPhone}`);
  
  // Query 1: Requests sent to user ID
  const q1 = query(
    collection(db, 'friendRequests'),
    where('toUserId', '==', userId),
    where('status', '==', 'pending')
  );
  
  // Query 2: Requests sent to phone number (if user has phone)
  let q2 = null;
  if (userPhone) {
    q2 = query(
      collection(db, 'friendRequests'),
      where('toPhoneNumber', '==', userPhone),
      where('status', '==', 'pending')
    );
  }
  
  const allRequests = new Map();
  
  // Load previously notified request IDs from AsyncStorage
  const NOTIFIED_KEY = `@friendzone_notified_requests_${userId}`;
  const notifiedRequestIds = new Set<string>();
  try {
    const stored = await AsyncStorage.getItem(NOTIFIED_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      parsed.forEach((id: string) => notifiedRequestIds.add(id));
      logger.debug(`📦 Loaded ${notifiedRequestIds.size} previously notified request IDs`);
    }
  } catch (error) {
    logger.error('Error loading notified request IDs:', error);
  }
  
  const updateRequests = async () => {
    const requests = Array.from(allRequests.values());
    logger.debug(`📬 Found ${requests.length} incoming friend requests`);
    
    // Send notification only for requests we haven't notified about yet
    let newNotifications = false;
    for (const request of requests) {
      if (!notifiedRequestIds.has(request.id)) {
        try {
          const { sendFriendRequestNotification } = await import('./notificationService');
          const homes = await getHomesByIds(request.homeIds || []);
          const homeNames = homes.map(home => home.name);
          
          await sendFriendRequestNotification(userId, request.fromUserName, homeNames);
          logger.debug(`📬 Sent notification for friend request from ${request.fromUserName} (ID: ${request.id})`);
          
          // Mark this request as notified
          notifiedRequestIds.add(request.id);
          newNotifications = true;
        } catch (error) {
          logger.error('Error sending friend request notification:', error);
        }
      }
    }
    
    // Save updated notified IDs to AsyncStorage if we sent any new notifications
    if (newNotifications) {
      try {
        await AsyncStorage.setItem(NOTIFIED_KEY, JSON.stringify(Array.from(notifiedRequestIds)));
        logger.debug(`💾 Saved ${notifiedRequestIds.size} notified request IDs to storage`);
      } catch (error) {
        logger.error('Error saving notified request IDs:', error);
      }
    }
    
    callback(requests);
  };
  
  // Listen to user ID requests
  const unsubscribe1 = onSnapshot(q1, (querySnapshot) => {
    logger.debug(`📬 User ID query found ${querySnapshot.docs.length} requests`);
    
    // Clear and rebuild the map to remove deleted requests
    allRequests.clear();
    
    querySnapshot.docs.forEach(doc => {
      allRequests.set(doc.id, {
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      });
    });
    updateRequests();
  });
  
  // Listen to phone number requests (if applicable)
  let unsubscribe2 = () => {};
  if (q2) {
    unsubscribe2 = onSnapshot(q2, (querySnapshot) => {
      logger.debug(`📬 Phone query found ${querySnapshot.docs.length} requests`);
      
      // Add phone requests to the map (don't clear - q1 already did)
      querySnapshot.docs.forEach(doc => {
        allRequests.set(doc.id, {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        });
      });
      updateRequests();
    });
  }
  
  // Return combined unsubscribe function
  return () => {
    unsubscribe1();
    unsubscribe2();
  };
};

export const subscribeToOutgoingFriendRequests = (userId: string, callback: (requests: any[]) => void) => {
  const q = query(
    collection(db, 'friendRequests'),
    where('fromUserId', '==', userId),
    where('status', '==', 'pending')
  );
  
  return onSnapshot(q, (querySnapshot) => {
    const requests = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));
    callback(requests);
  });
};

// Real-time listeners
export const subscribeToUserFriends = (userId: string, callback: (friends: Friend[]) => void) => {
  logger.debug('🔍 subscribeToUserFriends: Setting up listener for userId:', userId);
  
  try {
    const q = query(
      collection(db, 'friends'), 
      where('userId', '==', userId)
    );
    
    const friendLocationUnsubscribes: (() => void)[] = [];
    
    const mainUnsubscribe = onSnapshot(q, (querySnapshot) => {
      try {
    logger.debug(`🔍 subscribeToUserFriends [${userId}]: Query snapshot received, docs count:`, querySnapshot.docs.length);
    if (querySnapshot.docs.length === 0) {
      logger.debug(`❌ No friend documents found for userId: ${userId}`);
      callback([]);
      return;
    }
    
    // Clean up previous friend location listeners
    friendLocationUnsubscribes.forEach(unsubscribe => unsubscribe());
    friendLocationUnsubscribes.length = 0;
    
    const friendsData: Friend[] = [];
    let processedCount = 0;
    const totalFriends = querySnapshot.docs.length;
    
    querySnapshot.docs.forEach((docSnapshot) => {
      const friendData = docSnapshot.data();
      logger.debug('Friend doc:', docSnapshot.id, friendData);
      
      // Check if friendUserId exists
      if (!friendData.friendUserId) {
        logger.debug(`Friend ${friendData.name} missing friendUserId - skipping location fetch`);
        friendsData.push({
          id: docSnapshot.id,
          ...friendData,
          isCurrentlyAtHome: false,
          currentHomeId: null,
        } as any);
        
        processedCount++;
        if (processedCount === totalFriends) {
          callback(friendsData);
        }
        return;
      }

      logger.debug(`🔍 Setting up real-time listener for ${friendData.name} with ID: ${friendData.friendUserId}`);
      
      // Set up real-time listener for friend's location
      const friendUserUnsubscribe = onSnapshot(
        doc(db, 'users', friendData.friendUserId),
        (friendUserDoc) => {
          let locationData = {};
          
          if (friendUserDoc.exists()) {
            const userData = friendUserDoc.data();
            logger.debug(`📖 Real-time update for ${friendData.name}:`, {
              isAtHome: userData.isAtHome,
              currentHomeIds: userData.currentHomeIds,
              lastSeen: userData.lastSeen
            });
            locationData = {
              isCurrentlyAtHome: userData.isAtHome || false,
              currentHomeIds: userData.currentHomeIds || [],
              lastSeen: userData.lastSeen || null,
              broadcastLocation: userData.broadcastLocation || null,
              broadcastMessage: userData.broadcastMessage || null,
              broadcastTimestamp: userData.broadcastTimestamp || null,
            };
          } else {
            logger.debug(`User document not found for friend ${friendData.name} (${friendData.friendUserId})`);
          }
          
          // Update or add this friend's data
          const friendIndex = friendsData.findIndex(f => f.id === docSnapshot.id);
          const updatedFriend = {
            id: docSnapshot.id,
            ...friendData,
            ...locationData,
          } as Friend;
          
          if (friendIndex >= 0) {
            friendsData[friendIndex] = updatedFriend;
          } else {
            friendsData.push(updatedFriend);
          }
          
          processedCount++;
          if (processedCount >= totalFriends) {
            logger.debug('🔄 Real-time friends update:', friendsData.length, 'friends');
            callback([...friendsData]);
          }
        },
        (error) => {
          // Silently handle permission errors (e.g., when user signs out)
          if (error.code === 'permission-denied') {
            logger.debug(`Friend location listener closed (user signed out): ${friendData.name}`);
          } else {
            logger.error(`Error in friend location listener for ${friendData.name}:`, error);
          }
          processedCount++;
          if (processedCount >= totalFriends) {
            callback([...friendsData]);
          }
        }
      );
      
      friendLocationUnsubscribes.push(friendUserUnsubscribe);
    });
      } catch (snapshotError) {
        logger.error('🔍 subscribeToUserFriends: Error processing snapshot:', snapshotError);
        callback([]);
      }
    }, (error) => {
      logger.error('🔍 subscribeToUserFriends: Firebase listener error:', error);
      callback([]);
    });
    
    // Return a composite unsubscribe function that cleans up everything
    return () => {
      logger.debug('🔍 subscribeToUserFriends: Unsubscribing all listeners');
      mainUnsubscribe();
      friendLocationUnsubscribes.forEach(unsubscribe => unsubscribe());
      friendLocationUnsubscribes.length = 0;
    };
  } catch (setupError) {
    logger.error('🔍 subscribeToUserFriends: Error setting up listener:', setupError);
    // Return a dummy unsubscribe function
    return () => {};
  }
};

export const subscribeToUserHomes = (userId: string, callback: (homes: Home[]) => void) => {
  // Query for homes where user is a member
  const memberQuery = query(
    collection(db, 'homes'), 
    where('members', 'array-contains', userId)
  );
  
  // Subscribe to homes where user is a member
  const memberUnsubscribe = onSnapshot(memberQuery, async (memberSnapshot) => {
    const memberHomes = memberSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as Home[];
    
    // Also get homes from friend relationships
    try {
      const friendsQuery = query(
        collection(db, 'friends'),
        where('userId', '==', userId),
        where('status', '==', 'connected')
      );
      
      const friendsSnapshot = await getDocs(friendsQuery);
      const sharedHomeIds = new Set<string>();
      
      friendsSnapshot.docs.forEach(doc => {
        const friendData = doc.data();
        const friendSharedHomes = friendData.sharedHomes || [];
        friendSharedHomes.forEach((homeId: string) => {
          sharedHomeIds.add(homeId);
        });
      });
      
      // Fetch homes that are shared through friends but not in members
      const friendOnlyHomeIds = Array.from(sharedHomeIds).filter(id => 
        !memberHomes.find(h => h.id === id)
      );
      
      if (friendOnlyHomeIds.length > 0) {
        const friendHomes = await getHomesByIds(friendOnlyHomeIds);
        const combinedHomes = [...memberHomes, ...friendHomes];
        callback(combinedHomes);
      } else {
        callback(memberHomes);
      }
    } catch (error) {
      logger.error('Error fetching friend homes:', error);
      // Fall back to just member homes
      callback(memberHomes);
    }
  });
  
  // Return unsubscribe function
  return () => {
    memberUnsubscribe();
  };
};

export const updateFriendSharedHomes = async (
  currentUserId: string,
  friendUserId: string,
  newSharedHomes: string[],
  proximityRadius: number | null = null
) => {
  logger.debug(`🔄 Updating shared homes for friendship: ${currentUserId} <-> ${friendUserId}`);
  logger.debug('New shared homes:', newSharedHomes);
  logger.debug('Proximity radius:', proximityRadius);
  
  // Find ALL friend documents for this friendship (there might be multiple)
  const friendsQuery1 = query(
    collection(db, 'friends'),
    where('userId', '==', currentUserId),
    where('friendUserId', '==', friendUserId)
  );
  
  const friendsQuery2 = query(
    collection(db, 'friends'),
    where('userId', '==', friendUserId),
    where('friendUserId', '==', currentUserId)
  );
  
  const [snapshot1, snapshot2] = await Promise.all([
    getDocs(friendsQuery1),
    getDocs(friendsQuery2)
  ]);
  
  const updatePromises: Promise<any>[] = [];
  
  // Prepare update data
  const updateData: any = {
    sharedHomes: newSharedHomes,
    updatedAt: serverTimestamp()
  };
  
  // Add proximity alert settings if provided, otherwise remove them
  if (proximityRadius !== null && proximityRadius > 0) {
    updateData.proximityAlertEnabled = true;
    updateData.proximityAlertRadius = proximityRadius;
  } else {
    updateData.proximityAlertEnabled = false;
    updateData.proximityAlertRadius = null;
  }
  
  // Update ALL friend documents in direction 1 (currentUser -> friend)
  logger.debug(`📄 Found ${snapshot1.docs.length} documents for ${currentUserId} -> ${friendUserId}`);
  snapshot1.docs.forEach((friendDoc, index) => {
    updatePromises.push(
      updateDoc(doc(db, 'friends', friendDoc.id), updateData)
    );
    logger.debug(`🔄 Updating document ${index + 1}: ${friendDoc.id}`);
  });
  
  // Update ALL friend documents in direction 2 (friend -> currentUser)
  logger.debug(`📄 Found ${snapshot2.docs.length} documents for ${friendUserId} -> ${currentUserId}`);
  snapshot2.docs.forEach((friendDoc, index) => {
    updatePromises.push(
      updateDoc(doc(db, 'friends', friendDoc.id), updateData)
    );
    logger.debug(`🔄 Updating document ${index + 1}: ${friendDoc.id}`);
  });
  
  logger.debug(`📊 Total documents to update: ${updatePromises.length}`);
  await Promise.all(updatePromises);
  logger.debug('✅ Successfully updated ALL friend documents');
  
  // Add a small delay to ensure Firebase propagation
  await new Promise(resolve => setTimeout(resolve, 500));
  logger.debug('⏰ Firebase propagation delay complete');
};

/**
 * Delete a friendship (removes both sides of the relationship)
 */
export const deleteFriend = async (
  currentUserId: string,
  friendUserId: string
): Promise<void> => {
  logger.debug(`🗑️ Deleting friendship: ${currentUserId} <-> ${friendUserId}`);
  
  try {
    // Find ALL friend documents for this friendship
    const friendsQuery1 = query(
      collection(db, 'friends'),
      where('userId', '==', currentUserId),
      where('friendUserId', '==', friendUserId)
    );
    
    const friendsQuery2 = query(
      collection(db, 'friends'),
      where('userId', '==', friendUserId),
      where('friendUserId', '==', currentUserId)
    );
    
    const [snapshot1, snapshot2] = await Promise.all([
      getDocs(friendsQuery1),
      getDocs(friendsQuery2)
    ]);
    
    const deletePromises: Promise<any>[] = [];
    
    // Delete ALL friend documents in direction 1 (currentUser -> friend)
    logger.debug(`📄 Found ${snapshot1.docs.length} documents for ${currentUserId} -> ${friendUserId}`);
    snapshot1.docs.forEach((friendDoc) => {
      deletePromises.push(deleteDoc(doc(db, 'friends', friendDoc.id)));
      logger.debug(`🗑️ Deleting document: ${friendDoc.id}`);
    });
    
    // Delete ALL friend documents in direction 2 (friend -> currentUser)
    logger.debug(`📄 Found ${snapshot2.docs.length} documents for ${friendUserId} -> ${currentUserId}`);
    snapshot2.docs.forEach((friendDoc) => {
      deletePromises.push(deleteDoc(doc(db, 'friends', friendDoc.id)));
      logger.debug(`🗑️ Deleting document: ${friendDoc.id}`);
    });
    
    logger.debug(`📊 Total documents to delete: ${deletePromises.length}`);
    await Promise.all(deletePromises);
    logger.debug('✅ Successfully deleted friendship');
  } catch (error) {
    logger.error('❌ Error deleting friendship:', error);
    throw error;
  }
};

// ==========================================
// ZONE REQUEST FUNCTIONS (Mutual Consent)
// ==========================================

/**
 * Send a zone sharing request to a friend
 */
export const sendZoneRequest = async (
  fromUserId: string,
  toUserId: string,
  fromUserName: string,
  toUserName: string,
  requestType: 'add' | 'remove',
  zoneIds: string[],
  zoneNames: string[],
  message?: string
): Promise<string> => {
  try {
    logger.debug('📤 Sending zone request:', { fromUserId, toUserId, requestType, zoneIds });
    logger.debug('🔐 Current user auth:', auth.currentUser?.uid);
    
    const zoneRequestData = {
      fromUserId,
      toUserId,
      fromUserName,
      toUserName,
      status: 'pending' as const,
      requestType,
      zoneIds,
      zoneNames,
      message: message || '',
      createdAt: serverTimestamp(),
    };

    logger.debug('📋 Zone request data:', zoneRequestData);
    logger.debug('🎯 Attempting to write to collection: zoneRequests');

    const docRef = await addDoc(collection(db, 'zoneRequests'), zoneRequestData);
    logger.debug('✅ Zone request sent with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    logger.error('❌ Error sending zone request:', error);
    logger.error('❌ Error details:', JSON.stringify(error, null, 2));
    throw error;
  }
};

/**
 * Subscribe to incoming zone requests for a user
 */
export const subscribeToZoneRequests = (
  userId: string,
  callback: (requests: ZoneRequest[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'zoneRequests'),
    where('toUserId', '==', userId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const requests: ZoneRequest[] = [];
    snapshot.forEach((doc) => {
      requests.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as ZoneRequest);
    });
    callback(requests);
  });
};

/**
 * Accept a zone request and update shared zones
 */
export const acceptZoneRequest = async (
  requestId: string,
  selectedZoneIds?: string[]
): Promise<void> => {
  try {
    logger.debug('✅ Accepting zone request:', requestId);
    
    // Get the request details
    const requestDoc = await getDoc(doc(db, 'zoneRequests', requestId));
    if (!requestDoc.exists()) {
      throw new Error('Zone request not found');
    }
    
    const request = requestDoc.data() as ZoneRequest;
    const zonesToProcess = selectedZoneIds || request.zoneIds;
    
    // Update the request status
    await updateDoc(doc(db, 'zoneRequests', requestId), {
      status: 'accepted',
      acceptedZoneIds: zonesToProcess,
    });
    
    // Update shared zones for both users
    if (request.requestType === 'add') {
      // Add zones to both users' friend relationships
      await addZonesToFriendship(request.fromUserId, request.toUserId, zonesToProcess);
    } else {
      // Remove zones from both users' friend relationships
      await removeZonesFromFriendship(request.fromUserId, request.toUserId, zonesToProcess);
    }
    
    logger.debug('✅ Zone request accepted and zones updated');
  } catch (error) {
    logger.error('❌ Error accepting zone request:', error);
    throw error;
  }
};

/**
 * Reject a zone request
 */
export const rejectZoneRequest = async (requestId: string): Promise<void> => {
  try {
    await updateDoc(doc(db, 'zoneRequests', requestId), {
      status: 'rejected',
    });
    logger.debug('✅ Zone request rejected:', requestId);
  } catch (error) {
    logger.error('❌ Error rejecting zone request:', error);
    throw error;
  }
};

/**
 * Helper: Add zones to friendship (both directions)
 */
const addZonesToFriendship = async (
  userId1: string,
  userId2: string,
  zoneIds: string[]
): Promise<void> => {
  const batch = writeBatch(db);
  
  // Find and update friendship documents in both directions
  const friendsQuery1 = query(
    collection(db, 'friends'),
    where('userId', '==', userId1),
    where('friendUserId', '==', userId2)
  );
  
  const friendsQuery2 = query(
    collection(db, 'friends'),
    where('userId', '==', userId2),
    where('friendUserId', '==', userId1)
  );
  
  const [snapshot1, snapshot2] = await Promise.all([
    getDocs(friendsQuery1),
    getDocs(friendsQuery2)
  ]);
  
  // Update user1's friend document
  snapshot1.forEach((doc) => {
    const currentSharedHomes = doc.data().sharedHomes || [];
    const newSharedHomes = [...new Set([...currentSharedHomes, ...zoneIds])];
    batch.update(doc.ref, { sharedHomes: newSharedHomes });
  });
  
  // Update user2's friend document
  snapshot2.forEach((doc) => {
    const currentSharedHomes = doc.data().sharedHomes || [];
    const newSharedHomes = [...new Set([...currentSharedHomes, ...zoneIds])];
    batch.update(doc.ref, { sharedHomes: newSharedHomes });
  });
  
  await batch.commit();
};

/**
 * Helper: Remove zones from friendship (both directions)
 */
const removeZonesFromFriendship = async (
  userId1: string,
  userId2: string,
  zoneIds: string[]
): Promise<void> => {
  const batch = writeBatch(db);
  
  // Find and update friendship documents in both directions
  const friendsQuery1 = query(
    collection(db, 'friends'),
    where('userId', '==', userId1),
    where('friendUserId', '==', userId2)
  );
  
  const friendsQuery2 = query(
    collection(db, 'friends'),
    where('userId', '==', userId2),
    where('friendUserId', '==', userId1)
  );
  
  const [snapshot1, snapshot2] = await Promise.all([
    getDocs(friendsQuery1),
    getDocs(friendsQuery2)
  ]);
  
  // Update user1's friend document
  snapshot1.forEach((doc) => {
    const currentSharedHomes = doc.data().sharedHomes || [];
    const newSharedHomes = currentSharedHomes.filter((id: string) => !zoneIds.includes(id));
    batch.update(doc.ref, { sharedHomes: newSharedHomes });
  });
  
  // Update user2's friend document
  snapshot2.forEach((doc) => {
    const currentSharedHomes = doc.data().sharedHomes || [];
    const newSharedHomes = currentSharedHomes.filter((id: string) => !zoneIds.includes(id));
    batch.update(doc.ref, { sharedHomes: newSharedHomes });
  });
  
  await batch.commit();
};

/**
 * Get friend's active zones for bidirectional checking
 */
export const getFriendActiveZones = async (
  friendUserId: string,
  myUserId: string
): Promise<string[]> => {
  try {
    // Find the friend's document where they have me as a friend
    const friendsQuery = query(
      collection(db, 'friends'),
      where('userId', '==', friendUserId),
      where('friendUserId', '==', myUserId)
    );
    
    const snapshot = await getDocs(friendsQuery);
    
    if (!snapshot.empty) {
      const friendDoc = snapshot.docs[0];
      const friendData = friendDoc.data();
      return friendData.activeHomes || friendData.sharedHomes || [];
    }
    
    return [];
  } catch (error) {
    logger.error('❌ Error getting friend active zones:', error);
    return [];
  }
};

/**
 * Get zone details for zones you don't own (shared zones from friends)
 */
export const getSharedZoneDetails = async (zoneIds: string[]): Promise<{[key: string]: Home}> => {
  try {
    if (zoneIds.length === 0) return {};
    
    logger.debug('🏠 Loading shared zone details for IDs:', zoneIds);
    
    const zoneDetails: {[key: string]: Home} = {};
    
    // Query homes collection for the zone IDs
    const homesQuery = query(
      collection(db, 'homes'),
      where('__name__', 'in', zoneIds.slice(0, 10)) // Firestore 'in' limit is 10
    );
    
    const snapshot = await getDocs(homesQuery);
    
    snapshot.forEach((doc) => {
      const homeData = doc.data();
      zoneDetails[doc.id] = {
        id: doc.id,
        name: homeData.name,
        location: homeData.location,
        radius: homeData.radius,
        createdBy: homeData.createdBy,
        members: homeData.members || [],
        createdAt: homeData.createdAt?.toDate() || new Date(),
      } as Home;
    });
    
    // For zones that weren't found, create placeholder entries
    const foundIds = Object.keys(zoneDetails);
    const missingIds = zoneIds.filter(id => !foundIds.includes(id));
    
    if (missingIds.length > 0) {
      logger.debug('⚠️ Missing zone details for:', missingIds);
      missingIds.forEach(id => {
        zoneDetails[id] = {
          id,
          name: `Zone ${id.slice(0, 8)}...`, // Show first 8 chars + ...
          location: { latitude: 0, longitude: 0, address: 'Unknown' },
          radius: 1,
          createdBy: 'unknown',
          members: [],
          createdAt: new Date(),
        } as Home;
      });
    }
    
    logger.debug('✅ Loaded shared zone details:', Object.keys(zoneDetails));
    return zoneDetails;
  } catch (error) {
    logger.error('❌ Error loading shared zone details:', error);
    return {};
  }
};
