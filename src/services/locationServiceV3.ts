import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-task-manager';
import { auth, db } from '../../firebaseConfig';
import { doc, updateDoc, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { encryptLocation } from '../utils/locationEncryption';
import { logger } from '../utils/logger';

interface HomeLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
}

// Geofencing task name
const GEOFENCING_TASK = 'geofencing-task';
const HEARTBEAT_TASK = 'location-heartbeat';

// Track previous zones to detect changes
let previousZoneIds: string[] = [];

// Maximum regions iOS allows
const MAX_REGIONS = 20;

// Background location watcher
let locationWatcher: Location.LocationSubscription | null = null;

// Store recent errors for debugging
const recentErrors: Array<{ timestamp: Date; error: string; context: string }> = [];
const MAX_ERRORS = 10;

function logError(context: string, error: any) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  recentErrors.unshift({
    timestamp: new Date(),
    error: errorMsg,
    context
  });
  if (recentErrors.length > MAX_ERRORS) {
    recentErrors.pop();
  }
  logger.error(`[${context}] ${errorMsg}`, error);
}

export function getRecentErrors() {
  return recentErrors;
}

// Calculate distance between two points in meters
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// Get user's zones from Firestore
async function getUserZones(): Promise<HomeLocation[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    logger.debug('No authenticated user');
    return [];
  }

  try {
    // Get zones where user is a member
    const homesQuery = query(
      collection(db, 'homes'),
      where('members', 'array-contains', currentUser.uid)
    );
    
    const homesSnapshot = await getDocs(homesQuery);
    const zones: HomeLocation[] = [];
    
    homesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.location?.latitude && data.location?.longitude) {
        zones.push({
          id: doc.id,
          name: data.name,
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          radius: data.radius || 1609, // Default 1 mile in meters
        });
      }
    });
    
    return zones;
  } catch (error) {
    logError('getUserZones', error);
    return [];
  }
}

// Log events to Firestore
async function logToFirestore(eventType: string, data: any) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    await addDoc(collection(db, 'locationLogs'), {
      userId: currentUser.uid,
      eventType,
      timestamp: new Date(),
      ...data,
    });
  } catch (error) {
    logError('logToFirestore', error);
  }
}

// Send welcome notification to user when arriving at zone with friends
async function sendWelcomeNotification(zoneId: string, zoneName: string) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Get friends who share this zone
    const { query: fsQuery, collection: fsCollection, where, getDocs } = await import('firebase/firestore');
    const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
    
    const friendsQuery = fsQuery(
      fsCollection(db, 'friends'),
      where('userId', '==', currentUser.uid),
      where('sharedHomes', 'array-contains', zoneId)
    );

    const friendsSnapshot = await getDocs(friendsQuery);
    
    // Count how many friends are currently at this zone
    let friendsHereCount = 0;
    const friendsHere: string[] = [];
    
    for (const friendDoc of friendsSnapshot.docs) {
      const friendData = friendDoc.data();
      const friendUserId = friendData.friendUserId;
      
      if (friendUserId) {
        const friendUserDoc = await getDoc(firestoreDoc(db, 'users', friendUserId));
        if (friendUserDoc.exists()) {
          const friendUserData = friendUserDoc.data();
          const friendCurrentZones = friendUserData.currentHomeIds || [];
          
          if (friendCurrentZones.includes(zoneId)) {
            friendsHereCount++;
            friendsHere.push(friendData.name);
          }
        }
      }
    }

    // Send welcome notification (always, even if no friends are here)
    const { scheduleNotificationAsync } = await import('expo-notifications');
    
    let message: string;
    if (friendsHereCount === 0) {
      message = 'You\'re the first one here';
    } else {
      const friendsList = friendsHere.slice(0, 3).join(', '); // Show up to 3 names
      message = friendsHereCount === 1 
        ? `${friendsList} is here`
        : friendsHereCount <= 3
        ? `${friendsList} are here`
        : `${friendsHere.slice(0, 2).join(', ')} and ${friendsHereCount - 2} others are here`;
    }
    
    await scheduleNotificationAsync({
      content: {
        title: `Welcome to ${zoneName}!`,
        body: message,
        data: { zoneId, type: 'zone_welcome' },
      },
      trigger: null, // Send immediately
    });
    
    logger.debug(`👋 Sent welcome notification: ${friendsHereCount} friends at ${zoneName}`);
  } catch (error) {
    logError('sendWelcomeNotification', error);
  }
}

// Send notifications to friends when arriving at zones
async function sendZoneArrivalNotifications(newZoneIds: string[], allZones: HomeLocation[]) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Get current user's name
    const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
    const currentUserDoc = await getDoc(firestoreDoc(db, 'users', currentUser.uid));
    const currentUserName = currentUserDoc.exists() ? currentUserDoc.data().name : 'A friend';

    // Import notification service
    const { sendFriendZoneArrivalNotification } = await import('./notificationService');

    // Send notifications for each newly entered zone
    for (const zoneId of newZoneIds) {
      const zone = allZones.find(z => z.id === zoneId);
      if (!zone) continue;

      // Get friends who share this zone
      const { query: fsQuery, collection: fsCollection, where, getDocs } = await import('firebase/firestore');
      const friendsQuery = fsQuery(
        fsCollection(db, 'friends'),
        where('userId', '==', currentUser.uid),
        where('sharedHomes', 'array-contains', zoneId)
      );

      const friendsSnapshot = await getDocs(friendsQuery);
      logger.debug(`👥 Found ${friendsSnapshot.docs.length} friends who share ${zone.name}`);

      // Send push notification ONLY to friends who are currently at this zone
      for (const friendDoc of friendsSnapshot.docs) {
        const friendData = friendDoc.data();
        const friendUserId = friendData.friendUserId;

        if (friendUserId) {
          try {
            // Check if friend is currently at this zone
            const friendUserDoc = await getDoc(firestoreDoc(db, 'users', friendUserId));
            if (friendUserDoc.exists()) {
              const friendUserData = friendUserDoc.data();
              const friendCurrentZones = friendUserData.currentHomeIds || [];
              
              // Only notify if friend is currently at this zone
              if (friendCurrentZones.includes(zoneId)) {
                logger.debug(`🔔 Notifying ${friendData.name} - they are at ${zone.name}`);
                await sendFriendZoneArrivalNotification(
                  friendUserId,
                  currentUserName,
                  zone.name,
                  currentUserDoc.exists() ? currentUserDoc.data().phoneNumber : '',
                  zoneId
                );
              } else {
                logger.debug(`⏭️ Skipping ${friendData.name} - they are not at ${zone.name}`);
              }
            }
          } catch (notifError) {
            logError(`sendNotificationToFriend-${friendUserId}`, notifError);
          }
        }
      }
    }

    logger.debug(`✅ Zone arrival notifications sent`);
  } catch (error) {
    logError('sendZoneArrivalNotifications', error);
  }
}

// Process geofence event (enter/exit)
async function processGeofenceEvent(region: Location.LocationRegion, state: Location.GeofencingEventType) {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      logger.debug('No authenticated user, skipping geofence event');
      return;
    }

    logger.debug(`🚨 Geofence event: ${state === Location.GeofencingEventType.Enter ? 'ENTER' : 'EXIT'} ${region.identifier}`);

    // Get all user zones to update currentHomeIds
    const allZones = await getUserZones();
    const currentLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = currentLocation.coords;

    // Check which zones we're currently in (not just the triggered one)
    const currentZones: HomeLocation[] = [];
    for (const zone of allZones) {
      const distance = calculateDistance(latitude, longitude, zone.latitude, zone.longitude);
      const radiusInMeters = zone.radius * 1609.34; // Convert miles to meters
      if (distance <= radiusInMeters) {
        currentZones.push(zone);
      }
    }

    const zoneNames = currentZones.map(z => z.name).join(', ') || 'none';
    const zoneIds = currentZones.map(z => z.id);

    logger.debug(`🎯 Currently in zones (${currentZones.length}): ${zoneNames}`);

    // Update user document with current zones
    const userRef = doc(db, 'users', currentUser.uid);
    const encryptedCoordinates = await encryptLocation(latitude, longitude);

    await updateDoc(userRef, {
      lastLocation: {
        encryptedCoordinates,
        timestamp: Date.now(),
        accuracy: 10, // Default accuracy for geofence events
      },
      lastSeen: new Date(),
      isAtHome: currentZones.length > 0,
      currentHomeIds: zoneIds,
    });

    // Detect zone changes and send notifications
    const newZoneIds = zoneIds.filter(id => !previousZoneIds.includes(id));
    const leftZoneIds = previousZoneIds.filter(id => !zoneIds.includes(id));

    if (newZoneIds.length > 0) {
      logger.debug(`🔔 Entered ${newZoneIds.length} new zone(s), sending notifications...`);
      
      // Send notifications to friends who are at these zones
      await sendZoneArrivalNotifications(newZoneIds, currentZones);
      
      // Send welcome notification to user for each zone with friends
      for (const zoneId of newZoneIds) {
        const zone = currentZones.find(z => z.id === zoneId);
        if (zone) {
          await sendWelcomeNotification(zoneId, zone.name);
        }
      }
    }

    if (leftZoneIds.length > 0) {
      logger.debug(`👋 Left ${leftZoneIds.length} zone(s)`);
    }

    // Update previous zones
    previousZoneIds = zoneIds;

    // Log to Firestore
    await logToFirestore('geofence_event_v3', {
      eventType: state === Location.GeofencingEventType.Enter ? 'enter' : 'exit',
      regionId: region.identifier,
      currentZones: zoneNames,
      zoneIds,
      newZones: newZoneIds,
      leftZones: leftZoneIds,
    });

    logger.debug(`✅ Geofence event processed\n`);

  } catch (error) {
    logError('processGeofenceEvent', error);
    await logToFirestore('geofence_error_v3', {
      error: String(error),
    });
  }
}

// Define geofencing task
TaskManager.defineTask(GEOFENCING_TASK, async ({ data, error }: any) => {
  if (error) {
    logError('GeofencingTask', error);
    return;
  }
  
  if (data) {
    const { eventType, region } = data;
    logger.debug('📍 Geofencing event received:', eventType, region.identifier);
    await processGeofenceEvent(region, eventType);
  }
});

// Start geofencing for user's zones
export async function startLocationService(): Promise<void> {
  try {
    logger.debug('🚀 Starting Location Service V3 (Geofencing)...');

    // Request foreground permissions
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      logError('startLocationService', 'Foreground location permission denied');
      return;
    }

    logger.debug('✅ Foreground location permission granted');

    // Request background permissions for geofencing
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') {
      logError('startLocationService', 'Background location permission denied - geofencing requires Always permission');
      return;
    }

    logger.debug('✅ Background location permission granted');

    // Get current location IMMEDIATELY on startup
    logger.debug('📍 Getting initial location...');
    try {
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      logger.debug('✅ Got initial location, checking zones...');
      
      // Manually check zones on startup
      const zones = await getUserZones();
      const { latitude, longitude } = initialLocation.coords;
      
      // Validate coordinates
      if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
        logError('startLocationService', `Invalid coordinates: lat=${latitude}, lon=${longitude}`);
        throw new Error('Invalid GPS coordinates received');
      }
      
      logger.debug(`📍 Valid coordinates: ${latitude}, ${longitude}`);
      const currentZones: HomeLocation[] = [];
      
      for (const zone of zones) {
        const distance = calculateDistance(latitude, longitude, zone.latitude, zone.longitude);
        const radiusInMeters = zone.radius * 1609.34; // Convert miles to meters
        logger.debug(`  Zone ${zone.name}: ${distance.toFixed(0)}m away, radius ${radiusInMeters.toFixed(0)}m`);
        if (distance <= radiusInMeters) {
          currentZones.push(zone);
          logger.debug(`    ✅ INSIDE ${zone.name}`);
        }
      }

      const zoneIds = currentZones.map(z => z.id);
      const zoneNames = currentZones.map(z => z.name).join(', ') || 'none';
      
      logger.debug(`🎯 Initial zones (${currentZones.length}): ${zoneNames}`);

      // Update Firebase with initial location
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        const encryptedCoordinates = await encryptLocation(latitude, longitude);

        await updateDoc(userRef, {
          lastLocation: {
            encryptedCoordinates,
            timestamp: Date.now(),
            accuracy: initialLocation.coords.accuracy,
          },
          lastSeen: new Date(),
          isAtHome: currentZones.length > 0,
          currentHomeIds: zoneIds,
        });

        previousZoneIds = zoneIds;
        logger.debug('✅ Initial location updated in Firebase');
      }
    } catch (error) {
      logError('getInitialLocation', error);
    }

    // Get user's zones
    const zones = await getUserZones();
    logger.debug(`📍 Found ${zones.length} zones to monitor`);

    if (zones.length === 0) {
      logger.debug('⚠️ No zones to monitor');
      return;
    }

    // Limit to 20 zones (iOS limit)
    let zonesToMonitor = zones;
    if (zones.length > MAX_REGIONS) {
      logger.warn(`⚠️ User has ${zones.length} zones, limiting to ${MAX_REGIONS} closest zones`);
      
      // Get current location to sort by distance
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = currentLocation.coords;

      // Sort by distance and take closest 20
      zonesToMonitor = zones
        .map(zone => ({
          ...zone,
          distance: calculateDistance(latitude, longitude, zone.latitude, zone.longitude)
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, MAX_REGIONS);
    }

    // Convert zones to geofencing regions
    const regions: Location.LocationRegion[] = zonesToMonitor.map(zone => ({
      identifier: zone.id,
      latitude: zone.latitude,
      longitude: zone.longitude,
      radius: Math.max(zone.radius, 100), // iOS minimum is ~100m
      notifyOnEnter: true,
      notifyOnExit: true,
    }));

    // Check if task is defined
    const isTaskDefined = TaskManager.isTaskDefined(GEOFENCING_TASK);
    if (!isTaskDefined) {
      logError('startLocationService', 'Geofencing task not defined');
      return;
    }

    // Stop any existing geofencing
    try {
      const isGeofencingActive = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK);
      if (isGeofencingActive) {
        await Location.stopGeofencingAsync(GEOFENCING_TASK);
        logger.debug('🛑 Stopped existing geofencing');
      }
    } catch (stopError) {
      logger.debug('⚠️ Could not check/stop existing geofencing (may not be running)');
    }

    // Start geofencing
    await Location.startGeofencingAsync(GEOFENCING_TASK, regions);
    
    logger.debug(`✅ Geofencing started for ${regions.length} zones:`);
    regions.forEach(region => {
      const zone = zonesToMonitor.find(z => z.id === region.identifier);
      logger.debug(`  - ${zone?.name} (${region.radius}m radius)`);
    });

    // Start background location watcher as backup (updates every 15 minutes)
    // This ensures location updates even if geofencing stops
    if (locationWatcher) {
      locationWatcher.remove();
    }
    
    locationWatcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 900000, // 15 minutes
        distanceInterval: 500, // 500 meters
      },
      async (location) => {
        try {
          logger.debug('📍 Background location update from watcher');
          const currentUser = auth.currentUser;
          if (!currentUser) return;

          const { latitude, longitude } = location.coords;
          
          // Check zones
          const zones = await getUserZones();
          const currentZones: HomeLocation[] = [];
          
          for (const zone of zones) {
            const distance = calculateDistance(latitude, longitude, zone.latitude, zone.longitude);
            const radiusInMeters = zone.radius * 1609.34;
            if (distance <= radiusInMeters) {
              currentZones.push(zone);
            }
          }

          const zoneIds = currentZones.map(z => z.id);
          
          // Detect zone changes and send notifications
          const newZoneIds = zoneIds.filter(id => !previousZoneIds.includes(id));
          const leftZoneIds = previousZoneIds.filter(id => !zoneIds.includes(id));

          if (newZoneIds.length > 0) {
            logger.debug(`🔔 Background watcher: Entered ${newZoneIds.length} new zone(s), sending notifications...`);
            
            // Send notifications to friends who are at these zones
            await sendZoneArrivalNotifications(newZoneIds, currentZones);
            
            // Send welcome notification to user for each zone with friends
            for (const zoneId of newZoneIds) {
              const zone = currentZones.find(z => z.id === zoneId);
              if (zone) {
                await sendWelcomeNotification(zoneId, zone.name);
              }
            }
          }

          if (leftZoneIds.length > 0) {
            logger.debug(`👋 Background watcher: Left ${leftZoneIds.length} zone(s)`);
          }

          // Update previous zones
          previousZoneIds = zoneIds;
          
          // Update Firebase
          const userRef = doc(db, 'users', currentUser.uid);
          const encryptedCoordinates = await encryptLocation(latitude, longitude);
          
          await updateDoc(userRef, {
            lastLocation: {
              encryptedCoordinates,
              timestamp: Date.now(),
              accuracy: location.coords.accuracy || 10,
            },
            lastSeen: new Date(),
            isAtHome: currentZones.length > 0,
            currentHomeIds: zoneIds,
          });
          
          logger.debug(`✅ Background watcher updated location: ${currentZones.length} zones`);
        } catch (error) {
          logError('backgroundLocationWatcher', error);
        }
      }
    );
    
    logger.debug('✅ Background location watcher started (15min intervals)');

  } catch (error) {
    logError('startLocationService', error);
  }
}

// Stop geofencing
export async function stopLocationService(): Promise<void> {
  try {
    const isGeofencingActive = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK);
    if (isGeofencingActive) {
      await Location.stopGeofencingAsync(GEOFENCING_TASK);
      logger.debug('🛑 Geofencing stopped');
    }
    
    // Stop background watcher
    if (locationWatcher) {
      locationWatcher.remove();
      locationWatcher = null;
      logger.debug('🛑 Background location watcher stopped');
    }
  } catch (error) {
    logError('stopLocationService', error);
  }
}

// Request location permissions
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    // First check if we already have permissions
    const currentPermissions = await Location.getForegroundPermissionsAsync();
    const currentBackground = await Location.getBackgroundPermissionsAsync();
    
    if (currentPermissions.status === 'granted' && currentBackground.status === 'granted') {
      logger.debug('✅ Already have foreground and background permissions');
      return true;
    }

    // Request foreground if needed
    if (currentPermissions.status !== 'granted') {
      const foreground = await Location.requestForegroundPermissionsAsync();
      if (foreground.status !== 'granted') {
        logger.debug('❌ Foreground permission denied');
        return false;
      }
    }

    // Request background if needed
    if (currentBackground.status !== 'granted') {
      const background = await Location.requestBackgroundPermissionsAsync();
      if (background.status !== 'granted') {
        logger.debug('❌ Background permission denied');
        return false;
      }
    }

    // Double-check permissions after requesting (iOS sometimes needs a moment)
    await new Promise(resolve => setTimeout(resolve, 500));
    const finalCheck = await Location.getBackgroundPermissionsAsync();
    const hasPermission = finalCheck.status === 'granted';
    
    logger.debug(hasPermission ? '✅ All permissions granted' : '❌ Background permission not granted');
    return hasPermission;
  } catch (error) {
    logError('requestLocationPermissions', error);
    return false;
  }
}

// Refresh geofencing regions (call when user creates/joins new zones)
export async function refreshGeofencingRegions(): Promise<void> {
  logger.debug('🔄 Refreshing geofencing regions...');
  await stopLocationService();
  await startLocationService();
}

// Quick location check without restarting geofencing
// Use this for app startup to update location immediately
export async function quickLocationCheck(): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      logger.debug('No user logged in, skipping location check');
      return;
    }

    // Check if we have location permission
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      logger.debug('Location permission not granted, skipping location check');
      return;
    }

    logger.debug('📍 Quick location check...');

    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = location.coords;

    // Get user's zones
    const zones = await getUserZones();
    
    // Check which zones we're in
    const currentZones: HomeLocation[] = [];
    for (const zone of zones) {
      const distance = calculateDistance(latitude, longitude, zone.latitude, zone.longitude);
      const radiusInMeters = zone.radius * 1609.34; // Convert miles to meters
      if (distance <= radiusInMeters) {
        currentZones.push(zone);
      }
    }

    const zoneIds = currentZones.map(z => z.id);
    const zoneNames = currentZones.map(z => z.name).join(', ') || 'none';
    
    logger.debug(`🎯 Currently in zones (${currentZones.length}): ${zoneNames}`);

    // Update Firebase
    const userRef = doc(db, 'users', currentUser.uid);
    const encryptedCoordinates = await encryptLocation(latitude, longitude);

    await updateDoc(userRef, {
      lastLocation: {
        encryptedCoordinates,
        timestamp: Date.now(),
        accuracy: 10, // Default accuracy for manual checks
      },
      lastSeen: new Date(),
      isAtHome: currentZones.length > 0,
      currentHomeIds: zoneIds,
    });

    logger.debug('✅ Quick location check complete');

  } catch (error) {
    logError('quickLocationCheck', error);
  }
}
