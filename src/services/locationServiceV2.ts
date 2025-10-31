import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { auth, db } from '../../firebaseConfig';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { encryptLocation } from '../utils/locationEncryption';
import { logger } from '../utils/logger';

interface HomeLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
}

// Background location task name
const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Single location subscription
let locationSubscription: Location.LocationSubscription | null = null;

// Track previous zones to detect changes
let previousZoneIds: string[] = [];

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
  if (!currentUser) return [];

  try {
    const homesQuery = query(
      collection(db, 'homes'),
      where('members', 'array-contains', currentUser.uid)
    );
    
    const snapshot = await getDocs(homesQuery);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      const radiusInMiles = data.radius || 0.1;
      const radiusInMeters = radiusInMiles * 1609.34;
      
      return {
        id: doc.id,
        name: data.name,
        latitude: data.location?.latitude || data.latitude || 0,
        longitude: data.location?.longitude || data.longitude || 0,
        radius: radiusInMeters,
      };
    });
  } catch (error) {
    logger.error('Error fetching zones:', error);
    return [];
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
      logger.debug(`👥 Notifying ${friendsSnapshot.docs.length} friends about arrival at ${zone.name}`);
      
      // Send push notification to each friend
      for (const friendDoc of friendsSnapshot.docs) {
        const friendData = friendDoc.data();
        const friendUserId = friendData.friendUserId;
        
        if (friendUserId) {
          try {
            await sendFriendZoneArrivalNotification(
              friendUserId,
              currentUserName,
              zone.name,
              currentUserDoc.exists() ? currentUserDoc.data().phoneNumber : '',
              zoneId
            );
          } catch (notifError) {
            logger.error(`Error sending notification to friend ${friendUserId}:`, notifError);
          }
        }
      }
    }
    
    logger.debug(`✅ Zone arrival notifications sent`);
  } catch (error) {
    logger.error('Error sending zone arrival notifications:', error);
  }
}

// Log to Firestore for debugging
async function logToFirestore(type: string, data: any) {
  try {
    const { DEBUG_CONFIG } = await import('../config/debug');
    if (!DEBUG_CONFIG.ENABLE_FIRESTORE_LOGGING) return;
    
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    const { addDoc, collection: fsCollection } = await import('firebase/firestore');
    await addDoc(fsCollection(db, 'debugLogs'), {
      timestamp: Date.now(),
      userId: currentUser.uid,
      type,
      ...data,
    });
  } catch (error) {
    // Silently fail - don't let logging break the app
  }
}

// Update user location in Firestore with encryption
async function updateUserLocation(
  latitude: number,
  longitude: number,
  accuracy: number | undefined,
  isAtHome: boolean,
  currentHomeIds: string[]
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    // Encrypt GPS coordinates before storing
    const encryptedCoordinates = await encryptLocation(latitude, longitude);
    
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, {
      lastLocation: {
        encryptedCoordinates, // Encrypted GPS data
        timestamp: Date.now(),
        accuracy: accuracy ?? undefined,
      },
      isAtHome,
      currentHomeIds: isAtHome ? currentHomeIds : [], // Multi-zone support
      lastSeen: Date.now(),
    });
  } catch (error) {
    logger.error('Error updating user location:', error);
  }
}

// Process a location update
async function processLocationUpdate(location: Location.LocationObject) {
  try {
    const { latitude, longitude, accuracy } = location.coords;
    const timestamp = location.timestamp;
    const locationAge = Date.now() - timestamp;
    
    logger.debug(`\n📍 GPS Update: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    logger.debug(`📡 Accuracy: ${accuracy?.toFixed(0)}m, Age: ${(locationAge/1000).toFixed(1)}s`);
    
    // Log GPS reading
    await logToFirestore('gps_reading_v2', {
      latitude,
      longitude,
      accuracy,
      timestamp,
      locationAgeSeconds: locationAge / 1000,
    });
    
    // Get all zones
    const zones = await getUserZones();
    logger.debug(`🏠 Checking ${zones.length} zones`);
    
    // Find ALL zones we're in (multi-zone support)
    const currentZones: HomeLocation[] = [];
    
    for (const zone of zones) {
      const distance = calculateDistance(latitude, longitude, zone.latitude, zone.longitude);
      const distanceMiles = (distance / 1609.34).toFixed(2);
      const isInside = distance <= zone.radius;
      
      logger.debug(`  ${zone.name}: ${distance.toFixed(0)}m (${distanceMiles} mi) - ${isInside ? '✅ INSIDE' : '❌ outside'}`);
      
      if (isInside) {
        currentZones.push(zone);
      }
    }
    
    const zoneNames = currentZones.map(z => z.name).join(', ') || 'none';
    const zoneIds = currentZones.map(z => z.id);
    
    logger.debug(`🎯 Current zones (${currentZones.length}): ${zoneNames}`);
    
    // Log zone detection
    await logToFirestore('zone_detected_v2', {
      zoneNames,
      zoneIds,
      zoneCount: currentZones.length,
      latitude,
      longitude,
    });
    
    // Update Firebase with all current zones
    await updateUserLocation(
      latitude,
      longitude,
      accuracy ?? undefined,
      currentZones.length > 0,
      zoneIds
    );
    
    // Detect zone changes and send notifications
    const newZoneIds = zoneIds.filter(id => !previousZoneIds.includes(id));
    const leftZoneIds = previousZoneIds.filter(id => !zoneIds.includes(id));
    
    if (newZoneIds.length > 0) {
      logger.debug(`🔔 Entered ${newZoneIds.length} new zone(s), sending notifications...`);
      await sendZoneArrivalNotifications(newZoneIds, currentZones);
    }
    
    if (leftZoneIds.length > 0) {
      logger.debug(`👋 Left ${leftZoneIds.length} zone(s)`);
    }
    
    // Update previous zones
    previousZoneIds = zoneIds;
    
    // Log Firebase update
    await logToFirestore('firebase_updated_v2', {
      zoneNames,
      zoneIds,
      zoneCount: currentZones.length,
      newZones: newZoneIds,
      leftZones: leftZoneIds,
    });
    
    logger.debug(`✅ Location updated to Firebase: ${zoneNames}\n`);
    
  } catch (error) {
    logger.error('Error processing location update:', error);
    await logToFirestore('location_error_v2', {
      error: String(error),
    });
  }
}

// Define background location task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
  if (error) {
    logger.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const location = locations[0];
      logger.debug('📍 Background location update received');
      await processLocationUpdate(location);
    }
  }
});

// Start watching location
export async function startLocationService(): Promise<void> {
  try {
    logger.debug('🚀 Starting Location Service V2...');
    
    // Stop any existing subscription
    if (locationSubscription) {
      locationSubscription.remove();
      locationSubscription = null;
    }
    
    // Request foreground permissions
    const foreground = await Location.requestForegroundPermissionsAsync();
    if (foreground.status !== 'granted') {
      logger.error('❌ Foreground location permission denied');
      return;
    }
    
    logger.debug('✅ Foreground location permission granted');
    
    // Request background permissions for true background tracking
    const background = await Location.requestBackgroundPermissionsAsync();
    if (background.status !== 'granted') {
      logger.warn('⚠️ Background location permission denied - will only work in foreground');
      // Continue anyway with foreground-only tracking
    } else {
      logger.debug('✅ Background location permission granted');
    }
    
    // Get current location IMMEDIATELY on startup
    logger.debug('📍 Getting initial location...');
    try {
      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      logger.debug('✅ Got initial location, processing...');
      await processLocationUpdate(initialLocation);
    } catch (error) {
      logger.error('❌ Error getting initial location:', error);
    }
    
    // Start background location tracking if we have background permission
    if (background.status === 'granted') {
      const isTaskDefined = await TaskManager.isTaskDefinedAsync(BACKGROUND_LOCATION_TASK);
      if (!isTaskDefined) {
        logger.error('❌ Background task not defined');
      } else {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 100, // Update every 100 meters
          timeInterval: 60000, // Or every 60 seconds
          foregroundService: {
            notificationTitle: 'FriendZone',
            notificationBody: 'Tracking your location for zone updates',
            notificationColor: '#FF5A5F',
          },
          pausesUpdatesAutomatically: false, // Keep running even when stationary
          showsBackgroundLocationIndicator: true,
        });
        logger.debug('✅ Background location tracking started');
      }
    } else {
      // Fallback to foreground-only tracking
      logger.debug('⚠️ Using foreground-only location tracking');
      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 50,
          timeInterval: 30000,
        },
        (location) => {
          processLocationUpdate(location);
        }
      );
    }
    
    logger.debug('✅ Location service started');
    
  } catch (error) {
    logger.error('❌ Error starting location service:', error);
  }
}

// Stop watching location
export async function stopLocationService(): Promise<void> {
  try {
    // Stop background task if running
    const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      logger.debug('🛑 Background location tracking stopped');
    }
    
    // Stop foreground subscription if exists
    if (locationSubscription) {
      locationSubscription.remove();
      locationSubscription = null;
      logger.debug('🛑 Foreground location tracking stopped');
    }
  } catch (error) {
    logger.error('Error stopping location service:', error);
  }
}

// Request location permissions
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    logger.error('Error requesting location permissions:', error);
    return false;
  }
}
