import { auth, db } from '../../firebaseConfig';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { sendFriendZoneArrivalNotification } from './notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const FRIEND_LOCATION_STATE_KEY = '@friendzone_friend_locations';

// Track friend locations to detect arrivals (in-memory cache)
const friendLocationState = new Map<string, {
  zoneId: string | null, 
  isAtHome: boolean,
  initialized: boolean // Track if we've seen the first state (don't notify on app startup)
}>();

/**
 * Load friend location state from persistent storage
 */
async function loadFriendLocationState(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(FRIEND_LOCATION_STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      Object.entries(parsed).forEach(([friendId, state]: [string, any]) => {
        friendLocationState.set(friendId, state);
      });
      logger.debug(`📦 Loaded ${friendLocationState.size} friend location states from storage`);
    }
  } catch (error) {
    logger.error('Error loading friend location state:', error);
  }
}

/**
 * Save friend location state to persistent storage
 */
async function saveFriendLocationState(): Promise<void> {
  try {
    const stateObj: any = {};
    friendLocationState.forEach((state, friendId) => {
      stateObj[friendId] = state;
    });
    await AsyncStorage.setItem(FRIEND_LOCATION_STATE_KEY, JSON.stringify(stateObj));
  } catch (error) {
    logger.error('Error saving friend location state:', error);
  }
}

/**
 * Subscribe to friend location changes and send notifications when they arrive at shared zones
 */
export function subscribeFriendLocationNotifications(userId: string): () => void {
  logger.debug('📡 Setting up friend location notifications for user:', userId);
  
  // Load previous state from storage
  loadFriendLocationState();
  
  // Query for user's friends
  const friendsQuery = query(
    collection(db, 'friends'),
    where('userId', '==', userId)
  );
  
  const unsubscribeFriends = onSnapshot(friendsQuery, async (friendsSnapshot) => {
    logger.debug(`👥 Found ${friendsSnapshot.docs.length} friends to monitor`);
    
    // For each friend, subscribe to their location updates
    friendsSnapshot.docs.forEach(friendDoc => {
      const friendData = friendDoc.data();
      const friendUserId = friendData.friendUserId;
      const friendName = friendData.name || 'Unknown';
      const friendPhone = friendData.phoneNumber;
      const sharedHomes = friendData.sharedHomes || [];
      
      if (!friendUserId) return;
      
      // Subscribe to this friend's user document for location updates
      const friendUserQuery = query(
        collection(db, 'users'),
        where('__name__', '==', friendUserId)
      );
      
      onSnapshot(friendUserQuery, async (userSnapshot) => {
        if (userSnapshot.empty) return;
        
        const userData = userSnapshot.docs[0].data();
        const currentZoneId = userData.currentHomeId;
        const isAtHome = userData.isAtHome;
        
        // Get previous state
        const previousState = friendLocationState.get(friendUserId);
        
        // Detect friend arrival at a shared zone
        if (isAtHome && currentZoneId && sharedHomes.includes(currentZoneId)) {
          // Check if this is a new arrival (wasn't at this zone before)
          const isNewArrival = previousState && previousState.initialized && 
                               (previousState.zoneId !== currentZoneId || !previousState.isAtHome);
          
          // Only notify if we've seen them before (initialized) AND they just arrived
          if (isNewArrival) {
            logger.debug(`🔔 Friend arrival detected: ${friendName} at zone ${currentZoneId}`);
            
            // CRITICAL: Only notify if YOU are also at this zone
            const { getDoc, doc } = await import('firebase/firestore');
            const myUserDoc = await getDoc(doc(db, 'users', userId));
            const myCurrentZoneId = myUserDoc.data()?.currentHomeId;
            const myIsAtHome = myUserDoc.data()?.isAtHome;
            
            if (myIsAtHome && myCurrentZoneId === currentZoneId) {
              logger.debug(`✅ You are also at ${currentZoneId} - sending notification`);
              // Get zone name and send notification
              getZoneName(currentZoneId).then(zoneName => {
                if (zoneName) {
                  sendFriendZoneArrivalNotification(userId, friendName, zoneName, friendPhone);
                }
              });
            } else {
              logger.debug(`⏭️ Skipping notification - you are not at ${currentZoneId}`);
            }
          }
          
          // Update state - mark as initialized
          friendLocationState.set(friendUserId, {
            zoneId: currentZoneId || null,
            isAtHome: isAtHome || false,
            initialized: true
          });
        } else {
          // Friend left or not at a shared zone - update state
          friendLocationState.set(friendUserId, {
            zoneId: currentZoneId || null,
            isAtHome: isAtHome || false,
            initialized: true
          });
        }
        
        // Persist state to storage
        saveFriendLocationState();
      });
    });
  });
  
  return unsubscribeFriends;
}

/**
 * Get zone name from zone ID
 */
async function getZoneName(zoneId: string): Promise<string | null> {
  try {
    const { getDoc, doc } = await import('firebase/firestore');
    const zoneDoc = await getDoc(doc(db, 'homes', zoneId));
    if (zoneDoc.exists()) {
      return zoneDoc.data().name;
    }
    return null;
  } catch (error) {
    logger.error('Error getting zone name:', error);
    return null;
  }
}

/**
 * Clear friend location state (call on logout)
 */
export function clearFriendLocationState(): void {
  friendLocationState.clear();
  logger.debug('🧹 Cleared friend location state');
}
