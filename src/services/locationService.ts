import * as Location from 'expo-location';
import { auth, db } from '../../firebaseConfig';
import { doc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy?: number;
  isAtHome: boolean;
  currentHomeIds: string[];
}

interface HomeLocation {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
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

// Track previous zone state to implement hysteresis
const ZONE_STATE_KEY = '@zone_state';
let previousZoneState: { isAtHome: boolean; currentHomeIds: string[] } = {
  isAtHome: false,
  currentHomeIds: [],
};

// Load previous zone state from storage
async function loadPreviousZoneState(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(ZONE_STATE_KEY);
    if (stored) {
      previousZoneState = JSON.parse(stored);
      logger.debug('📦 Loaded previous zone state:', previousZoneState);
    }
  } catch (error) {
    logger.error('Error loading zone state:', error);
  }
}

// Save zone state to storage
async function savePreviousZoneState(): Promise<void> {
  try {
    await AsyncStorage.setItem(ZONE_STATE_KEY, JSON.stringify(previousZoneState));
  } catch (error) {
    logger.error('Error saving zone state:', error);
  }
}

// Clear zone state cache (for debugging)
export async function clearZoneStateCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ZONE_STATE_KEY);
    previousZoneState = { isAtHome: false, currentHomeIds: [] };
    logger.debug('🗑️ Zone state cache cleared');
  } catch (error) {
    logger.error('Error clearing zone state:', error);
  }
}

// Check which zone user is in with hysteresis buffer to prevent flickering
function checkZoneStatus(userLat: number, userLon: number, homes: HomeLocation[]): { isAtHome: boolean; currentHomeIds: string[] } {
  logger.debug(`📍 Checking zone status for location: ${userLat.toFixed(4)}, ${userLon.toFixed(4)}`);
  logger.debug(`🏠 Checking against ${homes.length} homes`);
  logger.debug(`🔄 Previous state: isAtHome=${previousZoneState.isAtHome}, zones=${previousZoneState.currentHomeIds?.join(', ') || 'none'}`);
  
  // Hysteresis buffer to prevent flickering at zone boundaries
  // Reduced buffers for better cross-country travel detection
  const ENTRY_BUFFER = 0; // No entry buffer - detect immediately when inside zone
  const EXIT_BUFFER = 50; // Must be 50m outside to exit (prevents flickering while allowing travel)
  
  const currentZones: string[] = [];
  
  // Check all zones to see which ones we're in
  for (const home of homes) {
    const distance = calculateDistance(userLat, userLon, home.latitude, home.longitude);
    const distanceMiles = (distance / 1609.34).toFixed(2);
    const radiusMiles = (home.radius / 1609.34).toFixed(2);
    
    // Check if we were previously in this zone
    const wasPreviouslyInZone = previousZoneState.currentHomeIds?.includes(home.id);
    
    // Use exit buffer if we were in this zone, entry buffer if we weren't
    const effectiveRadius = wasPreviouslyInZone 
      ? home.radius + EXIT_BUFFER  // Harder to exit
      : home.radius - ENTRY_BUFFER; // Harder to enter
    
    const isInside = distance <= effectiveRadius;
    
    logger.debug(`  🎯 Home ${home.id}:`);
    logger.debug(`     Distance: ${distance.toFixed(0)}m (${distanceMiles} miles)`);
    logger.debug(`     Base Radius: ${home.radius.toFixed(0)}m (${radiusMiles} miles)`);
    logger.debug(`     Effective Radius: ${effectiveRadius.toFixed(0)}m (${wasPreviouslyInZone ? 'exit buffer' : 'entry buffer'})`);
    logger.debug(`     Inside: ${isInside ? '✅ YES' : '❌ NO'}`);
    
    if (isInside) {
      currentZones.push(home.id);
      logger.debug(`✅ USER IN ZONE: ${home.id}`);
    }
  }
  
  if (currentZones.length > 0) {
    logger.debug(`✅ User is in ${currentZones.length} zone(s): ${currentZones.join(', ')}`);
    return { isAtHome: true, currentHomeIds: currentZones };
  }
  
  logger.debug('❌ User is not in any zone');
  return { isAtHome: false, currentHomeIds: [] };
}

// Get user's homes for zone checking
async function getUserHomes(): Promise<HomeLocation[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    logger.debug('❌ getUserHomes: No current user');
    return [];
  }

  try {
    const homesQuery = query(
      collection(db, 'homes'),
      where('members', 'array-contains', currentUser.uid)
    );
    
    const snapshot = await getDocs(homesQuery);
    logger.debug(`📍 getUserHomes: Found ${snapshot.docs.length} homes for user ${currentUser.uid}`);
    
    const homes = snapshot.docs.map(doc => {
      const data = doc.data();
      logger.debug(`🏠 Processing home ${doc.id}:`, {
        name: data.name,
        rawRadius: data.radius,
        hasLocation: !!data.location,
        locationLat: data.location?.latitude,
        locationLon: data.location?.longitude,
      });
      
      const radiusInMiles = data.radius || 0.1; // Default 0.1 miles if not set
      const radiusInMeters = radiusInMiles * 1609.34; // Convert miles to meters
      
      const home = {
        id: doc.id,
        latitude: data.location?.latitude || data.latitude || 0,  // Try nested first, fallback to direct
        longitude: data.location?.longitude || data.longitude || 0, // Try nested first, fallback to direct
        radius: radiusInMeters, // Radius in meters for distance comparison
      };
      
      logger.debug(`✅ Home ${doc.id} processed:`, {
        lat: home.latitude,
        lon: home.longitude,
        radiusMiles: radiusInMiles,
        radiusMeters: radiusInMeters.toFixed(0),
      });
      
      return home;
    });
    
    return homes;
  } catch (error) {
    logger.error('❌ Error fetching user homes:', error);
    return [];
  }
}

// Update user location in Firestore
async function updateUserLocation(locationData: LocationUpdate): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    // Validate GPS coordinates before updating
    if (!locationData.latitude || !locationData.longitude) {
      logger.error('❌ Invalid GPS coordinates - skipping location update', {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        accuracy: locationData.accuracy,
      });
      return;
    }

    const userUpdate = {
      lastLocation: {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        timestamp: Date.now(),
        ...(locationData.accuracy && { accuracy: locationData.accuracy }),
      },
      isAtHome: locationData.isAtHome,
      lastSeen: Date.now(),
      currentHomeIds: locationData.currentHomeIds,
    };

    await updateDoc(doc(db, 'users', currentUser.uid), userUpdate);
    
    // Also update location in all friend records where this user is the friend
    // This allows friends to see your location for proximity detection
    await updateFriendLocations(currentUser.uid, locationData);
  } catch (error) {
    logger.error('Error updating user location:', error);
    throw error;
  }
}

// Update location in friend records for proximity detection
async function updateFriendLocations(userId: string, locationData: LocationUpdate): Promise<void> {
  try {
    const friendsQuery = query(
      collection(db, 'friends'),
      where('friendUserId', '==', userId)
    );
    
    const snapshot = await getDocs(friendsQuery);
    
    const locationUpdate = {
      lastKnownLocation: {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        timestamp: Date.now(),
      },
      isCurrentlyAtHome: locationData.isAtHome,
      lastSeen: Date.now(), // Add lastSeen to friend records
      currentHomeIds: locationData.currentHomeIds,
    };
    
    // Update all friend records
    const updatePromises = snapshot.docs.map(friendDoc =>
      updateDoc(doc(db, 'friends', friendDoc.id), locationUpdate)
    );
    
    await Promise.all(updatePromises);
    logger.debug(`📍 Updated location in ${snapshot.docs.length} friend records`);
  } catch (error) {
    logger.error('Error updating friend locations:', error);
    // Don't throw - this is a secondary update
  }
}

// previousZoneState is declared earlier for hysteresis

// Main function: Check location and update zones
export async function checkLocationAndUpdateZones(): Promise<void> {
  try {
    logger.debug('\n🔄 === CHECKING LOCATION AND UPDATING ZONES ===');
    logger.debug(`⏰ Time: ${new Date().toLocaleTimeString()}`);
    
    // Log to Firestore that location check started
    const { debugLog } = await import('../config/debug');
    const currentUser = auth.currentUser;
    if (currentUser) {
      await debugLog('location_check_start', {
        timestamp: Date.now(),
        time: new Date().toLocaleTimeString(),
      }, currentUser.uid);
    }
    
    // TEMPORARILY DISABLED: Don't load cached state to force fresh check
    // await loadPreviousZoneState();
    logger.debug('⚠️ Skipping cached state load - forcing fresh zone check');
    
    // Get current location with retry logic and comprehensive logging
    let location;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      logger.debug(`📍 GPS attempt ${attempts}/${MAX_ATTEMPTS}...`);
      
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        
        // Log raw GPS data for debugging
        logger.debug('🔍 Raw GPS data received:', {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          altitude: location.coords.altitude,
          heading: location.coords.heading,
          speed: location.coords.speed,
          timestamp: location.timestamp,
          mocked: location.mocked,
        });
        
        // Check if we got valid coordinates
        if (location.coords.latitude && location.coords.longitude) {
          logger.debug(`✅ Got valid GPS coordinates on attempt ${attempts}`);
          break;
        }
        
        logger.warn(`⚠️ Attempt ${attempts} returned undefined coordinates, retrying...`);
        
        // Wait 2 seconds before retry
        if (attempts < MAX_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        logger.error(`❌ GPS attempt ${attempts} failed:`, error);
        if (attempts === MAX_ATTEMPTS) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // If all attempts failed, throw error
    if (!location || !location.coords.latitude || !location.coords.longitude) {
      const error = new Error('Failed to get valid GPS coordinates after 3 attempts');
      logger.error('❌ GPS completely failed:', error);
      throw error;
    }
    
    const locationAge = Date.now() - (location.timestamp || 0);
    logger.debug(`📍 Current location: ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`);
    logger.debug(`📡 Accuracy: ${location.coords.accuracy?.toFixed(0)}m`);
    logger.debug(`⏱️  Location age: ${(locationAge / 1000).toFixed(1)}s`);
    
    // Log GPS data to Firestore including age
    if (currentUser) {
      await debugLog('gps_reading', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        locationAgeSeconds: locationAge / 1000,
        timestamp: location.timestamp,
      }, currentUser.uid);
    }
    
    // Log GPS accuracy but don't reject - zones are large enough to tolerate some inaccuracy
    const accuracy = location.coords.accuracy || 999;
    logger.debug(`📡 GPS accuracy: ${accuracy.toFixed(0)}m`);
    if (accuracy > 200) {
      logger.debug(`⚠️ GPS accuracy is poor (${accuracy.toFixed(0)}m), but continuing with zone check`);
      if (currentUser) {
        await debugLog('gps_poor_accuracy', {
          accuracy,
          note: 'continuing_anyway',
        }, currentUser.uid);
      }
    }

    // Get user's homes
    const homes = await getUserHomes();

    // Check zone status
    const zoneStatus = checkZoneStatus(
      location.coords.latitude,
      location.coords.longitude,
      homes
    );

    // Detect new zone arrivals (zones we just entered)
    const newZoneIds = zoneStatus.currentHomeIds.filter(
      zoneId => !previousZoneState.currentHomeIds.includes(zoneId)
    );

    // Log zone detection result
    if (currentUser) {
      await debugLog('zone_detected', {
        isAtHome: zoneStatus.isAtHome,
        currentHomeIds: zoneStatus.currentHomeIds.join(', ') || 'none',
        newArrivals: newZoneIds.join(', ') || 'none',
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }, currentUser.uid);
    }
    
    // Update location in Firestore
    await updateUserLocation({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy ?? undefined,
      isAtHome: zoneStatus.isAtHome,
      currentHomeIds: zoneStatus.currentHomeIds,
    });
    
    // Log successful update
    if (currentUser) {
      await debugLog('firebase_updated', {
        isAtHome: zoneStatus.isAtHome,
        currentHomeIds: zoneStatus.currentHomeIds.join(', ') || 'none',
      }, currentUser.uid);
    }

    // Send zone arrival notifications for each new zone
    if (newZoneIds.length > 0) {
      logger.debug(`🔔 Notifying friends of arrival at ${newZoneIds.length} zone(s)...`);
      const { sendFriendZoneArrivalNotification } = await import('./notificationService');
      const { getDoc, doc: firestoreDoc } = await import('firebase/firestore');
      
      try {
        const currentUser = auth.currentUser;
        
        if (currentUser) {
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          
          // Get current user's name
          const currentUserDoc = await getDoc(firestoreDoc(db, 'users', currentUser.uid));
          const currentUserName = currentUserDoc.exists() ? currentUserDoc.data().name : 'A friend';
          const currentUserPhone = currentUserDoc.exists() ? currentUserDoc.data().phoneNumber : '';
          
          // Send notifications for each newly entered zone
          for (const zoneId of newZoneIds) {
            // Get zone name from Firestore
            const zoneDoc = await getDoc(firestoreDoc(db, 'homes', zoneId));
            const zoneName = zoneDoc.exists() ? zoneDoc.data().name : 'a zone';
            
            // Get list of friends who share this zone
            const friendsQuery = query(
              collection(db, 'friends'),
              where('userId', '==', currentUser.uid),
              where('sharedHomes', 'array-contains', zoneId)
            );
            const friendsSnapshot = await getDocs(friendsQuery);
            
            logger.debug(`👥 Notifying ${friendsSnapshot.docs.length} friends about arrival at ${zoneName}`);
            
            // Send push notification to each friend
            for (const friendDoc of friendsSnapshot.docs) {
              const friendData = friendDoc.data();
              const friendUserId = friendData.friendUserId;
              
              if (friendUserId) {
                try {
                  await sendFriendZoneArrivalNotification(
                    friendUserId,
                    currentUserName,
                    zoneName,
                    currentUserPhone,
                    zoneId
                  );
                  logger.debug(`  📬 Notified ${friendData.name} about arrival at ${zoneName}`);
                } catch (error) {
                  logger.error(`  ❌ Failed to notify ${friendData.name}:`, error);
                }
              }
            }
          }
          
          logger.debug(`✅ Zone arrival notifications sent to friends`);
        }
      } catch (notifError) {
        logger.error('❌ Error sending zone arrival notifications:', notifError);
      }
    }

    // Update previous state and save to storage
    previousZoneState = {
      isAtHome: zoneStatus.isAtHome,
      currentHomeIds: zoneStatus.currentHomeIds,
    };
    await savePreviousZoneState();

    logger.debug(`✅ Location updated: ${zoneStatus.isAtHome ? `At ${zoneStatus.currentHomeIds.length} zone(s): ${zoneStatus.currentHomeIds.join(', ')}` : 'Not in any zone'}`);
    logger.debug('=== END LOCATION CHECK ===\n');
    
    // Return success status for debugging
    return;
  } catch (error) {
    logger.error('❌ Error checking location:', error);
    logger.error('Error details:', JSON.stringify(error, null, 2));
    // Don't throw - allow app to continue
  }
}

// Start background location tracking for movement detection
let locationSubscription: Location.LocationSubscription | null = null;
let lastKnownLocation: { latitude: number; longitude: number } | null = null;

export async function startMovementTracking(): Promise<void> {
  try {
    // Request permissions (foreground and background)
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) {
      throw new Error('Location permission denied');
    }

    // Start watching for location changes
    locationSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 30000, // Check every 30 seconds
        distanceInterval: 100, // Update if moved 100+ meters (~0.06 miles)
      },
      async (location) => {
        logger.debug('📍 Movement detected (200m+), checking zones...');
        
        const currentLocation = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };

        lastKnownLocation = currentLocation;

        // Update zones on significant movement
        await checkLocationAndUpdateZones();
      }
    );

    logger.debug('Movement tracking started');
  } catch (error) {
    logger.error('Error starting movement tracking:', error);
    throw error;
  }
}

export function stopMovementTracking(): void {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
    lastKnownLocation = null;
    logger.debug('Movement tracking stopped');
  }
}

// Request location permissions (foreground and background)
export async function requestLocationPermissions(): Promise<boolean> {
  try {
    logger.debug('📍 Requesting foreground location permissions...');
    const foreground = await Location.requestForegroundPermissionsAsync();
    
    if (foreground.status !== 'granted') {
      logger.debug('❌ Foreground location permission denied');
      return false;
    }
    
    logger.debug('✅ Foreground location permission granted');
    logger.debug('📍 Requesting background location permissions...');
    
    const background = await Location.requestBackgroundPermissionsAsync();
    
    if (background.status !== 'granted') {
      logger.debug('⚠️ Background location permission denied - app will only work in foreground');
      // Still return true because foreground is granted
      // But log a warning
      return true;
    }
    
    logger.debug('✅ Background location permission granted - full functionality enabled');
    return true;
  } catch (error) {
    logger.error('Error requesting location permissions:', error);
    return false;
  }
}
