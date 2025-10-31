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
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList, Home, Friend} from '../types';
import {geocodeAddress} from '../services/geocoding';
import {
  createHome,
  subscribeToUserHomes,
  subscribeToUserFriends,
} from '../services/firebase';
import {auth} from '../../firebaseConfig';
import {getGoogleMapsApiKey} from '../services/config';
import {
  requestLocationPermissions,
} from '../services/locationService';
import { Ionicons } from '@expo/vector-icons';

type HomesScreenNavigationProp = StackNavigationProp<RootStackParamList>;

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
        currentHomeId: friend.currentHomeId ?? existingFriend.currentHomeId,
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
  const [modalVisible, setModalVisible] = useState(false);
  const [newHomeName, setNewHomeName] = useState('');
  const [newHomeLocation, setNewHomeLocation] = useState('');
  const [newHomeRadius, setNewHomeRadius] = useState('10');
  const [creating, setCreating] = useState(false);
  
  // Debug mode state
  const [debugMode, setDebugMode] = useState(false);
  const [debugLocation, setDebugLocation] = useState('');
  const [currentLocation, setCurrentLocation] = useState<{latitude: number, longitude: number, address: string} | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');
  
  // Collapsible zones state
  const [collapsedZones, setCollapsedZones] = useState<{[key: string]: boolean}>({});

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

  // Toggle zone collapse state
  const toggleZoneCollapse = (homeId: string) => {
    setCollapsedZones(prev => ({
      ...prev,
      [homeId]: !prev[homeId]
    }));
  };

  // Initialize location tracking and load homes when component mounts
  useEffect(() => {
    const initializeLocationTracking = async () => {
      const hasPermission = await requestLocationPermissions();
      if (hasPermission) {
        logger.debug('Location permissions granted, starting tracking');
        await startLocationTracking();
      } else {
        logger.debug('Location permissions denied');
      }
    };

    // Add error handling to prevent crashes
    try {
      initializeLocationTracking();
    } catch (error) {
      logger.error('Error in location initialization:', error);
    }

    // Subscribe to user's homes and friends from Firebase
    const currentUser = auth.currentUser;
    let unsubscribeHomes: (() => void) | undefined;
    let unsubscribeFriends: (() => void) | undefined;
    
    if (currentUser) {
      unsubscribeHomes = subscribeToUserHomes(currentUser.uid, (homesData) => {
        logger.debug('HomesScreen: Received homes data:', homesData);
      });

      unsubscribeFriends = subscribeToUserFriends(currentUser.uid, (friendsData) => {
        logger.debug('HomesScreen: Received friends data for user', currentUser.uid, ':', friendsData);
        logger.debug('HomesScreen: Friends count:', friendsData.length);
        
        // Consolidate duplicate friends
        const consolidatedFriends = consolidateFriends(friendsData);
        logger.debug('HomesScreen: Consolidated friends count:', consolidatedFriends.length);
        
        consolidatedFriends.forEach(friend => {
          logger.debug(`HomesScreen: Friend ${friend.name} - isAtHome: ${friend.isCurrentlyAtHome}, currentHomeId: ${friend.currentHomeId}, sharedHomes: ${friend.sharedHomes}`);
        });
        setFriends(consolidatedFriends);
      });
    }

    return () => {
      stopLocationTracking();
      if (unsubscribeHomes) {
        unsubscribeHomes();
      }
      if (unsubscribeFriends) {
        unsubscribeFriends();
      }
    };
  }, []);

  // Update location tracking when debug location changes
  useEffect(() => {
    if (currentLocation) {
      // Use debug location for tracking
      startLocationTracking({
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude
      });
    }
  }, [currentLocation]);

  // Helper function to get friends who are CURRENTLY AT a specific home
  const getFriendsAtHome = (homeId: string): Friend[] => {
    logger.debug(`\n=== getFriendsAtHome DEBUG ===`);
    logger.debug(`Looking for homeId: "${homeId}"`);
    logger.debug(`Total friends: ${friends.length}`);
    
    friends.forEach((friend, index) => {
      logger.debug(`Friend ${index}:`, {
        name: friend.name,
        status: friend.status,
        sharedHomes: friend.sharedHomes,
        isCurrentlyAtHome: friend.isCurrentlyAtHome,
        currentHomeId: friend.currentHomeId,
        includesHomeId: friend.sharedHomes?.includes(homeId)
      });
    });
    
    const filteredFriends = friends.filter(friend => {
      const statusOk = friend.status === 'connected';
      const hasSharedHomes = Array.isArray(friend.sharedHomes);
      const includesHome = hasSharedHomes && friend.sharedHomes.includes(homeId);
      const isCurrentlyAtThisHome = friend.isCurrentlyAtHome && friend.currentHomeId === homeId;
      
      logger.debug(`${friend.name}: status=${statusOk}, includesHome=${includesHome}, isCurrentlyAtThisHome=${isCurrentlyAtThisHome}`);
      
      // Only show friends who are connected, have access to this home, AND are currently at this home
      return statusOk && includesHome && isCurrentlyAtThisHome;
    });
    
    logger.debug(`Filtered result: ${filteredFriends.length} friends currently at this home`);
    logger.debug(`=== END DEBUG ===\n`);
    
    return filteredFriends;
  };


  const handleSetDebugLocation = async () => {
    if (!debugLocation.trim()) {
      Alert.alert('Error', 'Please enter a location (zip code or city, state).');
      return;
    }

    // Check if input looks like coordinates (lat,lon format)
    const coordMatch = debugLocation.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      setCurrentLocation({ 
        latitude: lat, 
        longitude: lon, 
        address: `${lat}, ${lon}` 
      });
      Alert.alert('Debug Location Set', `Coordinates set to: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      return;
    }

    // Remove hardcoded Stowe logic - let's test geocoding properly

    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) {
      Alert.alert(
        'Missing API key',
        'Google Maps API key is not configured. Try entering coordinates directly like: 44.4654, -72.8364'
      );
      return;
    }

    try {
      logger.debug(`🗺️ Geocoding request: "${debugLocation}" with API key: ${apiKey.substring(0, 10)}...`);
      const coords = await geocodeAddress({address: debugLocation}, apiKey);
      logger.debug(`✅ Geocoding success:`, coords);
      
      setCurrentLocation({ 
        latitude: coords.latitude, 
        longitude: coords.longitude, 
        address: debugLocation 
      });
      
      Alert.alert(
        'Debug Location Set', 
        `Location: ${debugLocation}\nCoordinates: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}\n\nNow tap "Test Location" to verify zone detection.`
      );
    } catch (error: any) {
      logger.error('❌ Geocoding failed:', error);
      Alert.alert(
        'Geocoding Failed', 
        `Error: ${error?.message ?? 'Unknown error'}\n\nTry:\n• Different format: "Stowe, Vermont"\n• Zip code: "05672"\n• Coordinates: "44.4654, -72.8364"`
      );
    }
  };

  const handleCreateHome = async () => {
    if (!newHomeName.trim() || !newHomeLocation.trim()) {
      Alert.alert('Error', 'Please fill in all fields.');
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
        Alert.alert('Error', 'You must be signed in to create a zone. Please restart the app and authenticate again.');
        return;
      }
      const homeData = {
        name: newHomeName,
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          address: newHomeLocation,
        },
        radius: parseInt(newHomeRadius),
        createdBy: currentUser.uid,
        members: [currentUser.uid],
      };

      // Save to Firebase
      const createdHome = await createHome(homeData);
      logger.debug('Home created in Firebase:', createdHome);

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
              text: 'Add Friends',
              onPress: () => navigation.navigate('AddFriends', {homeId: createdHome.id}),
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

  const renderHome = (home: Home) => {
    const friendsAtHome = getFriendsAtHome(home.id);
    const isCollapsed = collapsedZones[home.id] || false;
    
    // Debug logging for this specific home
    logger.debug(`=== DEBUGGING HOME: ${home.name} (ID: ${home.id}) ===`);
    logger.debug('All friends for current user:', friends);
    logger.debug('Friends filtered for this home:', friendsAtHome);
    logger.debug('Current user ID:', auth.currentUser?.uid);
    
    // Debug logging only (no state updates during render to avoid infinite loop)

    return (
      <View key={home.id} style={styles.homeCard}>
        <View style={styles.homeHeader}>
          <TouchableOpacity 
            style={styles.zoneHeaderButton}
            onPress={() => toggleZoneCollapse(home.id)}
          >
            <Text style={styles.homeName}>{home.name}</Text>
            {friendsAtHome.length > 0 && (
              <View style={styles.zoneIndicator}>
                {isCollapsed && (
                  <Text style={styles.friendCount}>({friendsAtHome.length})</Text>
                )}
                <Ionicons 
                  name={isCollapsed ? "chevron-forward" : "chevron-down"} 
                  size={16} 
                  color="#666666" 
                  style={styles.chevronIcon}
                />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addFriendsChip}
            onPress={() => navigation.navigate('AddFriends', {homeId: home.id})}
          >
            <Text style={styles.addFriendsChipText}>Add Friends</Text>
          </TouchableOpacity>
        </View>

        {friendsAtHome.length > 0 && !isCollapsed && (
          <View style={styles.friendsSection}>
            <Text style={styles.friendsSectionTitle}>Who's Around:</Text>
            {friendsAtHome.map(friend => (
              <View key={friend.id} style={styles.friendTile}>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendTileName}>{friend.name}</Text>
                </View>
                <View style={styles.friendActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleCall(friend.phoneNumber)}
                  >
                    <Ionicons name="call" size={18} color="#007AFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleText(friend.phoneNumber)}
                  >
                    <Ionicons name="chatbubble" size={18} color="#34C759" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Zones</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" style={{marginRight: 4}} />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Debug Mode Section */}
        <View style={styles.debugSection}>
          <TouchableOpacity 
            style={styles.debugToggle}
            onPress={() => setDebugMode(!debugMode)}
          >
            <Text style={styles.debugToggleText}>
              Debug Mode {debugMode ? '(ON)' : '(OFF)'}
            </Text>
          </TouchableOpacity>
          
          {debugMode && (
            <View style={styles.debugControls}>
              <Text style={styles.debugTitle}>Manual Location Override</Text>
              
              {debugMode && (
                <View style={styles.currentLocationDisplay}>
                  <Text style={styles.currentLocationText}>
                    Current User: {auth.currentUser?.uid?.substring(0, 8)}... ({auth.currentUser?.email?.split('@')[0]})
                  </Text>
                  <Text style={styles.currentLocationText}>
                    Current Debug Location:
                  </Text>
                  <Text style={styles.currentLocationCoords}>
                    {currentLocation ? currentLocation.address : 'No location set'}
                  </Text>
                  {currentLocation && (
                    <Text style={styles.currentLocationCoords}>
                      {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
                    </Text>
                  )}
                </View>
              )}
              
              <View style={styles.debugInputContainer}>
                <Text style={styles.debugLabel}>Location:</Text>
                <TextInput
                  style={styles.debugInput}
                  value={debugLocation}
                  onChangeText={setDebugLocation}
                  placeholder="Enter zip code (e.g., 10001) or city, state (e.g., New York, NY)"
                />
              </View>
              
              <View style={styles.debugButtonRow}>
                <TouchableOpacity
                  style={styles.debugSetButton}
                  onPress={handleSetDebugLocation}
                >
                  <Text style={styles.debugSetButtonText}>Set Debug Location</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.debugTestButton}
                  onPress={async () => {
                    setDebugInfo('Testing location...');
                    try {
                      const currentUser = auth.currentUser;
                      if (!currentUser) {
                        setDebugInfo('❌ No user logged in');
                        return;
                      }

                      // Get current location
                      const location = currentLocation || await getCurrentLocation();
                      if (!location) {
                        setDebugInfo('❌ No location available');
                        return;
                      }

                      // Get user's homes
                      const { getUserHomes } = await import('../services/locationTracking');
                      const homes = await getUserHomes(currentUser.uid);
                      
                      let info = `📍 Location: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}\n`;
                      info += `🏠 Zones: ${homes.length}\n\n`;
                      
                      if (homes.length === 0) {
                        info += '❌ No zones found for user';
                      } else {
                        homes.forEach(home => {
                          const { calculateDistance } = require('../services/locationTracking');
                          const distance = calculateDistance(location.latitude, location.longitude, home.latitude, home.longitude);
                          const isInside = distance <= home.radius;
                          info += `${home.name}: ${distance.toFixed(2)}mi ${isInside ? '✅ INSIDE' : '❌ OUTSIDE'}\n`;
                        });
                      }
                      
                      // Add friend debug info
                      let friendDebug = `\n👥 FRIEND DEBUG:\n`;
                      friendDebug += `Total friends: ${friends.length}\n`;
                      if (friends.length === 0) {
                        friendDebug += `❌ No friends found for current user\n`;
                      } else {
                        friends.forEach(friend => {
                          friendDebug += `• ${friend.name}: ${friend.friendUserId ? '✅ Has friendUserId' : '❌ Missing friendUserId'}\n`;
                          friendDebug += `  Location: ${friend.isCurrentlyAtHome ? '🏠 At home' : '📍 Away'} (${friend.currentHomeId || 'no homeId'})\n`;
                          friendDebug += `  Shared zones: ${friend.sharedHomes?.join(', ') || 'none'}\n`;
                        });
                      }
                      
                      setDebugInfo(info + friendDebug);
                      
                      // Also run the actual location tracking
                      await trackUserLocation(currentLocation ? {
                        latitude: currentLocation.latitude,
                        longitude: currentLocation.longitude
                      } : undefined);
                      
                    } catch (error: any) {
                      setDebugInfo(`❌ Error: ${error?.message || 'Unknown error'}`);
                    }
                  }}
                >
                  <Text style={styles.debugTestButtonText}>Test Location</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={async () => {
                  setDebugInfo('Refreshing friends...');
                  // Force refresh friends data
                  const currentUser = auth.currentUser;
                  if (currentUser) {
                    // Re-run location tracking to update Firebase
                    await trackUserLocation(currentLocation ? {
                      latitude: currentLocation.latitude,
                      longitude: currentLocation.longitude
                    } : undefined);
                    
                    // Force refresh friends list by re-triggering the subscription
                    // This is a workaround until we implement real-time friend location updates
                    logger.debug('🔄 Forcing friends refresh for user:', currentUser.uid);
                    
                    // Force a complete re-render by updating a dummy state
                    setDebugInfo('🔄 Refreshing friends data...');
                    
                    // Wait a moment then trigger the friends refresh
                    setTimeout(() => {
                      const { subscribeToUserFriends } = require('../services/firebase');
                      subscribeToUserFriends(currentUser.uid, (refreshedFriends: any[]) => {
                        logger.debug('🔄 Friends list manually refreshed:', refreshedFriends.length, 'friends');
                        
                        // Consolidate duplicate friends
                        const consolidatedRefreshedFriends = consolidateFriends(refreshedFriends);
                        logger.debug('🔄 Consolidated refreshed friends:', consolidatedRefreshedFriends.length, 'friends');
                        
                        consolidatedRefreshedFriends.forEach((friend: any) => {
                          logger.debug(`🔄 Friend ${friend.name}: isAtHome=${friend.isCurrentlyAtHome}, homeId=${friend.currentHomeId}`);
                        });
                        setFriends(consolidatedRefreshedFriends);
                      });
                    }, 500);
                    
                    setDebugInfo('✅ Friends refreshed! Location and friends list updated.');
                  }
                }}
              >
                <Text style={styles.refreshButtonText}>🔄 Refresh Friends</Text>
              </TouchableOpacity>
              
              <Text style={styles.debugHint}>
                Use this to simulate being at different locations for testing zone detection
              </Text>
              
              {debugInfo && (
                <View style={styles.debugInfoBox}>
                  <Text style={styles.debugInfoText}>{debugInfo}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {homes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No zones yet. Create your first zone to start sharing your location with friends!
            </Text>
          </View>
        ) : (
          homes.map(renderHome)
        )}
      </ScrollView>

      {/* Create Home Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Home</Text>
            <TouchableOpacity onPress={handleCreateHome} disabled={creating}>
              <Text style={[styles.createButton, creating && styles.createButtonDisabled]}>
                {creating ? 'Creating…' : 'Create'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.inputLabel}>Home Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Stowe House"
              value={newHomeName}
              onChangeText={setNewHomeName}
            />

            <Text style={styles.inputLabel}>Location</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter zip code (e.g., 10001) or city, state (e.g., New York, NY)"
              value={newHomeLocation}
              onChangeText={setNewHomeLocation}
            />

            <Text style={styles.inputLabel}>Radius (miles)</Text>
            <TextInput
              style={styles.input}
              placeholder="10"
              value={newHomeRadius}
              onChangeText={setNewHomeRadius}
              keyboardType="number-pad"
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
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
  },
  addButton: {
    backgroundColor: '#FF5A5F',
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
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  homeName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 4,
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
    marginBottom: 16,
  },
  friendsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  friendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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
  addFriendsChip: {
    backgroundColor: '#FF5A5F',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  addFriendsChipText: {
    color: '#FFFFFF',
    fontSize: 14,
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
    color: '#717171',
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
    padding: 24,
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
    borderColor: '#DDDDDD',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  // Debug Mode Styles
  debugSection: {
    marginBottom: 16,
  },
  debugToggle: {
    backgroundColor: '#F0F0F0',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  debugToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
  },
  debugControls: {
    backgroundColor: '#FFF9E6',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFE066',
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#B8860B',
    marginBottom: 12,
  },
  currentLocationDisplay: {
    backgroundColor: '#E8F5E8',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  currentLocationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
  },
  currentLocationCoords: {
    fontSize: 16,
    fontFamily: 'Courier',
    color: '#1B5E20',
    marginTop: 4,
  },
  debugInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  debugInputContainer: {
    flex: 1,
  },
  debugLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B8860B',
    marginBottom: 4,
  },
  debugInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#B8860B',
    fontSize: 14,
    backgroundColor: '#FFFEF7',
    marginBottom: 12,
  },
  debugButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  debugSetButton: {
    backgroundColor: '#B8860B',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  debugSetButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  debugTestButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  debugTestButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  debugHint: {
    fontSize: 12,
    color: '#B8860B',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  debugInfoBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  debugInfoText: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'monospace',
    lineHeight: 16,
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  friendInfo: {
    flex: 1,
  },
  friendTileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  friendTileStatus: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '500',
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    marginRight: 4,
  },
  chevronIcon: {
    marginLeft: 2,
  },
});