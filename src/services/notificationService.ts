import * as Notifications from 'expo-notifications';
import { Platform, Linking } from 'react-native';
import { auth, db } from '../../firebaseConfig';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { logger } from '../utils/logger';

// Notification deduplication cache
const recentNotifications = new Map<string, number>();
const NOTIFICATION_COOLDOWN = 60000; // 1 minute cooldown for duplicate notifications

/**
 * Check if a notification was recently sent
 */
function isRecentNotification(key: string): boolean {
  const lastSent = recentNotifications.get(key);
  if (lastSent && Date.now() - lastSent < NOTIFICATION_COOLDOWN) {
    logger.debug(`⏭️ Skipping duplicate notification: ${key}`);
    return true;
  }
  recentNotifications.set(key, Date.now());
  
  // Clean up old entries
  if (recentNotifications.size > 100) {
    const now = Date.now();
    for (const [k, time] of recentNotifications.entries()) {
      if (now - time > NOTIFICATION_COOLDOWN) {
        recentNotifications.delete(k);
      }
    }
  }
  
  return false;
}

/**
 * Configure notification behavior
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions and set up notification categories
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.debug('Notification permissions not granted');
      return false;
    }

    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF5A5F',
      });
    }

    // Set up notification categories with actions
    await Notifications.setNotificationCategoryAsync('friend_arrival', [
      {
        identifier: 'message',
        buttonTitle: 'Message them',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);

    return true;
  } catch (error) {
    logger.error('Error requesting notification permissions:', error);
    return false;
  }
}


/**
 * Notification Type 2: Friend arrives in a shared zone
 * "[Friend Name] just arrived at [Zone Name]"
 */
export async function sendFriendZoneArrivalNotification(
  toUserId: string,
  friendName: string,
  zoneName: string,
  phoneNumber?: string,
  zoneId?: string
): Promise<void> {
  try {
    // Check for duplicate notification
    const notificationKey = `zone_arrival:${toUserId}:${friendName}:${zoneId}`;
    if (isRecentNotification(notificationKey)) {
      return; // Skip duplicate
    }
    
    // Get recipient's push token
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../../firebaseConfig');
    
    const userDoc = await getDoc(doc(db, 'users', toUserId));
    if (!userDoc.exists()) {
      logger.error(`User ${toUserId} not found for zone arrival notification`);
      return;
    }

    const userData = userDoc.data();
    const expoPushToken = userData.expoPushToken;
    
    if (!expoPushToken) {
      logger.debug(`User ${userData.name} has no push token - cannot send zone arrival notification`);
      return;
    }

    // Send push notification to recipient's device
    const success = await sendPushNotificationToUser(
      expoPushToken,
      `${friendName} is here! 👋`,
      `Just arrived at ${zoneName}`,
      { 
        type: 'friend_zone_arrival',
        friendName,
        zoneName,
        zoneId,
        phoneNumber,
        screen: 'Zones'
      }
    );

    if (success) {
      logger.debug(`📬 Zone arrival push notification sent to ${userData.name}: ${friendName} at ${zoneName}`);
    } else {
      logger.error(`❌ Failed to send zone arrival notification to ${userData.name}`);
    }
  } catch (error) {
    logger.error('Error sending friend zone arrival notification:', error);
  }
}


/**
 * Notification Type 4: Friend request received
 * "[Friend Name] wants to connect with you"
 */
export async function sendFriendRequestNotification(
  toUserId: string,
  fromUserName: string,
  homeNames: string[] = [],
  fromUserId?: string
): Promise<void> {
  try {
    // Check for duplicate notification
    const notificationKey = `friend_request:${toUserId}:${fromUserId}`;
    if (isRecentNotification(notificationKey)) {
      return; // Skip duplicate
    }
    
    const homeText = homeNames.length > 0 
      ? ` and share ${homeNames.join(', ')}`
      : '';

    // Get recipient's push token
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../../firebaseConfig');
    
    const userDoc = await getDoc(doc(db, 'users', toUserId));
    if (!userDoc.exists()) {
      logger.error(`User ${toUserId} not found for friend request notification`);
      return;
    }

    const userData = userDoc.data();
    const expoPushToken = userData.expoPushToken;
    
    if (!expoPushToken) {
      logger.debug(`User ${userData.name} has no push token - cannot send friend request notification`);
      return;
    }

    // Send push notification to recipient's device
    const success = await sendPushNotificationToUser(
      expoPushToken,
      `👋 Friend Request`,
      `${fromUserName} wants to connect${homeText}`,
      { 
        type: 'friend_request',
        fromUserName,
        fromUserId,
        homeNames,
        screen: 'Friends'
      }
    );

    if (success) {
      logger.debug(`📬 Friend request push notification sent to ${userData.name} from ${fromUserName}`);
    } else {
      logger.error(`❌ Failed to send friend request notification to ${userData.name}`);
    }
  } catch (error) {
    logger.error('Error sending friend request notification:', error);
  }
}

/**
 * Notification Type 3: Friend request accepted
 * "[Friend Name] accepted your friend request"
 */
export async function sendFriendRequestAcceptedNotification(
  toUserId: string,
  accepterName: string,
  sharedZoneNames: string[] = [],
  zoneId?: string
): Promise<void> {
  try {
    const zoneText = sharedZoneNames.length > 0 
      ? ` You're now sharing ${sharedZoneNames.join(', ')}`
      : '';

    // Get recipient's push token
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../../firebaseConfig');
    
    const userDoc = await getDoc(doc(db, 'users', toUserId));
    if (!userDoc.exists()) {
      logger.error(`User ${toUserId} not found for friend request accepted notification`);
      return;
    }

    const userData = userDoc.data();
    const expoPushToken = userData.expoPushToken;
    
    if (!expoPushToken) {
      logger.debug(`User ${userData.name} has no push token - cannot send friend request accepted notification`);
      return;
    }

    // Send push notification to recipient's device
    const success = await sendPushNotificationToUser(
      expoPushToken,
      `🎉 ${accepterName} accepted your request!`,
      `You're now connected${zoneText}`,
      { 
        type: 'friend_request_accepted',
        accepterName,
        sharedZoneNames,
        zoneId: zoneId || (sharedZoneNames.length > 0 ? 'first' : undefined),
        screen: 'Zones'
      }
    );

    if (success) {
      logger.debug(`📬 Friend request accepted push notification sent to ${userData.name}: ${accepterName}`);
    } else {
      logger.error(`❌ Failed to send friend request accepted notification to ${userData.name}`);
    }
  } catch (error) {
    logger.error('Error sending friend request accepted notification:', error);
  }
}

/**
 * Notification Type 4: Friend broadcasts their location
 * "[Friend Name] shared their location: [Location] - [Message]"
 */
export async function sendBroadcastNotification(
  toUserId: string,
  friendName: string,
  location: string,
  message: string
): Promise<void> {
  try {
    // Get recipient's push token
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../../firebaseConfig');
    
    const userDoc = await getDoc(doc(db, 'users', toUserId));
    if (!userDoc.exists()) {
      logger.error(`User ${toUserId} not found for broadcast notification`);
      return;
    }

    const userData = userDoc.data();
    const expoPushToken = userData.expoPushToken;
    
    if (!expoPushToken) {
      logger.debug(`User ${userData.name} has no push token - cannot send broadcast notification`);
      return;
    }

    // Send push notification to recipient's device
    const success = await sendPushNotificationToUser(
      expoPushToken,
      `📡 ${friendName} shared their location`,
      `${location}${message ? `: ${message}` : ''}`,
      { 
        type: 'broadcast',
        friendName,
        location,
        message,
        screen: 'Broadcast'
      }
    );

    if (success) {
      logger.debug(`📡 Broadcast push notification sent to ${userData.name} from ${friendName}`);
    } else {
      logger.error(`❌ Failed to send broadcast notification to ${userData.name}`);
    }
  } catch (error) {
    logger.error('Error sending broadcast notification:', error);
  }
}

/**
 * Handle notification tap and actions - navigate to appropriate screen or open Messages
 */
export function setupNotificationResponseListener(
  navigationRef: any
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    const actionIdentifier = response.actionIdentifier;
    
    logger.debug('📱 Notification tapped:', actionIdentifier, 'data:', data);

    // Handle "Message them" action
    if (actionIdentifier === 'message' && data.phoneNumber && typeof data.phoneNumber === 'string') {
      const cleanNumber = data.phoneNumber.replace(/\D/g, '');
      const smsUrl = `sms:${cleanNumber}`;
      logger.debug('Opening Messages app:', smsUrl);
      Linking.openURL(smsUrl).catch(err => {
        logger.error('Error opening Messages app:', err);
      });
      return;
    }

    // Handle notification tap based on type
    const notificationType = data.type;
    
    if (notificationType === 'friend_request') {
      // Friend request received - go to Friends screen
      logger.debug('📱 Opening Friends screen for friend request');
      navigationRef.current?.navigate('Main', { 
        screen: 'Friends',
        params: { expandFriendId: data.fromUserId }
      });
    } else if (notificationType === 'friend_request_accepted') {
      // Friend request accepted - go to Zones screen with that zone expanded
      logger.debug('📱 Opening Zones screen for accepted request, zoneId:', data.zoneId);
      navigationRef.current?.navigate('Main', { 
        screen: 'Zones',
        params: { expandZoneId: data.zoneId }
      });
    } else if (notificationType === 'friend_zone_arrival') {
      // Friend entered zone - go to Zones screen with that zone expanded
      logger.debug('📱 Opening Zones screen for zone arrival, zoneId:', data.zoneId);
      navigationRef.current?.navigate('Main', { 
        screen: 'Zones',
        params: { expandZoneId: data.zoneId }
      });
    } else if (notificationType === 'broadcast') {
      // Broadcast received - go to Friends screen
      logger.debug('📱 Opening Friends screen for broadcast');
      navigationRef.current?.navigate('Main', { 
        screen: 'Friends',
        params: { expandFriendId: data.fromUserId }
      });
    } else {
      // Default navigation based on screen
      if (data.screen === 'Zones') {
        navigationRef.current?.navigate('Main', { screen: 'Zones' });
      } else if (data.screen === 'Friends') {
        navigationRef.current?.navigate('Main', { screen: 'Friends' });
      }
    }
  });
}

/**
 * Cancel all pending notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logger.debug('📭 All notifications cancelled');
  } catch (error) {
    logger.error('Error cancelling notifications:', error);
  }
}

/**
 * Get notification badge count
 */
export async function getBadgeCount(): Promise<number> {
  try {
    return await Notifications.getBadgeCountAsync();
  } catch (error) {
    logger.error('Error getting badge count:', error);
    return 0;
  }
}

/**
 * Set notification badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    logger.error('Error setting badge count:', error);
  }
}

/**
 * Clear badge count
 */
export async function clearBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (error) {
    logger.error('Error clearing badge:', error);
  }
}

/**
 * Register for push notifications and save token to Firestore
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      logger.debug('No user logged in, skipping push token registration');
      return null;
    }

    // Request permissions first
    const granted = await requestNotificationPermissions();
    if (!granted) {
      logger.debug('Push notification permissions not granted');
      return null;
    }

    // Get Expo push token
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'ea0e5058-d48d-4ac6-8f82-d8972430f6cd' // Your Expo project ID from app.json
    });

    logger.debug('📱 Expo Push Token:', token.data);

    // Save token to user document in Firestore (use setDoc with merge to handle missing docs)
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, {
      expoPushToken: token.data,
      pushTokenUpdatedAt: new Date().toISOString()
    }, { merge: true });

    logger.debug('✅ Push token saved to Firestore');
    return token.data;
  } catch (error) {
    logger.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Send push notification to specific user's device
 */
export async function sendPushNotificationToUser(
  expoPushToken: string,
  title: string,
  body: string,
  data?: any
): Promise<boolean> {
  try {
    logger.debug('📤 Sending push notification to token:', expoPushToken);
    
    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data: {
        ...data,
        experienceId: '@jamiegoldstein/FriendZone',
      },
      priority: 'high',
      channelId: 'default',
      // iOS-specific options to ensure content shows on lock screen
      _displayInForeground: true,
      badge: 1,
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    logger.debug('📤 Push notification API response:', JSON.stringify(result, null, 2));

    // Check if the notification was accepted
    if (result.data && result.data.status === 'ok') {
      logger.debug('✅ Push notification accepted by Expo');
      return true;
    } else if (result.data && result.data.status === 'error') {
      logger.error('❌ Push notification rejected:', result.data.message);
      return false;
    } else {
      logger.debug('⚠️ Unexpected response format:', result);
      return false;
    }
  } catch (error) {
    logger.error('❌ Error sending push notification:', error);
    return false;
  }
}
