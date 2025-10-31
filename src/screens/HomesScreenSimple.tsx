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
import {auth} from '../../firebaseConfig';
import {geocodeAddress} from '../services/geocoding';
import {
  createHome,
  subscribeToUserHomes,
  subscribeToUserFriends,
} from '../services/firebase';
import {getGoogleMapsApiKey} from '../services/config';
import {
  startLocationTracking,
  stopLocationTracking,
  requestLocationPermissions,
  trackUserLocation,
  getCurrentLocation
} from '../services/locationTracking';
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

export default function HomesScreenSimple() {
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

  logger.debug('HomesScreenSimple: Rendering with full state...');

  // Helper functions
  const handleCreateHome = async () => {
    if (!newHomeName.trim() || !newHomeLocation.trim()) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    // Debug authentication state
    const currentUser = auth.currentUser;
    logger.debug('🔐 Auth Debug - Current user:', currentUser?.uid);
    logger.debug('🔐 Auth Debug - User email:', currentUser?.email);
    logger.debug('🔐 Auth Debug - User phone:', currentUser?.phoneNumber);
    
    if (!currentUser) {
      Alert.alert(
        'Authentication Error', 
        'You are not logged in. Please restart the app and authenticate again.',
        [
          {text: 'OK', onPress: () => {
            // Force navigation back to auth
            navigation.reset({
              index: 0,
              routes: [{ name: 'Auth' }],
            });
          }}
        ]
      );
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
      logger.debug('🗺️ Starting geocoding for:', newHomeLocation);
      const coords = await geocodeAddress({address: newHomeLocation}, apiKey);
      logger.debug('🗺️ Geocoding successful:', coords);

      const createdHome = await createHome({
        name: newHomeName.trim(),
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude,
        },
        radius: parseFloat(newHomeRadius),
        members: [currentUser.uid],
      });

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

  // Toggle zone collapse state
  const toggleZoneCollapse = (homeId: string) => {
    setCollapsedZones(prev => ({
      ...prev,
      [homeId]: !prev[homeId]
    }));
  };

  // Test Firebase subscriptions
  useEffect(() => {
    logger.debug('HomesScreenSimple: useEffect running');
    const currentUser = auth.currentUser;
    logger.debug('HomesScreenSimple: Current user:', currentUser?.uid);
    
    if (!currentUser) {
      logger.debug('HomesScreenSimple: No current user, skipping Firebase subscriptions');
      return;
    }

    let unsubscribeHomes: (() => void) | undefined;
    let unsubscribeFriends: (() => void) | undefined;

    try {
      logger.debug('HomesScreenSimple: Setting up Firebase subscriptions...');
      
      // Test homes subscription
      unsubscribeHomes = subscribeToUserHomes(currentUser.uid, (homesData) => {
        logger.debug('HomesScreenSimple: Received homes data:', homesData.length, 'homes');
        setHomes(homesData);
      });

      // Test friends subscription
      unsubscribeFriends = subscribeToUserFriends(currentUser.uid, (friendsData) => {
        logger.debug('HomesScreenSimple: Received friends data:', friendsData.length, 'friends');
        const consolidatedFriends = consolidateFriends(friendsData);
        logger.debug('HomesScreenSimple: Consolidated friends:', consolidatedFriends.length);
        setFriends(consolidatedFriends);
      });
      
      logger.debug('HomesScreenSimple: Firebase subscriptions set up successfully');
      
      // Initialize location tracking with improved iPhone handling
      logger.debug('HomesScreenSimple: Initializing location tracking...');
      const initializeLocationTracking = async () => {
        try {
          logger.debug('HomesScreenSimple: Requesting location permissions...');
          const hasPermission = await requestLocationPermissions();
          if (hasPermission) {
            logger.debug('HomesScreenSimple: Location permissions granted, starting tracking');
            await startLocationTracking();
          } else {
            logger.debug('HomesScreenSimple: Location permissions denied');
          }
        } catch (locationError) {
          logger.error('HomesScreenSimple: Location tracking error:', locationError);
          // Don't crash the app, just continue without location
        }
      };
      
      initializeLocationTracking();
      
    } catch (error) {
      logger.error('HomesScreenSimple: Error setting up Firebase subscriptions:', error);
    }
    
    return () => {
      logger.debug('HomesScreenSimple: Cleanup - unsubscribing from Firebase and stopping location tracking');
      stopLocationTracking();
      if (unsubscribeHomes) {
        unsubscribeHomes();
      }
      if (unsubscribeFriends) {
        unsubscribeFriends();
      }
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>🏠 Your Zones</Text>
          <Text style={styles.subtitle}>Simplified version for debugging</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Info:</Text>
          <Text style={styles.debugText}>• Current user: {auth.currentUser?.uid || 'None'}</Text>
          <Text style={styles.debugText}>• User email: {auth.currentUser?.email || 'None'}</Text>
          <Text style={styles.debugText}>• Homes loaded: {homes.length}</Text>
          <Text style={styles.debugText}>• Friends loaded: {friends.length}</Text>
          <Text style={styles.debugText}>• Auth state: {auth.currentUser ? '✅ Authenticated' : '❌ Not authenticated'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Steps:</Text>
          <Text style={styles.debugText}>1. This version works without crashing</Text>
          <Text style={styles.debugText}>2. We'll gradually add back features</Text>
          <Text style={styles.debugText}>3. Find exactly what causes the crash</Text>
        </View>

        <TouchableOpacity 
          style={styles.button}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.buttonText}>+ Create Your First Zone</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, {backgroundColor: '#34C759'}]}
          onPress={() => {
            logger.debug('Add Friends button pressed');
            // TODO: Navigate to add friends screen
          }}
        >
          <Text style={styles.buttonText}>👥 Add Friends</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, {backgroundColor: '#007AFF'}]}
          onPress={() => {
            logger.debug('Test Location button pressed');
            // TODO: Add location testing functionality
          }}
        >
          <Text style={styles.buttonText}>📍 Test Location</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Home Creation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Zone</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Zone Name (e.g., Home, Work)"
              value={newHomeName}
              onChangeText={setNewHomeName}
              autoCapitalize="words"
            />
            
            <TextInput
              style={styles.input}
              placeholder="Address or Location"
              value={newHomeLocation}
              onChangeText={setNewHomeLocation}
              autoCapitalize="words"
            />
            
            <TextInput
              style={styles.input}
              placeholder="Radius (miles)"
              value={newHomeRadius}
              onChangeText={setNewHomeRadius}
              keyboardType="numeric"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.createButton]}
                onPress={handleCreateHome}
                disabled={creating}
              >
                <Text style={styles.createButtonText}>
                  {creating ? 'Creating...' : 'Create Zone'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#717171',
    textAlign: 'center',
  },
  section: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  button: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FF5A5F',
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },
  createButton: {
    backgroundColor: '#FF5A5F',
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '600',
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
