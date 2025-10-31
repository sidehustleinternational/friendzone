import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import * as Location from 'expo-location';
import { Home, Friend } from '../types';
import { logger } from '../utils/logger';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../types';

type MapScreenNavigationProp = BottomTabNavigationProp<MainTabParamList, 'Map'>;

export default function MapScreen() {
  const navigation = useNavigation<MapScreenNavigationProp>();
  const mapRef = useRef<MapView>(null);
  const [homes, setHomes] = useState<Home[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserZoneIds, setCurrentUserZoneIds] = useState<string[]>([]);
  const [mapZoom, setMapZoom] = useState(1);

  // Get user's current location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        logger.error('Location permission denied');
        setLoading(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      setLoading(false);
    })();
  }, []);

  // Subscribe to user's zones
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const homesQuery = query(
      collection(db, 'homes'),
      where('members', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(homesQuery, (snapshot) => {
      const homesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Home));
      
      logger.debug(`MapScreen: Loaded ${homesData.length} zones:`, homesData.map(h => h.name));
      
      // Debug each zone's location data
      homesData.forEach(home => {
        logger.debug(`Zone ${home.name}:`, {
          lat: home.location?.latitude,
          lng: home.location?.longitude,
          radius: home.radius
        });
      });
      
      setHomes(homesData);
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to friends with real-time location data
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Import the subscription function that includes real-time location updates
    const { subscribeToUserFriends } = require('../services/firebase');
    
    const unsubscribe = subscribeToUserFriends(currentUser.uid, (friendsData: Friend[]) => {
      setFriends(friendsData);
      logger.debug('MapScreen: Loaded friends with location data:', friendsData.length);
      
      // Debug friend location data
      friendsData.forEach(f => {
        if (f.isCurrentlyAtHome && f.currentHomeIds) {
          logger.debug(`  ${f.name}: at home in zones ${f.currentHomeIds.join(', ')}`);
        }
      });
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to current user's zone status
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const userDocRef = collection(db, 'users');
    const userQuery = query(userDocRef, where('__name__', '==', currentUser.uid));

    const unsubscribe = onSnapshot(userQuery, (snapshot) => {
      if (!snapshot.empty) {
        const userData = snapshot.docs[0].data();
        setCurrentUserZoneIds(userData.currentHomeIds || []);
      }
    });

    return () => unsubscribe();
  }, []);

  // Center map on user location when tab is focused
  useFocusEffect(
    React.useCallback(() => {
      if (userLocation && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.5, // State-level zoom (roughly 50 miles)
          longitudeDelta: 0.5,
        }, 1000); // 1 second animation
      }
    }, [userLocation])
  );

  // Calculate friend counts for each zone
  const getZoneFriendCount = (zoneId: string): { here: number; total: number } => {
    const friendsWithAccess = friends.filter(f => f.sharedHomes?.includes(zoneId));
    const friendsHere = friendsWithAccess.filter(f => {
      // Check if friend is marked as at home and in this zone
      const isAtThisZone = f.isCurrentlyAtHome && f.currentHomeIds?.includes(zoneId);
      if (!isAtThisZone) return false;
      
      // Filter out friends with stale locations (>12 hours old)
      if (!f.lastSeen) return false;
      
      const now = Date.now();
      const lastSeen: any = f.lastSeen; // Type assertion for Firestore Timestamp handling
      const lastSeenTimestamp = typeof lastSeen === 'number' 
        ? lastSeen 
        : lastSeen.toDate?.() 
        ? lastSeen.toDate().getTime()
        : lastSeen.seconds
        ? lastSeen.seconds * 1000
        : new Date(lastSeen).getTime();
      
      const ageHours = (now - lastSeenTimestamp) / (1000 * 60 * 60);
      
      // Only count friends with location data less than 12 hours old
      return ageHours < 12;
    });
    
    return {
      here: friendsHere.length,
      total: friendsWithAccess.length,
    };
  };

  // Calculate zoom level from latitude delta
  const calculateZoomLevel = (latitudeDelta: number) => {
    // Zoom level calculation: smaller delta = higher zoom
    // Base zoom at delta 0.1 = 1x, scale inversely
    return Math.max(0.5, Math.min(3, 0.1 / latitudeDelta));
  };

  // Get zoom-responsive text sizes
  const getTextSizes = () => {
    const baseZoneNameSize = 24; // Much larger base size
    const baseFriendCountSize = 26; // Much larger base size
    
    logger.debug(`Text sizes: zone=${Math.round(baseZoneNameSize * mapZoom)}, count=${Math.round(baseFriendCountSize * mapZoom)}, zoom=${mapZoom.toFixed(2)}`);
    
    return {
      zoneName: Math.round(baseZoneNameSize * mapZoom),
      friendCount: Math.round(baseFriendCountSize * mapZoom),
    };
  };

  // Handle map region changes to update zoom
  const handleRegionChange = (region: any) => {
    const newZoom = calculateZoomLevel(region.latitudeDelta);
    logger.debug(`Map zoom changed: ${newZoom.toFixed(2)} (delta: ${region.latitudeDelta.toFixed(4)})`);
    setMapZoom(newZoom);
  };

  // Calculate map region to fit all zones
  const getMapRegion = () => {
    if (homes.length === 0 && userLocation) {
      return {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }

    if (homes.length === 0) {
      // Default to Boston area
      return {
        latitude: 42.3601,
        longitude: -71.0589,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    // Calculate bounding box
    const lats = homes.map(h => h.location.latitude);
    const lngs = homes.map(h => h.location.longitude);
    
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    const latDelta = (maxLat - minLat) * 0.8; // Less padding = more zoomed in
    const lngDelta = (maxLng - minLng) * 0.8;

    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: Math.max(latDelta, 0.03), // Smaller minimum = more zoom
      longitudeDelta: Math.max(lngDelta, 0.03),
    };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF5A5F" />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={getMapRegion()}
        onRegionChangeComplete={handleRegionChange}
        showsUserLocation={true}
        showsMyLocationButton={true}
        mapType="standard"
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsTraffic={false}
      >
        {homes
          .filter(home => home.location?.latitude && home.location?.longitude)
          .map(home => {
          const { here, total } = getZoneFriendCount(home.id);
          const isCurrentZone = currentUserZoneIds.includes(home.id);
          const radiusInMeters = home.radius * 1609.34; // Convert miles to meters for map display
          const textSizes = getTextSizes();

          return (
            <React.Fragment key={home.id}>
              {/* Zone circle */}
              <Circle
                center={{
                  latitude: home.location.latitude,
                  longitude: home.location.longitude,
                }}
                radius={radiusInMeters}
                fillColor={
                  isCurrentZone 
                    ? 'rgba(30, 144, 255, 0.6)' // Brighter blue if you're here
                    : here > 0 
                    ? 'rgba(76, 175, 80, 0.6)' // Brighter green if friends are here
                    : 'rgba(255, 152, 0, 0.5)' // Orange if empty - more colorful
                }
                strokeColor={
                  isCurrentZone 
                    ? '#1E90FF' // Solid blue
                    : here > 0 
                    ? '#4CAF50' // Solid green
                    : '#FF9800' // Solid orange
                }
                strokeWidth={5}
                zIndex={1}
              />
              
              {/* Friend count marker */}
              <Marker
                key={`${home.id}-${mapZoom.toFixed(2)}`}
                coordinate={{
                  latitude: home.location.latitude,
                  longitude: home.location.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={2}
                onPress={() => {
                  // Navigate to Zones tab
                  navigation.navigate('Zones');
                }}
              >
                <View style={styles.markerContainer}>
                  <Text style={[
                    styles.zoneName,
                    { fontSize: textSizes.zoneName },
                    isCurrentZone && styles.zoneNameCurrent,
                    here > 0 && !isCurrentZone && styles.zoneNameActive,
                  ]}>{home.name}</Text>
                  <Text style={[
                    styles.friendCount,
                    { fontSize: textSizes.friendCount },
                    isCurrentZone && styles.friendCountCurrent,
                    here > 0 && !isCurrentZone && styles.friendCountActive,
                  ]}>
                    {here}/{total}
                  </Text>
                </View>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Semi-transparent overlay to fade the map */}
      <View style={styles.mapOverlay} pointerEvents="none" />
      
      {homes.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No zones yet. Create your first zone on the Zones tab!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 1,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  zoneNameCurrent: {
    color: '#000000',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
  },
  zoneNameActive: {
    color: '#000000',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
  },
  friendCount: {
    fontSize: 14,
    fontWeight: 'normal',
    color: '#000000',
    textAlign: 'center',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  friendCountCurrent: {
    color: '#000000',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
  },
  friendCountActive: {
    color: '#000000',
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
  },
  emptyState: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
  },
});
