import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { logger } from '../utils/logger';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebaseConfig';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import * as Location from 'expo-location';
import { Friend } from '../types';
import { getGoogleMapsApiKey } from '../services/config';

export default function BroadcastScreen() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [allFriendsSelected, setAllFriendsSelected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [broadcasting, setBroadcasting] = useState(false);
  const [currentLocationText, setCurrentLocationText] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');

  // Load friends and detect location
  useEffect(() => {
    loadFriendsAndLocation();
  }, []);

  const loadFriendsAndLocation = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    try {
      // Get current location
      const locationResult = await Location.getCurrentPositionAsync();
    const location = locationResult.coords;
      if (location) {
        // Reverse geocode to get city/state
        const apiKey = await getGoogleMapsApiKey();
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.latitude},${location.longitude}&key=${apiKey}`
        );
        const data = await response.json();
        
        if (data.results && data.results[0]) {
          // Extract city and state from address components
          const addressComponents = data.results[0].address_components;
          let city = '';
          let state = '';
          
          for (const component of addressComponents) {
            if (component.types.includes('locality')) {
              city = component.long_name;
            }
            if (component.types.includes('administrative_area_level_1')) {
              state = component.short_name;
            }
          }
          
          const locationText = city && state ? `${city}, ${state}` : data.results[0].formatted_address;
          setCurrentLocationText(locationText);
          setBroadcastMessage(`I'm in ${locationText}`);
        }
      }

      // Load friends
      const friendsQuery = query(
        collection(db, 'friends'),
        where('userId', '==', currentUser.uid),
        where('status', '==', 'connected')
      );

      const friendsSnapshot = await getDocs(friendsQuery);
      const allFriends: Friend[] = friendsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Friend));

      // Deduplicate friends by friendUserId or phoneNumber
      const uniqueFriendsMap = new Map<string, Friend>();
      allFriends.forEach(friend => {
        const key = friend.friendUserId || friend.phoneNumber;
        if (!uniqueFriendsMap.has(key)) {
          uniqueFriendsMap.set(key, friend);
        }
      });

      setFriends(Array.from(uniqueFriendsMap.values()));
    } catch (error) {
      logger.error('Error loading friends and location:', error);
      Alert.alert('Error', 'Failed to load location or friends');
    } finally {
      setLoading(false);
    }
  };

  const toggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriendIds);
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId);
    } else {
      newSelected.add(friendId);
    }
    setSelectedFriendIds(newSelected);
    setAllFriendsSelected(newSelected.size === friends.length && friends.length > 0);
  };

  const toggleAllFriends = () => {
    if (allFriendsSelected) {
      setSelectedFriendIds(new Set());
      setAllFriendsSelected(false);
    } else {
      setSelectedFriendIds(new Set(friends.map(f => f.id)));
      setAllFriendsSelected(true);
    }
  };

  const handleBroadcast = async () => {
    if (selectedFriendIds.size === 0) {
      Alert.alert('No Friends Selected', 'Please select at least one friend to broadcast to.');
      return;
    }

    if (!broadcastMessage.trim()) {
      Alert.alert('No Message', 'Please enter a broadcast message.');
      return;
    }

    setBroadcasting(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // Get current user's name
      const userDoc = await getDocs(query(collection(db, 'users'), where('id', '==', currentUser.uid)));
      const currentUserName = userDoc.docs[0]?.data()?.name || 'A friend';

      // Update user document with broadcast location
      const userDocRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userDocRef, {
        broadcastLocation: currentLocationText,
        broadcastMessage: broadcastMessage.trim(),
        broadcastTimestamp: serverTimestamp(),
      });

      logger.debug(`📡 Broadcast saved! Sending push notifications to ${selectedFriendIds.size} friends...`);

      // Send push notifications to selected friends
      const { sendBroadcastNotification } = await import('../services/notificationService');
      
      for (const friendId of selectedFriendIds) {
        const friend = friends.find(f => f.id === friendId);
        if (friend && friend.friendUserId) {
          try {
            await sendBroadcastNotification(
              friend.friendUserId,
              currentUserName,
              currentLocationText,
              broadcastMessage.trim()
            );
            logger.debug(`  📬 Notified ${friend.name}`);
          } catch (error) {
            logger.error(`  ❌ Failed to notify ${friend.name}:`, error);
          }
        }
      }
      
      logger.debug(`✅ Broadcast notifications sent to friends`);

      Alert.alert(
        'Broadcast Sent! 📡',
        `Your location has been shared with ${selectedFriendIds.size === friends.length ? 'all friends' : `${selectedFriendIds.size} friend${selectedFriendIds.size > 1 ? 's' : ''}`}`,
        [{ text: 'OK' }]
      );

      // Clear selections
      setSelectedFriendIds(new Set());
      setAllFriendsSelected(false);
    } catch (error) {
      logger.error('Error broadcasting:', error);
      Alert.alert('Error', 'Failed to broadcast location. Please try again.');
    } finally {
      setBroadcasting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF5A5F" />
          <Text style={styles.loadingText}>Detecting location...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Broadcast</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Location Display */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Location</Text>
          <View style={styles.locationCard}>
            <Ionicons name="location" size={24} color="#FF5A5F" />
            <Text style={styles.locationText}>{currentLocationText || 'Unknown location'}</Text>
          </View>
        </View>

        {/* Editable Message */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Broadcast Message</Text>
          <TextInput
            style={styles.messageInput}
            value={broadcastMessage}
            onChangeText={setBroadcastMessage}
            placeholder="Enter your message..."
            multiline
            numberOfLines={3}
            returnKeyType="done"
            blurOnSubmit={true}
          />
        </View>

        {/* Friend Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Share With</Text>

          {/* All Friends Option */}
          <TouchableOpacity
            style={[
              styles.friendOption,
              allFriendsSelected && styles.friendOptionSelected
            ]}
            onPress={toggleAllFriends}
          >
            <View style={styles.friendOptionContent}>
              <Ionicons 
                name="people" 
                size={24} 
                color={allFriendsSelected ? '#FF5A5F' : '#666666'} 
              />
              <Text style={[
                styles.friendOptionText,
                allFriendsSelected && styles.friendOptionTextSelected
              ]}>
                All Friends ({friends.length})
              </Text>
            </View>
            <View style={[
              styles.checkbox,
              allFriendsSelected && styles.checkboxSelected
            ]}>
              {allFriendsSelected && (
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>

          {/* Individual Friends */}
          {friends.map(friend => {
            const isSelected = selectedFriendIds.has(friend.id);
            return (
              <TouchableOpacity
                key={friend.id}
                style={[
                  styles.friendOption,
                  isSelected && styles.friendOptionSelected
                ]}
                onPress={() => toggleFriend(friend.id)}
              >
                <View style={styles.friendOptionContent}>
                  <Ionicons 
                    name="person" 
                    size={20} 
                    color={isSelected ? '#FF5A5F' : '#666666'} 
                  />
                  <Text style={[
                    styles.friendOptionText,
                    isSelected && styles.friendOptionTextSelected
                  ]}>
                    {friend.name}
                  </Text>
                </View>
                <View style={[
                  styles.checkbox,
                  isSelected && styles.checkboxSelected
                ]}>
                  {isSelected && (
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {friends.length === 0 && (
            <View style={styles.noFriendsCard}>
              <Text style={styles.noFriendsText}>
                No friends yet. Invite friends to zones to start broadcasting!
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Broadcast Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.broadcastButton,
            (selectedFriendIds.size === 0 || broadcasting) && styles.broadcastButtonDisabled
          ]}
          onPress={handleBroadcast}
          disabled={selectedFriendIds.size === 0 || broadcasting}
        >
          {broadcasting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="radio" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.broadcastButtonText}>
                Broadcast to {selectedFriendIds.size === friends.length ? 'All Friends' : `${selectedFriendIds.size} Friend${selectedFriendIds.size !== 1 ? 's' : ''}`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  header: {
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
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 12,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  locationText: {
    fontSize: 16,
    color: '#222222',
    fontWeight: '600',
    marginLeft: 12,
  },
  messageInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#222222',
    minHeight: 80,
    textAlignVertical: 'top',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  friendOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  friendOptionSelected: {
    borderColor: '#FF5A5F',
    backgroundColor: '#FFF5F6',
  },
  friendOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  friendOptionText: {
    fontSize: 16,
    color: '#222222',
    fontWeight: '500',
    marginLeft: 12,
  },
  friendOptionTextSelected: {
    color: '#FF5A5F',
    fontWeight: '600',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#DDDDDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#FF5A5F',
    borderColor: '#FF5A5F',
  },
  noFriendsCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  noFriendsText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
  },
  footer: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
  },
  broadcastButton: {
    backgroundColor: '#FF5A5F',
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  broadcastButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  broadcastButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
