import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, CompositeNavigationProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {RootStackParamList, MainTabParamList, Home, Friend} from '../types';
import {geocodeAddress} from '../services/geocoding';
import {
  createHome,
  subscribeToUserHomes,
  subscribeToUserFriends,
  findSimilarZones,
  saveZoneNickname,
  getUserZoneNicknames,
} from '../services/firebase';
import {auth, db} from '../../firebaseConfig';
import { doc, onSnapshot, collection, deleteDoc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import {getGoogleMapsApiKey} from '../services/config';
import * as Location from 'expo-location';
// Using V3 location service (geofencing-based)
import {
  startLocationService,
  stopLocationService,
  requestLocationPermissions,
  refreshGeofencingRegions,
} from '../services/locationServiceV3';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

type HomesScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Zones'>,
  StackNavigationProp<RootStackParamList>
>;

// Get staleness indicator for friend's location
const getLocationStaleness = (lastSeen: any): { icon: string; text: string; isStale: boolean; veryStale: boolean } => {
  if (!lastSeen) {
    return { icon: '❓', text: 'Location unknown', isStale: true, veryStale: true };
  }
  
  const now = Date.now();
  // Convert lastSeen to timestamp (handle Firestore Timestamps)
  let lastSeenTimestamp: number;
  if (typeof lastSeen === 'number') {
    lastSeenTimestamp = lastSeen;
  } else if (lastSeen.toDate && typeof lastSeen.toDate === 'function') {
    // Firestore Timestamp
    lastSeenTimestamp = lastSeen.toDate().getTime();
  } else if (lastSeen.seconds) {
    // Firestore Timestamp-like object
    lastSeenTimestamp = lastSeen.seconds * 1000;
  } else if (lastSeen instanceof Date) {
    lastSeenTimestamp = lastSeen.getTime();
  } else {
    // Try to convert as Date
    lastSeenTimestamp = new Date(lastSeen).getTime();
  }
  
  // Check if conversion resulted in NaN
  if (isNaN(lastSeenTimestamp)) {
    return { icon: '❓', text: 'Location unknown', isStale: true, veryStale: true };
  }
  
  const ageMinutes = (now - lastSeenTimestamp) / (1000 * 60);
  const ageHours = ageMinutes / 60;
  
  if (ageMinutes < 30) {
    // Fresh location (< 30 min)
    return { icon: '✓', text: '', isStale: false, veryStale: false };
  } else if (ageHours < 12) {
    // Stale but still show in zone (< 12 hours)
    const hours = Math.floor(ageHours);
    return { icon: '⏱', text: `${hours}h ago`, isStale: true, veryStale: false };
  } else {
    // Very stale (>= 12 hours) - remove from zone, show in Friends only
    const hours = Math.floor(ageHours);
    return { icon: '❓', text: `${hours}h ago`, isStale: true, veryStale: true };
  }
};

// Consolidate duplicate friends by friendUserId, combining their shared zones
const consolidateFriends = (friendsData: Friend[]): Friend[] => {
  const friendsMap = new Map<string, Friend>();
  
  friendsData.forEach(friend => {
    const key = friend.friendUserId || friend.phoneNumber; // Use friendUserId as primary key
    
    if (friendsMap.has(key)) {
      // Merge shared homes for existing friend
      const existingFriend = friendsMap.get(key)!;
      const combinedHomes = [...new Set([...existingFriend.sharedHomes, ...friend.sharedHomes])];
      friendsMap.set(key, {
        ...existingFriend,
        sharedHomes: combinedHomes,
        // Keep the most recent location data
        isCurrentlyAtHome: friend.isCurrentlyAtHome ?? existingFriend.isCurrentlyAtHome,
        currentHomeIds: friend.currentHomeIds ?? existingFriend.currentHomeIds,
        lastSeen: Math.max(friend.lastSeen || 0, existingFriend.lastSeen || 0),
      });
    } else {
      // Add new friend
      friendsMap.set(key, friend);
    }
  });
  
  return Array.from(friendsMap.values());
};

export default function HomesScreen() {
  const navigation = useNavigation<HomesScreenNavigationProp>();
  const [homes, setHomes] = useState<Home[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [newHomeName, setNewHomeName] = useState('');
  const [newHomeLocation, setNewHomeLocation] = useState('');
  const [newHomeRadius, setNewHomeRadius] = useState('5');
  const [creating, setCreating] = useState(false);
  const [loadingCurrentLocation, setLoadingCurrentLocation] = useState(false);
  
  // Zone nicknames - personal names for zones
  const [zoneNicknames, setZoneNicknames] = useState<{[zoneId: string]: string}>({});
  
  // Collapsible zones state (persisted)
  const [collapsedZones, setCollapsedZones] = useState<{[key: string]: boolean}>({});
  
  // Collapsible sections within zones (Here/Not Here)
  const [collapsedSections, setCollapsedSections] = useState<{[key: string]: boolean}>({});
  
  // Sharing settings
  const [sharingMode, setSharingMode] = useState<'all' | 'current' | 'off'>('all');
  const [showSharingModal, setShowSharingModal] = useState(false);
  
  // Current user location state
  const [currentUserZoneIds, setCurrentUserZoneIds] = useState<string[]>([]);
  const [isAtZone, setIsAtZone] = useState(false);
  
  // Edit zone state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingZone, setEditingZone] = useState<Home | null>(null);
  const [editZoneName, setEditZoneName] = useState('');
  const [editZoneLocation, setEditZoneLocation] = useState('');
  const [editZoneRadius, setEditZoneRadius] = useState('');
  
  // Delete zone modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [zoneToDelete, setZoneToDelete] = useState<Home | null>(null);
  const [deleteZone, setDeleteZone] = useState(true);
  const [deleteFriends, setDeleteFriends] = useState(false);

  // Phone/Text handlers
  const handleCall = (phoneNumber: string) => {
    // Clean and format phone number for calling
    const cleanNumber = phoneNumber.replace(/\D/g, ''); // Remove all non-digits
    const formattedNumber = cleanNumber.startsWith('1') ? cleanNumber : `1${cleanNumber}`; // Add country code if missing
    const url = `tel:+${formattedNumber}`;
    
    logger.debug(`Opening call for: ${phoneNumber} -> cleaned: ${cleanNumber} -> formatted: +${formattedNumber}`);
    
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Alert.alert('Error', 'Phone calls are not supported on this device');
        }
      })
      .catch((err) => logger.error('Error opening phone app:', err));
  };

  const handleText = (phoneNumber: string) => {
    // Clean phone number
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const url = `sms:${cleanNumber}`;
    
    logger.debug(`Opening SMS for: ${phoneNumber} -> ${url}`);
    
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          // Fallback: Show alert with number
          Alert.alert(
            'Text Message', 
            `SMS not available on simulator.\n\nPhone: ${phoneNumber}\n\nThis feature works on real devices.`,
            [{ text: 'OK' }]
          );
        }
      })
      .catch((err) => {
        logger.error('Error opening messages app:', err);
        Alert.alert(
          'Text Message', 
          `Phone: ${phoneNumber}\n\nNote: SMS may not work properly on simulators.`,
          [{ text: 'OK' }]
        );
      });
  };

  // Load collapsed zones state from AsyncStorage on mount
  useEffect(() => {
    const loadCollapsedState = async () => {
      try {
        const saved = await AsyncStorage.getItem('collapsedZones');
        if (saved) {
          setCollapsedZones(JSON.parse(saved));
          logger.debug('Loaded collapsed zones state:', JSON.parse(saved));
        }
      } catch (error) {
        logger.error('Error loading collapsed zones state:', error);
      }
    };
    loadCollapsedState();
  }, []);

  // Toggle zone collapse state and persist to AsyncStorage
  const toggleZoneCollapse = async (homeId: string) => {
    const newState = {
      ...collapsedZones,
      [homeId]: !collapsedZones[homeId]
    };
    setCollapsedZones(newState);
    
    // Save to AsyncStorage
    try {
      await AsyncStorage.setItem('collapsedZones', JSON.stringify(newState));
      logger.debug('Saved collapsed zones state');
    } catch (error) {
      logger.error('Error saving collapsed zones state:', error);
    }
  };

  // Toggle section collapse state (Here/Not Here)
  const toggleSectionCollapse = (sectionKey: string) => {
    setCollapsedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Handle edit zone
  const handleEditZone = (zone: Home) => {
    setEditingZone(zone);
    // Use nickname if it exists, otherwise use zone name
    setEditZoneName(getZoneDisplayName(zone));
    setEditZoneLocation(zone.location.address);
    setEditZoneRadius(zone.radius.toString());
    setEditModalVisible(true);
  };

  // Handle save edited zone - respect ownership permissions
  const handleSaveEditedZone = async () => {
    if (!editingZone) {
      logger.error('No editing zone set');
      return;
    }
    
    logger.debug(`Saving zone edits: name="${editZoneName}", radius="${editZoneRadius}"`);
    
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'You must be signed in to edit zones');
      return;
    }

    const isOwner = isZoneOwner(editingZone);
    const nameChanged = editZoneName.trim() !== editingZone.name;
    const radiusValue = parseFloat(editZoneRadius);
    const radiusChanged = radiusValue !== editingZone.radius;
    
    // Validate radius if changed
    if (radiusChanged && (isNaN(radiusValue) || radiusValue <= 0)) {
      Alert.alert('Invalid Radius', 'Please enter a valid radius greater than 0');
      return;
    }

    // NON-OWNERS: Can only create personal nicknames
    if (!isOwner) {
      if (nameChanged) {
        try {
          await saveZoneNickname(currentUser.uid, editingZone.id, editZoneName.trim());
          setZoneNicknames(prev => ({
            ...prev,
            [editingZone.id]: editZoneName.trim()
          }));
          setEditModalVisible(false);
          setEditingZone(null);
          Alert.alert('Success', 'Zone renamed for you only');
        } catch (error) {
          logger.error('Error saving nickname:', error);
          Alert.alert('Error', 'Failed to save nickname');
        }
      } else {
        // No changes
        setEditModalVisible(false);
        setEditingZone(null);
      }
      return;
    }

    // OWNERS: Can rename globally or personally, and can edit radius
    if (nameChanged) {
      // Ask owner if they want to rename globally or just for themselves
      Alert.alert(
        'Rename Zone',
        'How would you like to rename this zone?',
        [
          {
            text: 'Just for Me',
            onPress: async () => {
              try {
                // Save personal nickname
                await saveZoneNickname(currentUser.uid, editingZone.id, editZoneName.trim());
                setZoneNicknames(prev => ({
                  ...prev,
                  [editingZone.id]: editZoneName.trim()
                }));
                
                // Update radius if changed
                if (radiusChanged) {
                  const zoneRef = doc(db, 'homes', editingZone.id);
                  await updateDoc(zoneRef, { radius: radiusValue });
                }
                
                setEditModalVisible(false);
                setEditingZone(null);
                Alert.alert('Success', 'Zone renamed for you only' + (radiusChanged ? ' and radius updated' : ''));
              } catch (error) {
                logger.error('Error saving changes:', error);
                Alert.alert('Error', 'Failed to save changes');
              }
            }
          },
          {
            text: 'For Everyone',
            onPress: async () => {
              try {
                // Update zone name globally
                const zoneRef = doc(db, 'homes', editingZone.id);
                const updates: any = { name: editZoneName.trim() };
                if (radiusChanged) {
                  updates.radius = radiusValue;
                }
                await updateDoc(zoneRef, updates);
                
                setEditModalVisible(false);
                setEditingZone(null);
                Alert.alert('Success', 'Zone updated for everyone');
              } catch (error) {
                logger.error('Error updating zone:', error);
                Alert.alert('Error', 'Failed to update zone');
              }
            }
          },
          {
            text: 'Cancel',
            style: 'cancel'
          }
        ]
      );
    } else if (radiusChanged) {
      // Only radius changed, update globally (owner only)
      try {
        const zoneRef = doc(db, 'homes', editingZone.id);
        await updateDoc(zoneRef, { radius: radiusValue });
        
        setEditModalVisible(false);
        setEditingZone(null);
        Alert.alert('Success', 'Zone radius updated');
      } catch (error) {
        logger.error('Error updating zone:', error);
        Alert.alert('Error', 'Failed to update zone');
      }
    } else {
      // No changes
      setEditModalVisible(false);
      setEditingZone(null);
    }
  };

  // Helper function to check if current user is the zone owner
  const isZoneOwner = (zone: Home): boolean => {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;
    // Check both createdBy and userId for backwards compatibility
    return zone.createdBy === currentUser.uid || zone.userId === currentUser.uid;
  };

  // Helper function to get display name for a zone (nickname if exists, otherwise zone name)
  const getZoneDisplayName = (zone: Home): string => {
    return zoneNicknames[zone.id] || zone.name;
  };

  // Initialize location tracking and load homes when component mounts
  useEffect(() => {
    const initializeLocationTracking = async () => {
      try {
        const hasPermission = await requestLocationPermissions();
        if (hasPermission) {
          logger.debug('Location permissions granted, starting V3 geofencing service');
          // Start the geofencing-based location service
          await startLocationService();
          logger.debug('✅ Location service started successfully');
        } else {
          logger.error('❌ Location permissions denied');
          Alert.alert(
            'Location Permission Required',
            'FriendZone needs "Always" location permission to detect when you arrive at zones. Please enable it in Settings.',
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        logger.error('❌ Failed to start location service:', error);
        Alert.alert(
          'Location Service Error',
          'Failed to start location tracking. Please restart the app or check your location permissions.',
          [{ text: 'OK' }]
        );
      }
    };

    initializeLocationTracking();

    // Subscribe to user's homes and friends from Firebase
    const currentUser = auth.currentUser;
    let unsubscribeHomes: (() => void) | undefined;
    let unsubscribeFriends: (() => void) | undefined;
    
    if (currentUser) {
      // Load user's zone nicknames
      getUserZoneNicknames(currentUser.uid).then(nicknames => {
        setZoneNicknames(nicknames);
      });
      
      unsubscribeHomes = subscribeToUserHomes(currentUser.uid, (homesData) => {
        logger.debug('HomesScreen: Received homes data:', homesData);
        // Sort zones alphabetically by name
        const sortedHomes = [...homesData].sort((a, b) => {
          const nameA = zoneNicknames[a.id] || a.name;
          const nameB = zoneNicknames[b.id] || b.name;
          return nameA.localeCompare(nameB);
        });
        setHomes(sortedHomes);
      });

      unsubscribeFriends = subscribeToUserFriends(currentUser.uid, (friendsData) => {
        logger.debug('HomesScreen: Received friends data for user', currentUser.uid, ':', friendsData);
        logger.debug('HomesScreen: Friends count:', friendsData.length);
        
        // Consolidate duplicate friends
        const consolidatedFriends = consolidateFriends(friendsData);
        logger.debug('HomesScreen: Consolidated friends count:', consolidatedFriends.length);
        
        consolidatedFriends.forEach(friend => {
          logger.debug(`HomesScreen: Friend ${friend.name} - isAtHome: ${friend.isCurrentlyAtHome}, currentHomeIds: ${friend.currentHomeIds?.join(', ')}, sharedHomes: ${friend.sharedHomes}`);
        });
        setFriends(consolidatedFriends);
      });
    }

    return () => {
      stopLocationService();
      if (unsubscribeHomes) {
        unsubscribeHomes();
      }
      if (unsubscribeFriends) {
        unsubscribeFriends();
      }
    };
  }, []);

  // Fetch creator names for all zones
  useEffect(() => {
    const fetchCreatorNames = async () => {
      const names: Record<string, string> = {};
      for (const home of homes) {
        const creatorId = home.createdBy || home.userId;
        if (creatorId && !names[home.id]) {
          try {
            const userRef = doc(db, 'users', creatorId);
            const userDoc = await getDoc(userRef);
            const userData = userDoc.data();
            const fullName = userData?.name || 'Unknown';
            // Extract first name only
            const firstName = fullName.split(' ')[0];
            names[home.id] = firstName;
          } catch (error) {
            logger.error('Error fetching creator name:', error);
            names[home.id] = 'Unknown';
          }
        }
      }
      setCreatorNames(names);
    };

    if (homes.length > 0) {
      fetchCreatorNames();
    }
  }, [homes]);

  // Subscribe to current user's location to determine current zone
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // Clear state when signed out
      setIsAtZone(false);
      setCurrentUserZoneIds([]);
      return;
    }

    const userDocRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const userData = docSnap.data();
          setIsAtZone(userData.isAtHome || false);
          setCurrentUserZoneIds(userData.currentHomeIds || []);
          logger.debug(`🏠 Zone Status Update:`, {
            currentHomeIds: userData.currentHomeIds,
            isAtHome: userData.isAtHome,
            lastSeen: userData.lastSeen,
            lastLocation: userData.lastLocation
          });
        }
      },
      (error) => {
        // Handle permission errors gracefully (e.g., when user signs out)
        logger.error('Error in user location listener:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  // Helper function to get friends who are HERE at a specific home (not away)
  const getFriendsHereAtHome = (homeId: string): Friend[] => {
    const filteredFriends = friends.filter(friend => {
      const hasAccess = friend.sharedHomes?.includes(homeId);
      const isAtHome = friend.isCurrentlyAtHome && friend.currentHomeIds?.includes(homeId);
      
      // Check if location is too stale to trust (>30 minutes)
      const lastSeen = friend.lastSeen || 0;
      const now = Date.now();
      const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));
      const isTooStale = diffMinutes >= 30;
      
      // Only show as "here" if they have access, are marked as at home, AND location is fresh
      return hasAccess && isAtHome && !isTooStale;
    });

    
    return filteredFriends;
  };

  // Helper function to check if friend is currently at a specific home
  const isFriendAtHome = (friend: Friend, homeId: string): boolean => {
    const isMarkedAtHome = friend.isCurrentlyAtHome && friend.currentHomeIds?.includes(homeId);
    
    // Check if location is too stale to trust (>30 minutes)
    const lastSeen = friend.lastSeen || 0;
    const now = Date.now();
    const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));
    const isTooStale = diffMinutes >= 30;
    
    return !!(isMarkedAtHome && !isTooStale);
  };



  const handleGetCurrentLocation = async () => {
    try {
      setLoadingCurrentLocation(true);
      
      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is needed to get your current location.');
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Reverse geocode to get address
      const apiKey = getGoogleMapsApiKey();
      if (apiKey) {
        try {
          const response = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.coords.latitude},${location.coords.longitude}&key=${apiKey}`
          );
          const data = await response.json();
          
          if (data.results && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            setNewHomeLocation(address);
          } else {
            // Fallback to coordinates if no address found
            setNewHomeLocation(`${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`);
          }
        } catch (error) {
          // Fallback to coordinates if geocoding fails
          setNewHomeLocation(`${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`);
        }
      } else {
        // Fallback to coordinates if no API key
        setNewHomeLocation(`${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to get your current location. Please try again.');
      logger.error('Error getting current location:', error);
    } finally {
      setLoadingCurrentLocation(false);
    }
  };

  const handleCreateHome = async () => {
    // Input validation
    if (!newHomeName.trim() || !newHomeLocation.trim()) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    // Validate zone name length
    if (newHomeName.trim().length < 2 || newHomeName.trim().length > 50) {
      Alert.alert('Invalid Name', 'Zone name must be between 2 and 50 characters.');
      return;
    }

    // Validate radius
    const radius = parseInt(newHomeRadius);
    if (isNaN(radius) || radius < 0.1 || radius > 100) {
      Alert.alert('Invalid Radius', 'Radius must be between 0.1 and 100 miles.');
      return;
    }

    // Sanitize zone name (remove special characters that could cause issues)
    const sanitizedName = newHomeName.trim().replace(/[<>]/g, '');
    if (sanitizedName !== newHomeName.trim()) {
      Alert.alert('Invalid Characters', 'Zone name cannot contain < or > characters.');
      return;
    }

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      Alert.alert(
        'Missing API key',
        'Google Maps API key is not configured. Please add it in configuration to enable geocoding.'
      );
      return;
    }

    try {
      setCreating(true);
      const coords = await geocodeAddress({address: newHomeLocation}, apiKey);
      
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'You must be signed in to create a home.');
        return;
      }

      // Check for similar zones nearby (within 5 miles)
      const similarZones = await findSimilarZones(coords.latitude, coords.longitude, currentUser.uid);
      
      if (similarZones.length > 0) {
        // Found nearby zones - ask user if they want to use existing or create new
        setCreating(false);
        const zone = similarZones[0];
        const distanceText = zone.distance < 0.1 ? 'same location' : `${zone.distance.toFixed(1)} miles away`;
        
        Alert.alert(
          'Nearby Zone Found',
          `A zone already exists nearby: "${zone.name}" (created by ${zone.creatorName}, ${distanceText}).\n\nWould you like to join this zone instead of creating a new one?\n\nNote: You'll only see your friends in this zone, not other users.`,
          [
            {
              text: 'Join Existing Zone',
              onPress: async () => {
                // Add user to existing zone's members
                try {
                  const homeRef = doc(db, 'homes', zone.id);
                  await updateDoc(homeRef, {
                    members: arrayUnion(currentUser.uid)
                  });
                  setModalVisible(false);
                  setNewHomeName('');
                  setNewHomeLocation('');
                  setNewHomeRadius('5');
                  Alert.alert('Success', `You've joined "${zone.name}"!`);
                } catch (error) {
                  logger.error('Error joining zone:', error);
                  Alert.alert('Error', 'Failed to join zone. Please try again.');
                }
              }
            },
            {
              text: 'Create My Own',
              onPress: async () => {
                setCreating(true);
                await createZone(currentUser.uid, coords);
              }
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        );
        return;
      }

      // No duplicates - create the zone
      await createZone(currentUser.uid, coords);
    } catch (e: any) {
      Alert.alert('Geocoding failed', e?.message ?? 'Unable to geocode address.');
    } finally {
      setCreating(false);
    }
  };

  // Helper function to create zone
  const createZone = async (userId: string, coords: { latitude: number; longitude: number }) => {
    try {
      // Check if user will exceed 20 zones (iOS geofencing limit)
      const currentZoneCount = homes.length;
      if (currentZoneCount >= 20) {
        // Show warning about iOS 20-zone limit
        Alert.alert(
          '⚠️ Zone Limit Notice',
          `You now have ${currentZoneCount + 1} zones. iOS can only monitor the 20 closest zones to your location. Distant zones may not trigger notifications until you get closer.`,
          [{ text: 'OK' }]
        );
      }

      // Create home data without ID (Firebase will generate it)
      const homeData = {
        name: newHomeName,
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          address: newHomeLocation,
        },
        radius: parseInt(newHomeRadius),
        createdBy: userId,
        members: [userId],
      };

      // Save to Firebase
      const createdHome = await createHome(homeData);
      logger.debug('Home created in Firebase:', createdHome);

      // Refresh geofencing regions to include the new zone
      logger.debug('📍 New zone created - refreshing geofencing regions');
      await refreshGeofencingRegions();

      setModalVisible(false);
      setNewHomeName('');
      setNewHomeLocation('');
      setNewHomeRadius('10');

      setTimeout(() => {
        Alert.alert(
          'Home Created',
          'Would you like to add friends to this home?',
          [
            {text: 'Later', style: 'cancel'},
            {
              text: 'Invite Friends',
              onPress: () => navigation.navigate('SelectFriends'),
            },
          ]
        );
      }, 500);
    } catch (e: any) {
      Alert.alert('Geocoding failed', e?.message ?? 'Unable to geocode address.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteZone = async () => {
    if (!zoneToDelete) return;

    try {
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const isOwner = isZoneOwner(zoneToDelete);

      // Get all friends that have this zone in their sharedHomes
      const friendsInZone = friends.filter(f => f.sharedHomes.includes(zoneToDelete.id));

      if (isOwner) {
        // OWNER: Can delete the zone entirely
        if (deleteFriends) {
          // Delete all friendships in parallel
          await Promise.all(
            friendsInZone.map(friend => deleteDoc(doc(db, 'friends', friend.id)))
          );
        } else {
          // Remove zone from all friend records in parallel
          await Promise.all(
            friendsInZone.map(friend => {
              const updatedSharedHomes = friend.sharedHomes.filter(id => id !== zoneToDelete.id);
              return updateDoc(doc(db, 'friends', friend.id), {
                sharedHomes: updatedSharedHomes,
                activeHomes: friend.activeHomes?.filter(id => id !== zoneToDelete.id) || []
              });
            })
          );
          logger.debug(`🧹 Cleaned up zone references from ${friendsInZone.length} friend records`);
        }

        // Delete the zone if checkbox is selected
        if (deleteZone) {
          logger.debug(`🗑️ Deleting zone: ${zoneToDelete.name} (${zoneToDelete.id})`);
          await deleteDoc(doc(db, 'homes', zoneToDelete.id));
          logger.debug(`✅ Zone deleted from Firebase: ${zoneToDelete.name}`);
        }
      } else {
        // NON-OWNER: Can only leave the zone (remove self from members)
        logger.debug(`👋 Leaving zone: ${zoneToDelete.name} (${zoneToDelete.id})`);
        
        // Do both operations in parallel
        await Promise.all([
          // Remove self from zone members
          updateDoc(doc(db, 'homes', zoneToDelete.id), {
            members: zoneToDelete.members?.filter(id => id !== userId) || []
          }),
          // Remove zone from all friend records
          ...friendsInZone.map(friend => {
            const updatedSharedHomes = friend.sharedHomes.filter(id => id !== zoneToDelete.id);
            return updateDoc(doc(db, 'friends', friend.id), {
              sharedHomes: updatedSharedHomes,
              activeHomes: friend.activeHomes?.filter(id => id !== zoneToDelete.id) || []
            });
          })
        ]);
        
        logger.debug(`✅ Left zone: ${zoneToDelete.name}`);
      }

      // Refresh geofencing regions after deletion/leaving
      logger.debug('📍 Zone deleted/left - refreshing geofencing regions');
      await refreshGeofencingRegions();

      Alert.alert('Success', isOwner ? 'Deletion completed' : 'You have left the zone');
    } catch (error) {
      logger.error('Error deleting:', error);
      Alert.alert('Error', 'Failed to complete action. Please try again.');
    } finally {
      setDeleteModalVisible(false);
      setZoneToDelete(null);
      setDeleteZone(true);
      setDeleteFriends(false);
    }
  };

  const renderRightActionsForZone = (home: Home) => () => {
    return (
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => {
          setZoneToDelete(home);
          setDeleteModalVisible(true);
        }}
      >
        <Ionicons name="trash" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    );
  };

  const renderHome = (home: Home) => {
    // Get all friends connected to this zone
    const allFriendsInZone = friends.filter(f => f.sharedHomes && f.sharedHomes.includes(home.id));
    
    // DEBUG: Log what we found
    if (home.name === 'Weston' || home.name === 'Dallas' || home.name === 'Philly') {
      logger.debug(`🔍 ${home.name} zone (${home.id}): Found ${allFriendsInZone.length} friends`);
      logger.debug(`   Total friends in app: ${friends.length}`);
      friends.forEach(f => {
        logger.debug(`   Friend ${f.name}: sharedHomes = [${f.sharedHomes?.join(', ')}]`);
        if (f.sharedHomes?.includes(home.id)) {
          logger.debug(`     ✅ MATCHES ${home.name}`);
        }
      });
    }
    
    // Split into "Here" and "Not Here" - check if friend's currentHomeIds includes this zone
    const friendsHere = allFriendsInZone.filter(f => {
      const hasCurrentHomeIds = f.currentHomeIds && f.currentHomeIds.includes(home.id);
      const isMarkedAtHome = f.isCurrentlyAtHome;
      
      // Check if location is too stale (>12 hours) - if so, don't show as "here"
      const staleness = getLocationStaleness(f.lastSeen);
      if (staleness.veryStale) {
        return false; // Don't show as "here" if location is >12 hours old
      }
      
      // Debug logging for friends not showing
      if (hasCurrentHomeIds && !isMarkedAtHome) {
        logger.debug(`⚠️ Friend ${f.name} has currentHomeIds including ${home.name} but isCurrentlyAtHome is false`);
      }
      if (!hasCurrentHomeIds && isMarkedAtHome) {
        logger.debug(`⚠️ Friend ${f.name} is marked at home but currentHomeIds doesn't include ${home.name}`);
      }
      
      return isMarkedAtHome && hasCurrentHomeIds;
    });
    
    // Everyone else is "not here" (away) - show ALL friends regardless of staleness
    // Simply exclude friends who are in the "here" list
    const friendsNotHere = allFriendsInZone.filter(f => !friendsHere.includes(f));
    
    const totalFriends = allFriendsInZone.length;
    const isCollapsed = collapsedZones[home.id] || false;
    const isCurrentZone = currentUserZoneIds.includes(home.id);

    return (
      <Swipeable
        key={home.id}
        renderRightActions={renderRightActionsForZone(home)}
        overshootRight={false}
      >
        <View style={[styles.homeCard, isCurrentZone && styles.currentZoneCard]}>
          {/* Header: Zone name and Invite button */}
          <View style={styles.homeHeader}>
            <TouchableOpacity 
              style={styles.zoneHeaderButton}
              onPress={() => toggleZoneCollapse(home.id)}
            >
              <View style={styles.zoneNameRow}>
                {totalFriends > 0 ? (
                  <Ionicons 
                    name="caret-forward" 
                    size={14} 
                    color="#000000" 
                    style={[styles.chevronIcon, !isCollapsed && styles.chevronDown]}
                  />
                ) : (
                  <View style={styles.chevronPlaceholder} />
                )}
                <View style={{flex: 1}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6}}>
                    <Text style={styles.homeName}>{getZoneDisplayName(home)}</Text>
                    {isCurrentZone && (
                      <Ionicons name="location" size={16} color="#1E90FF" />
                    )}
                    {totalFriends > 0 && (
                      <Text style={styles.friendCount}>
                        ({friendsHere.length}/{totalFriends})
                      </Text>
                    )}
                  </View>
                  {creatorNames[home.id] && (
                    <Text style={styles.creatorName}>Created by {creatorNames[home.id]}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <TouchableOpacity
                style={styles.addFriendsButton}
                onPress={() => navigation.navigate('SelectFriends', { preSelectedZoneId: home.id })}
              >
                <Ionicons name="person-add" size={16} color="#FFFFFF" style={{marginRight: 4}} />
                <Text style={styles.addFriendsButtonText}>Invite</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.gearButton}
                onPress={() => handleEditZone(home)}
              >
                <Ionicons name="settings-outline" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Collapsible Content */}
          {!isCollapsed && totalFriends > 0 && (
            <View style={styles.friendsContainer}>
              {/* Show friends who are HERE (always visible) */}
              {friendsHere.map((friend: Friend) => {
                const staleness = getLocationStaleness(friend.lastSeen);
                return (
                  <View key={friend.id} style={styles.friendRow}>
                    <View style={styles.friendNameContainer}>
                      <Text style={styles.friendRowName}>
                        {staleness.icon} {friend.name}
                      </Text>
                      {staleness.isStale && staleness.text && (
                        <Text style={styles.staleText}>{staleness.text}</Text>
                      )}
                    </View>
                    <View style={styles.friendRowActions}>
                      <TouchableOpacity
                        style={styles.smallActionButton}
                        onPress={() => handleCall(friend.phoneNumber)}
                      >
                        <Ionicons name="call" size={16} color="#007AFF" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.smallActionButton}
                        onPress={() => handleText(friend.phoneNumber)}
                      >
                        <Ionicons name="chatbubble" size={16} color="#007AFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              
              {/* Show "X more" button for friends NOT HERE (collapsed by default) */}
              {friendsNotHere.length > 0 && (
                <>
                  <TouchableOpacity
                    style={styles.showMoreButton}
                    onPress={() => setCollapsedSections(prev => ({
                      ...prev,
                      [home.id]: !prev[home.id]
                    }))}
                  >
                    <Ionicons 
                      name={collapsedSections[home.id] ? "chevron-down" : "chevron-forward"}
                      size={14}
                      color="#717171"
                    />
                    <Text style={styles.showMoreText}>
                      {collapsedSections[home.id] ? 'Hide' : 'Show'} {friendsNotHere.length} away
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Show friends NOT HERE when expanded */}
                  {collapsedSections[home.id] && friendsNotHere.map((friend: Friend) => (
                    <View key={friend.id} style={styles.friendRow}>
                      <Text style={styles.friendRowNameInactive}>
                        {friend.name}
                      </Text>
                      <View style={styles.friendRowActions}>
                        <TouchableOpacity
                          style={styles.smallActionButton}
                          onPress={() => handleCall(friend.phoneNumber)}
                        >
                          <Ionicons name="call" size={16} color="#CCCCCC" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.smallActionButton}
                          onPress={() => handleText(friend.phoneNumber)}
                        >
                          <Ionicons name="chatbubble" size={16} color="#CCCCCC" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </View>
      </Swipeable>
    );
  };

  const getSharingModeText = () => {
    switch (sharingMode) {
      case 'all': return 'All Friends';
      case 'current': return 'Current Zone';
      case 'off': return 'Off';
    }
  };

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} allowFontScaling={false}>Zones</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[
              styles.sharingButton,
              sharingMode === 'off' ? styles.sharingButtonOff : styles.sharingButtonOn
            ]}
            onPress={() => setShowSharingModal(true)}
          >
            <Text style={[
              styles.sharingButtonText,
              sharingMode === 'off' ? styles.sharingButtonTextOff : styles.sharingButtonTextOn
            ]}>Sharing</Text>
            <Ionicons 
              name="chevron-down" 
              size={14} 
              color={sharingMode === 'off' ? '#FF5A5F' : '#FFFFFF'}
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addZoneButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" style={{marginRight: 2}} />
            <View style={styles.targetIcon}>
              <View style={styles.targetOuter} />
              <View style={styles.targetInner} />
            </View>
            <Text style={styles.addZoneButtonText} allowFontScaling={false}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {homes.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={() => setModalVisible(true)}
          >
            <View style={styles.emptyStateTargetIcon}>
              <View style={styles.emptyStateTargetOuter} />
              <View style={styles.emptyStateTargetInner} />
            </View>
            <Text style={styles.emptyStateButtonText}>Create Your First Zone</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <ScrollView style={styles.content}>

        {homes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No zones yet. Create your first zone to start sharing your location with friends!
            </Text>
          </View>
        ) : (
          <>
            {/* Current Zone Section */}
            <View style={styles.currentZoneSection}>
              <Text style={styles.sectionTitle} allowFontScaling={false}>
                {isAtZone && currentUserZoneIds.length > 1 ? 'Current Zones' : 'Current Zone'}
              </Text>
              {isAtZone && currentUserZoneIds.length > 0 ? (
                <>
                  {currentUserZoneIds.map(zoneId => {
                    const currentZone = homes.find(h => h.id === zoneId);
                    return currentZone ? (
                      <View key={zoneId}>
                        {renderHome(currentZone)}
                      </View>
                    ) : null;
                  })}
                </>
              ) : (
                <View style={styles.notAtZoneCard}>
                  <Text style={styles.notAtZoneText}>Not currently in a zone</Text>
                </View>
              )}
            </View>

            {/* My Zones Section */}
            {(() => {
              const currentUserId = auth.currentUser?.uid;
              const myZones = homes
                .filter(home => !currentUserZoneIds.includes(home.id) && home.createdBy === currentUserId)
                .sort((a, b) => a.name.localeCompare(b.name));
              
              return myZones.length > 0 ? (
                <View style={styles.otherZonesSection}>
                  <Text style={styles.sectionTitle} allowFontScaling={false}>My Zones</Text>
                  {myZones.map(renderHome)}
                </View>
              ) : null;
            })()}

            {/* Other Zones Section */}
            {(() => {
              const currentUserId = auth.currentUser?.uid;
              const otherZones = homes
                .filter(home => !currentUserZoneIds.includes(home.id) && home.createdBy !== currentUserId)
                .sort((a, b) => a.name.localeCompare(b.name));
              
              return otherZones.length > 0 ? (
                <View style={styles.otherZonesSection}>
                  <Text style={styles.sectionTitle} allowFontScaling={false}>Other Zones</Text>
                  {otherZones.map(renderHome)}
                </View>
              ) : null;
            })()}
          </>
        )}
      </ScrollView>
      )}

      {/* Create Home Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              setModalVisible(false);
              setNewHomeName('');
              setNewHomeLocation('');
              setNewHomeRadius('10');
            }}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Zone</Text>
            <TouchableOpacity onPress={handleCreateHome} disabled={creating}>
              <Text style={[styles.createButton, creating && styles.createButtonDisabled]}>
                {creating ? 'Creating…' : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Zone Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Stowe House"
              value={newHomeName}
              onChangeText={setNewHomeName}
              returnKeyType="next"
              blurOnSubmit={false}
            />

            <Text style={styles.inputLabel}>Location</Text>
            <View style={styles.locationInputContainer}>
              <TextInput
                style={styles.locationInput}
                placeholder="Enter zip code (e.g., 10001) or city, state (e.g., New York, NY)"
                value={newHomeLocation}
                onChangeText={setNewHomeLocation}
                returnKeyType="next"
                blurOnSubmit={false}
              />
              <TouchableOpacity 
                style={styles.currentLocationButton}
                onPress={handleGetCurrentLocation}
                disabled={loadingCurrentLocation}
              >
                {loadingCurrentLocation ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Ionicons name="location" size={20} color="#007AFF" />
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Radius (miles)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.5"
              value={newHomeRadius}
              onChangeText={setNewHomeRadius}
              keyboardType="decimal-pad"
              returnKeyType="done"
              blurOnSubmit={true}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Zone Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              setEditModalVisible(false);
              setEditingZone(null);
            }}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingZone && isZoneOwner(editingZone) ? 'Edit Zone' : 'Rename Zone'}
            </Text>
            <TouchableOpacity onPress={handleSaveEditedZone}>
              <Text style={styles.createButton}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {editingZone && !isZoneOwner(editingZone) && (
              <View style={styles.permissionNotice}>
                <Ionicons name="information-circle" size={20} color="#FF9500" />
                <Text style={styles.permissionNoticeText}>
                  You can rename this zone for yourself. Only the owner can change the location or radius.
                </Text>
              </View>
            )}

            <Text style={styles.inputLabel}>Zone Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Stowe House"
              value={editZoneName}
              onChangeText={setEditZoneName}
              returnKeyType="next"
              blurOnSubmit={false}
            />

            {editingZone && isZoneOwner(editingZone) && (
              <>
                <Text style={styles.inputLabel}>Location</Text>
                <TextInput
                  style={[styles.input, {backgroundColor: '#F0F0F0'}]}
                  placeholder="Location"
                  value={editZoneLocation}
                  editable={false}
                />
                <Text style={{fontSize: 12, color: '#999', marginTop: 4}}>
                  Location cannot be changed after creation
                </Text>

                <Text style={styles.inputLabel}>Radius (miles)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.5"
                  value={editZoneRadius}
                  onChangeText={setEditZoneRadius}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              </>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Sharing Settings Modal */}
      <Modal
        visible={showSharingModal}
        animationType="slide"
        presentationStyle="pageSheet"
        transparent={true}
      >
        <View style={styles.sharingModalOverlay}>
          <View style={styles.sharingModalContainer}>
            <View style={styles.sharingModalHeader}>
              <Text style={styles.sharingModalTitle}>Location Sharing</Text>
              <TouchableOpacity onPress={() => setShowSharingModal(false)}>
                <Ionicons name="close" size={24} color="#222222" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sharingModalDescription}>
              Choose who can see your location when you're at a zone
            </Text>

            <TouchableOpacity
              style={[
                styles.sharingOption,
                sharingMode === 'all' && styles.sharingOptionSelected
              ]}
              onPress={() => {
                setSharingMode('all');
                setShowSharingModal(false);
              }}
            >
              <View style={styles.sharingOptionContent}>
                <Ionicons 
                  name="people" 
                  size={24} 
                  color={sharingMode === 'all' ? '#FF5A5F' : '#666666'} 
                />
                <View style={styles.sharingOptionText}>
                  <Text style={[
                    styles.sharingOptionTitle,
                    sharingMode === 'all' && styles.sharingOptionTitleSelected
                  ]}>
                    All Friends
                  </Text>
                  <Text style={styles.sharingOptionSubtitle}>
                    Share with all your friends
                  </Text>
                </View>
              </View>
              {sharingMode === 'all' && (
                <Ionicons name="checkmark-circle" size={24} color="#FF5A5F" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sharingOption,
                sharingMode === 'current' && styles.sharingOptionSelected
              ]}
              onPress={() => {
                setSharingMode('current');
                setShowSharingModal(false);
              }}
            >
              <View style={styles.sharingOptionContent}>
                <Ionicons 
                  name="location" 
                  size={24} 
                  color={sharingMode === 'current' ? '#FF5A5F' : '#666666'} 
                />
                <View style={styles.sharingOptionText}>
                  <Text style={[
                    styles.sharingOptionTitle,
                    sharingMode === 'current' && styles.sharingOptionTitleSelected
                  ]}>
                    Friends in Current Zone
                  </Text>
                  <Text style={styles.sharingOptionSubtitle}>
                    Only share with friends at your current zone
                  </Text>
                </View>
              </View>
              {sharingMode === 'current' && (
                <Ionicons name="checkmark-circle" size={24} color="#FF5A5F" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sharingOption,
                sharingMode === 'off' && styles.sharingOptionSelected
              ]}
              onPress={() => {
                setSharingMode('off');
                setShowSharingModal(false);
              }}
            >
              <View style={styles.sharingOptionContent}>
                <Ionicons 
                  name="eye-off" 
                  size={24} 
                  color={sharingMode === 'off' ? '#FF5A5F' : '#666666'} 
                />
                <View style={styles.sharingOptionText}>
                  <Text style={[
                    styles.sharingOptionTitle,
                    sharingMode === 'off' && styles.sharingOptionTitleSelected
                  ]}>
                    Off
                  </Text>
                  <Text style={styles.sharingOptionSubtitle}>
                    Don't share your location
                  </Text>
                </View>
              </View>
              {sharingMode === 'off' && (
                <Ionicons name="checkmark-circle" size={24} color="#FF5A5F" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Zone Modal */}
      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {zoneToDelete && isZoneOwner(zoneToDelete) ? (
              <>
                <Text style={styles.modalTitle}>Delete {zoneToDelete?.name}?</Text>
                <Text style={styles.modalSubtitle}>Select what to delete:</Text>
                
                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() => setDeleteZone(!deleteZone)}
                >
                  <View style={[styles.checkbox, deleteZone && styles.checkboxChecked]}>
                    {deleteZone && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.checkboxLabel}>Delete this zone</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Leave {zoneToDelete?.name}?</Text>
                <Text style={styles.modalSubtitle}>
                  You will be removed from this zone. The zone will remain for other members.
                </Text>
              </>
            )}

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setDeleteFriends(!deleteFriends)}
            >
              <View style={[styles.checkbox, deleteFriends && styles.checkboxChecked]}>
                {deleteFriends && <Ionicons name="checkmark" size={18} color="#FFFFFF" />}
              </View>
              <Text style={styles.checkboxLabel}>Delete friends in this zone</Text>
            </TouchableOpacity>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButtonView]}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setZoneToDelete(null);
                  setDeleteZone(true);
                  setDeleteFriends(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteConfirmButton]}
                onPress={handleDeleteZone}
              >
                <Text style={styles.deleteConfirmButtonText}>
                  {zoneToDelete && isZoneOwner(zoneToDelete) ? 'Delete' : 'Leave'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#222222',
    flex: 1, // Take up available space to push buttons right
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 16, // Add margin to push buttons further right
  },
  addZoneButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addZoneButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  targetIcon: {
    width: 16,
    height: 16,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetOuter: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  targetInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyStateButton: {
    backgroundColor: '#34C759',
    paddingVertical: 20,
    paddingHorizontal: 32,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyStateTargetIcon: {
    width: 32,
    height: 32,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTargetOuter: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  emptyStateTargetInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#717171',
    textAlign: 'center',
    lineHeight: 24,
  },
  homeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  currentZoneCard: {
    backgroundColor: '#F0F8FF',
    borderWidth: 2,
    borderColor: '#1E90FF',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  currentZoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F3FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  currentZoneBadgeText: {
    fontSize: 12,
    color: '#1E90FF',
    fontWeight: '600',
    marginLeft: 4,
  },
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  homeName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
  },
  creatorName: {
    fontSize: 11,
    color: '#999999',
    marginTop: 2,
  },
  homeLocation: {
    fontSize: 14,
    color: '#717171',
    marginBottom: 2,
  },
  homeRadius: {
    fontSize: 12,
    color: '#717171',
  },
  friendsSection: {
    marginBottom: 8,
  },
  friendsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  friendName: {
    fontSize: 14,
    color: '#484848',
    flex: 1,
  },
  friendStatus: {
    fontSize: 12,
    color: '#717171',
    fontStyle: 'italic',
  },
  addFriendsButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addFriendsButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
  },
  cancelButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  createButton: {
    color: '#FF5A5F',
    fontSize: 16,
    fontWeight: '600',
  },
  createButtonDisabled: {
    color: '#BBBBBB',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  permissionNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF9E6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  permissionNoticeText: {
    flex: 1,
    fontSize: 13,
    color: '#FF9500',
    marginLeft: 8,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  locationInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: 'transparent',
  },
  currentLocationButton: {
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#DDD',
  },
  refreshButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  friendTile: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  friendInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendTileName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222222',
  },
  friendTileStatus: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '500',
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E1E5E9',
  },
  zoneHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  zoneIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  friendCount: {
    fontSize: 14,
    color: '#666666',
    fontWeight: '500',
    marginLeft: 8,
    marginRight: 4,
  },
  triangleIcon: {
    marginLeft: 4,
  },
  triangleRight: {
    transform: [{ rotate: '0deg' }],
  },
  triangleDown: {
    transform: [{ rotate: '90deg' }],
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusChipHere: {
    backgroundColor: '#34C759',
  },
  statusChipAway: {
    backgroundColor: '#FF3B30',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusChipTextHere: {
    color: '#FFFFFF',
  },
  statusChipTextAway: {
    color: '#FFFFFF',
  },
  gearButton: {
    padding: 4,
  },
  sharingButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  sharingButtonOn: {
    backgroundColor: '#FF5A5F',
    borderColor: '#FF5A5F',
  },
  sharingButtonOff: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FF5A5F',
  },
  sharingButtonText: {
    fontWeight: '600',
    fontSize: 13,
  },
  sharingButtonTextOn: {
    color: '#FFFFFF',
  },
  sharingButtonTextOff: {
    color: '#FF5A5F',
  },
  sharingModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sharingModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  sharingModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  sharingModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
  },
  sharingModalDescription: {
    fontSize: 14,
    color: '#666666',
    padding: 20,
    paddingTop: 16,
  },
  sharingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  sharingOptionSelected: {
    borderColor: '#FF5A5F',
    backgroundColor: '#FFF5F6',
  },
  sharingOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sharingOptionText: {
    marginLeft: 16,
    flex: 1,
  },
  sharingOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  sharingOptionTitleSelected: {
    color: '#FF5A5F',
  },
  sharingOptionSubtitle: {
    fontSize: 13,
    color: '#666666',
  },
  currentZoneSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 12,
  },
  notAtZoneCard: {
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF5A5F',
    shadowColor: '#FF5A5F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  notAtZoneText: {
    fontSize: 15,
    color: '#FF5A5F',
    fontStyle: 'italic',
    fontWeight: '500',
  },
  otherZonesSection: {
    marginBottom: 24,
  },
  otherZonesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  oldCreateZoneButtonContainer: {
    // Removed - now using header button
    padding: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
  },
  oldCreateZoneButton: {
    // Removed - now using header button
    backgroundColor: '#34C759',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  createZoneButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  zoneSection: {
    paddingTop: 4,
    paddingHorizontal: 16,
    paddingBottom: 2,
  },
  friendsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  notHereSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  notHereToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  notHereText: {
    fontSize: 13,
    color: '#999999',
    marginLeft: 6,
    fontWeight: '500',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  sectionChevron: {
    marginRight: 6,
    marginLeft: 8,
    transform: [{rotate: '0deg'}],
  },
  zoneSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 0,
  },
  friendNameContainer: {
    flex: 1,
  },
  friendRowName: {
    fontSize: 15,
    color: '#000000',
  },
  staleText: {
    fontSize: 12,
    color: '#999999',
    marginTop: 2,
  },
  friendRowNameInactive: {
    color: '#CCCCCC',
  },
  friendRowActions: {
    flexDirection: 'row',
    gap: 12,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  showMoreText: {
    fontSize: 14,
    color: '#717171',
    fontWeight: '500',
  },
  smallActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E1E5E9',
  },
  zoneNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevronIcon: {
    marginRight: 8,
    transform: [{rotate: '0deg'}],
  },
  chevronDown: {
    transform: [{rotate: '90deg'}],
  },
  chevronPlaceholder: {
    width: 14,
    marginRight: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#666666',
    marginBottom: 20,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    width: '100%',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#CCCCCC',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#000000',
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonView: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },
  cancelButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteConfirmButton: {
    backgroundColor: '#FF3B30',
  },
  deleteConfirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  durationOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  durationOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#DDDDDD',
    minWidth: 50,
    alignItems: 'center',
  },
  durationOptionSelected: {
    backgroundColor: '#FFF5F6',
    borderColor: '#FF5A5F',
  },
  durationOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  durationOptionTextSelected: {
    color: '#FF5A5F',
    fontWeight: '600',
  },
});