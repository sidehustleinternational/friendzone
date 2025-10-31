import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  Animated,
  Linking,
  TextInput,
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../types';
import {Friend, FriendRequest, Home, ZoneRequest} from '../types';
import {getUserFriends, subscribeToUserFriends, subscribeToFriendRequests, subscribeToOutgoingFriendRequests, acceptFriendRequest, rejectFriendRequest, subscribeToUserHomes, getHomesByIds, getUserData, deleteFriend, cancelFriendRequest, sendZoneRequest, subscribeToZoneRequests, acceptZoneRequest, rejectZoneRequest, getFriendActiveZones, getSharedZoneDetails} from '../services/firebase';
// Location tracking now handled by locationService
import {getNearbyFriends, formatDistance} from '../services/magnetService';
import {auth, db} from '../../firebaseConfig';
import {doc, updateDoc} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as Location from 'expo-location';
import { updateLastViewedTimestamp } from '../utils/notificationTracking';
import { formatTimeAgo, isLocationStale, isLocationTooStaleForZones, getLocationFreshness } from '../utils/timeAgo';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

type FriendsScreenNavigationProp = StackNavigationProp<RootStackParamList>;

// Consolidate duplicate friends by friendUserId, combining their shared zones
const consolidateFriends = (friendsData: Friend[]): Friend[] => {
  const friendsMap = new Map<string, Friend>();
  
  friendsData.forEach(friend => {
    const key = friend.friendUserId || friend.phoneNumber; // Use friendUserId as primary key
    const friendSharedHomes = friend.sharedHomes || [];
    
    if (friendsMap.has(key)) {
      // Merge shared homes for existing friend
      const existingFriend = friendsMap.get(key)!;
      const existingSharedHomes = existingFriend.sharedHomes || [];
      const combinedHomes = [...new Set([...existingSharedHomes, ...friendSharedHomes])];
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
      friendsMap.set(key, {...friend, sharedHomes: friendSharedHomes});
    }
  });
  
  return Array.from(friendsMap.values());
};

// Merged friend data: combines existing friendships with pending requests
interface MergedFriend {
  key: string; // userId or phone number
  name: string;
  phoneNumber: string;
  userId?: string;
  // Active friendship data
  activeFriend?: Friend;
  activeZones: string[]; // Zones where friendship is active
  // Pending request data
  pendingRequests: FriendRequest[]; // Incoming requests for additional zones
  pendingZones: string[]; // Zones with pending invitations
}

// Merge friends with incoming friend requests AND outgoing requests to show them all together
const mergeFriendsWithRequests = (
  friends: Friend[], 
  incomingRequests: FriendRequest[],
  outgoingRequests: FriendRequest[],
  homes: Home[],
  recipientUsers: {[key: string]: any},
  getContactNameByPhone: (phone: string) => string | null,
  formatPhoneNumber: (phone: string) => string
): { mergedFriends: MergedFriend[], standaloneRequests: FriendRequest[] } => {
  const mergedMap = new Map<string, MergedFriend>();
  const homesMap = new Map(homes.map(h => [h.id, h]));
  
  // First, add all existing friends
  friends.forEach(friend => {
    const key = friend.friendUserId || friend.phoneNumber;
    mergedMap.set(key, {
      key,
      name: friend.name,
      phoneNumber: friend.phoneNumber,
      userId: friend.friendUserId,
      activeFriend: friend,
      activeZones: friend.sharedHomes || [], // Show all zones with permissions for now
      pendingRequests: [],
      pendingZones: [],
    });
  });
  
  // All incoming requests show at the top as standalone cards
  const standaloneRequests: FriendRequest[] = [...incomingRequests];
  
  // Process outgoing requests (zone invitations you sent)
  outgoingRequests.forEach(request => {
    const key = request.toUserId || request.toPhoneNumber;
    const requestZones = request.homeIds || (request.homeId ? [request.homeId] : []);
    
    if (mergedMap.has(key)) {
      // This person is already a friend - add pending outgoing zones
      const merged = mergedMap.get(key)!;
      merged.pendingRequests.push(request);
      // Only add zones that aren't already active
      const newZones = requestZones.filter(z => !merged.activeZones.includes(z));
      merged.pendingZones.push(...newZones);
    } else {
      // New person - create a friend entry with only pending zones
      const recipientPhone = request.toPhoneNumber || '';
      
      // Try to get name from: 1) recipientUsers, 2) contacts, 3) formatted phone
      let recipientName = recipientPhone;
      if (request.toUserId && recipientUsers[request.toUserId]) {
        recipientName = recipientUsers[request.toUserId].name;
      } else {
        const contactName = getContactNameByPhone(recipientPhone);
        recipientName = contactName || formatPhoneNumber(recipientPhone);
      }
      
      mergedMap.set(key, {
        key,
        name: recipientName,
        phoneNumber: recipientPhone,
        userId: request.toUserId || undefined,
        activeFriend: undefined, // No active friendship yet
        activeZones: [], // No active zones
        pendingRequests: [request],
        pendingZones: requestZones,
      });
    }
  });
  
  return {
    mergedFriends: Array.from(mergedMap.values()),
    standaloneRequests,
  };
};

export default function FriendsScreen() {
  const navigation = useNavigation<FriendsScreenNavigationProp>();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [homes, setHomes] = useState<Home[]>([]);
  const [selectedHomeIds, setSelectedHomeIds] = useState<string[]>([]);
  const [acceptModalVisible, setAcceptModalVisible] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [pendingRequestFromUser, setPendingRequestFromUser] = useState<string>('');
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [offeredHomes, setOfferedHomes] = useState<Home[]>([]);
  const [alreadyConnectedHomes, setAlreadyConnectedHomes] = useState<Home[]>([]);
  const [newInviteHomes, setNewInviteHomes] = useState<Home[]>([]);
  const [recipientUsers, setRecipientUsers] = useState<{[key: string]: any}>({});
  // Magnet nearby friends
  const [nearbyFriends, setNearbyFriends] = useState<Array<Friend & { distance: number }>>([]);
  const [userLocation, setUserLocation] = useState<{latitude: number; longitude: number} | null>(null);
  
  // Merged friends and standalone requests
  const [mergedFriends, setMergedFriends] = useState<MergedFriend[]>([]);
  const [standaloneRequests, setStandaloneRequests] = useState<FriendRequest[]>([]);
  
  // Note: Badge count is handled by MainTabNavigator, not here
  // This prevents duplicate/conflicting badge updates
  
  // Compute merged friends whenever friends, requests, or homes change
  useEffect(() => {
    logger.debug('🔄 Merging friends with requests:', {
      friendsCount: friends.length,
      friendRequestsCount: friendRequests.length,
      outgoingRequestsCount: outgoingRequests.length,
      homesCount: homes.length
    });
    
    const { mergedFriends: merged, standaloneRequests: standalone } = 
      mergeFriendsWithRequests(friends, friendRequests, outgoingRequests, homes, recipientUsers, getContactNameByPhone, formatPhoneNumber);
    
    logger.debug('✅ Merge complete:', {
      mergedFriendsCount: merged.length,
      standaloneRequestsCount: standalone.length,
      standaloneRequests: standalone.map(r => ({
        id: r.id,
        from: r.fromUserName,
        to: r.toPhoneNumber,
        status: r.status,
        homeIds: r.homeIds
      }))
    });
    
    // Sort friends alphabetically by name
    const sortedMerged = [...merged].sort((a, b) => {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    });
    
    setMergedFriends(sortedMerged);
    setStandaloneRequests(standalone);
  }, [friends, friendRequests, outgoingRequests, homes, recipientUsers]);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setLoading(false);
      return;
    }

    // Mark friend requests as viewed when screen loads
    updateLastViewedTimestamp();

    // Subscribe to real-time friends updates
    const unsubscribeFriends = subscribeToUserFriends(currentUser.uid, (friendsData) => {
      // Consolidate duplicate friends by friendUserId
      const consolidatedFriends = consolidateFriends(friendsData);
      setFriends(consolidatedFriends);
      setLoading(false);
    });

    // Subscribe to real-time friend requests (now async)
    let unsubscribeRequests = () => {};
    subscribeToFriendRequests(currentUser.uid, (requestsData) => {
      setFriendRequests(requestsData);
    }).then(unsubscribe => {
      unsubscribeRequests = unsubscribe;
    });

    // Subscribe to user's homes
    const unsubscribeHomes = subscribeToUserHomes(currentUser.uid, (homesData) => {
      setHomes(homesData);
    });

    // Subscribe to outgoing friend requests (to show as pending)
    const unsubscribeOutgoing = subscribeToOutgoingFriendRequests(currentUser.uid, (requestsData) => {
      setOutgoingRequests(requestsData);
    });

    return () => {
      unsubscribeFriends();
      unsubscribeRequests();
      unsubscribeHomes();
      unsubscribeOutgoing();
    };
  }, []);

  // Load additional homes that friends are currently at AND homes from pending requests
  useEffect(() => {
    const loadFriendHomes = async () => {
      // Collect home IDs from friends currently at zones
      const friendHomeIds = friends
        .filter(friend => friend.currentHomeIds && friend.currentHomeIds.length > 0 && friend.isCurrentlyAtHome)
        .flatMap(friend => friend.currentHomeIds || [])
        .filter((id): id is string => id !== undefined);
      
      // Collect home IDs from pending friend requests (both incoming and outgoing)
      const requestHomeIds = [
        ...friendRequests.flatMap((req: FriendRequest) => req.homeIds || []),
        ...outgoingRequests.flatMap((req: FriendRequest) => req.homeIds || [])
      ];
      
      // Combine and deduplicate
      const allHomeIds = [...friendHomeIds, ...requestHomeIds]
        .filter((homeId, index, arr) => arr.indexOf(homeId) === index) // Remove duplicates
        .filter(homeId => !homes.find(h => h.id === homeId)); // Only load homes we don't already have
      
      if (allHomeIds.length > 0) {
        logger.debug(`🏠 Loading ${allHomeIds.length} homes (friends + requests):`, allHomeIds);
        try {
          const loadedHomes = await getHomesByIds(allHomeIds.filter((id): id is string => id !== undefined));
          logger.debug(`✅ Loaded homes:`, loadedHomes.map(h => ({ id: h.id, name: h.name })));
          
          // Add loaded homes to existing homes
          setHomes(prevHomes => {
            const combinedHomes = [...prevHomes];
            loadedHomes.forEach(loadedHome => {
              if (!combinedHomes.find(h => h.id === loadedHome.id)) {
                combinedHomes.push(loadedHome);
              }
            });
            return combinedHomes;
          });
        } catch (error) {
          logger.error('Error loading friend homes:', error);
        }
      }
    };
    
    loadFriendHomes();
  }, [friends, friendRequests, outgoingRequests]); // Don't include homes in deps - it causes infinite loop when we update it

  // Load contacts for name lookup
  useEffect(() => {
    loadContacts();
  }, []);

  // Fetch recipient user data when outgoing requests change
  useEffect(() => {
    const fetchRecipientData = async () => {
      const newRecipientUsers: {[key: string]: any} = {};
      
      for (const request of outgoingRequests) {
        if (request.toUserId && !recipientUsers[request.toUserId]) {
          try {
            const userData = await getUserData(request.toUserId);
            if (userData) {
              newRecipientUsers[request.toUserId] = userData;
            }
          } catch (error) {
            logger.error('Error fetching recipient data:', error);
          }
        }
      }
      
      if (Object.keys(newRecipientUsers).length > 0) {
        setRecipientUsers(prev => ({ ...prev, ...newRecipientUsers }));
      }
    };

    if (outgoingRequests.length > 0) {
      fetchRecipientData();
    }
  }, [outgoingRequests]);

  // Track user location for proximity detection
  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startLocationTracking = async () => {
      try {
        // Request both foreground and background permissions
        const foreground = await Location.requestForegroundPermissionsAsync();
        if (foreground.status !== 'granted') {
          logger.debug('Location permission not granted');
          return;
        }
        
        // Also request background for full functionality
        await Location.requestBackgroundPermissionsAsync();

        // Get initial location
        const location = await Location.getCurrentPositionAsync({});
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        // Watch location changes
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 60000, // Update every 60 seconds
            distanceInterval: 400, // Or when moved 400 meters (~0.25 miles)
          },
          (location) => {
            setUserLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
          }
        );
      } catch (error) {
        logger.error('Error tracking location:', error);
      }
    };

    startLocationTracking();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);


  // Update nearby friends when location or friends change
  useEffect(() => {
    if (userLocation && friends.length > 0) {
      const nearby = getNearbyFriends(friends, userLocation);
      setNearbyFriends(nearby);
      
    }
  }, [userLocation, friends]);

  // Track previous broadcast states to detect new broadcasts
  const [previousBroadcasts, setPreviousBroadcasts] = useState<Map<string, string>>(new Map());

  // Listen for new broadcasts from friends and send local notifications
  useEffect(() => {
    logger.debug(`📡 Checking broadcasts for ${friends.length} friends`);
    
    friends.forEach(async (friend) => {
      logger.debug(`📡 Friend ${friend.name}: broadcastLocation=${friend.broadcastLocation}, broadcastTimestamp=${friend.broadcastTimestamp}`);
      
      // Check if friend has a broadcast
      if (friend.broadcastLocation && friend.broadcastTimestamp) {
        const broadcastKey = `${friend.friendUserId}-${friend.broadcastTimestamp}`;
        const previousBroadcast = previousBroadcasts.get(friend.friendUserId);

        logger.debug(`📡 ${friend.name}: current=${broadcastKey}, previous=${previousBroadcast}`);

        // If this is a new broadcast (different from previous)
        if (previousBroadcast !== broadcastKey) {
          // Update our tracking
          setPreviousBroadcasts(prev => new Map(prev).set(friend.friendUserId, broadcastKey));

          // Don't notify on initial load (previousBroadcast is undefined)
          if (previousBroadcast !== undefined) {
            logger.debug(`📡 NEW BROADCAST from ${friend.name}! Sending notification...`);
            // Send push notification to current user
            const currentUser = auth.currentUser;
            if (currentUser) {
              const { sendBroadcastNotification } = await import('../services/notificationService');
              await sendBroadcastNotification(
                currentUser.uid,
                friend.name,
                friend.broadcastLocation,
                friend.broadcastMessage || ''
              );
            }
            logger.debug(`✅ Broadcast notification sent for ${friend.name}`);
          } else {
            logger.debug(`📡 Initial load for ${friend.name}, not notifying`);
          }
        }
      }
    });
  }, [friends, previousBroadcasts]);

  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editSharedHomesModalVisible, setEditSharedHomesModalVisible] = useState(false);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [editingSharedHomes, setEditingSharedHomes] = useState<string[]>([]);
  const [originalActiveZones, setOriginalActiveZones] = useState<string[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [collapsedFriends, setCollapsedFriends] = useState<{[key: string]: boolean}>({});
  const [friendActiveZones, setFriendActiveZones] = useState<{[key: string]: string[]}>({});
  const [sharedZoneDetails, setSharedZoneDetails] = useState<{[key: string]: Home}>({});

  const formatPhoneNumber = (phoneNumber: string): string => {
    // Remove all non-digits
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Format as (XXX) YYY-ZZZZ
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    
    // Format as +1 (XXX) YYY-ZZZZ for 11 digits starting with 1
    if (digits.length === 11 && digits.startsWith('1')) {
      const withoutCountryCode = digits.slice(1);
      return `+1 (${withoutCountryCode.slice(0, 3)}) ${withoutCountryCode.slice(3, 6)}-${withoutCountryCode.slice(6)}`;
    }
    
    // Return original if it doesn't match expected patterns
    return phoneNumber;
  };

  const getSharingStatus = (friend: Friend, zoneId: string): { iAmSharing: boolean, theyAreSharing: boolean } => {
    const currentUser = auth.currentUser;
    if (!currentUser) return { iAmSharing: false, theyAreSharing: false };
    
    // Get MY current active zones for this friend
    const myActiveZones = friend.activeHomes || friend.sharedHomes || [];
    const iAmSharing = myActiveZones.includes(zoneId);
    
    // Get THEIR active zones from cached data
    const theirActiveZones = friendActiveZones[friend.friendUserId] || [];
    const theyAreSharing = theirActiveZones.includes(zoneId);
    
    return { iAmSharing, theyAreSharing };
  };

  // Real-time bidirectional checking - subscribe to each friend's active zones
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser || friends.length === 0) {
      setFriendActiveZones({});
      return;
    }
    
    const unsubscribes: (() => void)[] = [];
    const activeZonesMap: {[key: string]: string[]} = {};
    
    // Set up real-time listeners for each friend's active zones
    friends.forEach(friend => {
      if (friend.friendUserId) {
        // Subscribe to their friend document where they have me as a friend
        const { onSnapshot, query, collection, where } = require('firebase/firestore');
        const { db } = require('../../firebaseConfig');
        
        const friendQuery = query(
          collection(db, 'friends'),
          where('userId', '==', friend.friendUserId),
          where('friendUserId', '==', currentUser.uid)
        );
        
        const unsubscribe = onSnapshot(friendQuery, (snapshot) => {
          if (!snapshot.empty) {
            const friendDoc = snapshot.docs[0];
            const friendData = friendDoc.data();
            const theirActiveZones = friendData.activeHomes || friendData.sharedHomes || [];
            
            // Update the map and trigger re-render
            setFriendActiveZones(prev => ({
              ...prev,
              [friend.friendUserId]: theirActiveZones
            }));
            
            logger.debug(`🔄 Real-time update: ${friend.name}'s active zones:`, theirActiveZones);
          } else {
            // No document found, they have no active zones with me
            setFriendActiveZones(prev => ({
              ...prev,
              [friend.friendUserId]: []
            }));
          }
        });
        
        unsubscribes.push(unsubscribe);
      }
    });
    
    // Cleanup function
    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [friends]);

  // Load shared zone details for zones you don't own
  useEffect(() => {
    const loadSharedZoneDetails = async () => {
      if (friends.length === 0) {
        setSharedZoneDetails({});
        return;
      }
      
      // Collect all zone IDs from friends that aren't in your homes
      const allSharedZoneIds = new Set<string>();
      const yourHomeIds = new Set(homes.map(h => h.id));
      
      friends.forEach(friend => {
        const friendZones = friend.sharedHomes || [];
        friendZones.forEach(zoneId => {
          if (!yourHomeIds.has(zoneId)) {
            allSharedZoneIds.add(zoneId);
          }
        });
      });
      
      if (allSharedZoneIds.size > 0) {
        try {
          const zoneDetails = await getSharedZoneDetails(Array.from(allSharedZoneIds));
          setSharedZoneDetails(zoneDetails);
        } catch (error) {
          logger.error('❌ Error loading shared zone details:', error);
        }
      }
    };
    
    loadSharedZoneDetails();
  }, [friends, homes]);

  // Load contacts for name lookup
  const loadContacts = async () => {
    try {
      // Check current permission status first
      const { status: currentStatus } = await Contacts.getPermissionsAsync();
      
      // If permission was never asked, show our explainer first
      if (currentStatus === 'undetermined') {
        const userWantsToGrant = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Connect with Friends',
            'FriendZone can show which of your contacts are already using the app, making it easier to connect.\n\nYour contacts stay private and are never uploaded to our servers.',
            [
              { text: 'Not Now', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Continue', onPress: () => resolve(true) }
            ]
          );
        });
        
        if (!userWantsToGrant) {
          return;
        }
      }
      
      // User said yes (or already granted) - now request permission (system dialog will show)
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') return;

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      const contactsWithPhones = data
        .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map(contact => ({
          id: contact.id,
          name: contact.name,
          phoneNumbers: contact.phoneNumbers?.map(phone => phone.number?.replace(/\D/g, '')) || []
        }));

      setContacts(contactsWithPhones);
    } catch (error) {
      logger.error('Error loading contacts:', error);
    }
  };

  // Find contact name by phone number
  const getContactNameByPhone = (phoneNumber: string): string | null => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const contact = contacts.find(contact => 
      contact.phoneNumbers.some((phone: string) => 
        phone === cleanPhone || phone === cleanPhone.slice(-10) || cleanPhone.endsWith(phone)
      )
    );
    return contact?.name || null;
  };

  const getHomeNamesFromIds = (homeIds: string[]): string[] => {
    return homeIds
      .map(homeId => {
        const home = homes.find(h => h.id === homeId);
        return home?.name;
      })
      .filter(name => name !== undefined) as string[]; // Filter out deleted zones
  };

  // Render merged friend with clear sections for connected zones and pending invites
  const renderMergedFriend = (merged: MergedFriend) => {
    const friend = merged.activeFriend;
    const currentUser = auth.currentUser;
    
    // Handle pending-only entries (no active friendship yet)
    const isPendingOnly = !friend;
    
    // Get current zone names (friend can be in multiple zones)
    // Backward compatibility: check both currentHomeIds (new) and currentHomeId (old)
    const currentHomeIds = friend?.currentHomeIds || (friend?.currentHomeId ? [friend.currentHomeId] : []);
    const currentZoneNames = currentHomeIds.map(id => getHomeNameFromId(id)).filter(name => name !== null);
    const currentHomeName = currentZoneNames.length > 0 ? currentZoneNames[0] : null; // Show first zone
    const activeZoneNames = getHomeNamesFromIds(merged.activeZones);
    
    // Check if location is stale (only for active friends)
    const lastSeen = friend?.lastSeen || 0;
    const isStale = friend ? isLocationStale(lastSeen) : false;
    const timeAgo = isStale ? formatTimeAgo(lastSeen) : '';
    
    // Trust the database's isCurrentlyAtHome and currentHomeIds
    // Show timestamp if stale, but don't override zone presence
    const effectivelyAtHome = friend && friend.isCurrentlyAtHome && currentHomeIds.length > 0;
    
    // Format location text based on staleness
    let locationText = '';
    if (effectivelyAtHome && currentHomeName) {
      if (isStale) {
        locationText = `Last seen at ${currentHomeName}, ${timeAgo}`;
      } else {
        locationText = `at ${currentHomeName}`;
      }
    } else {
      locationText = 'away';
    }
    
    const locationWithTime = locationText;

    // Group pending requests by type (incoming vs outgoing)
    const incomingRequests = merged.pendingRequests.filter(req => req.toUserId === currentUser?.uid);
    const outgoingRequests = merged.pendingRequests.filter(req => req.fromUserId === currentUser?.uid);

    return (
      <Swipeable
        key={merged.key}
        renderRightActions={friend ? renderRightActions(friend) : undefined}
        overshootRight={false}
      >
        <View style={styles.friendCard}>
          {/* Header: Name and location */}
          <View style={styles.friendHeader}>
            <TouchableOpacity 
              style={styles.friendNameRow}
              onPress={() => toggleFriendCollapse(merged.key)}
              activeOpacity={0.7}
            >
              {(activeZoneNames.length > 0 || incomingRequests.length > 0 || outgoingRequests.length > 0) && (
                <Ionicons 
                  name="caret-forward" 
                  size={14} 
                  color="#000000" 
                  style={[
                    styles.chevronIcon,
                    !collapsedFriends[merged.key] && styles.chevronDown
                  ]}
                />
              )}
              <Text style={styles.friendName}>{merged.name}</Text>
              {friend && friend.status === 'connected' && (
                <Text style={[
                  styles.locationText,
                  isStale && styles.locationTextStale
                ]}>
                  {' '}{locationWithTime}
                </Text>
              )}
            </TouchableOpacity>
            
            {/* Action buttons */}
            <View style={styles.friendActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  const phoneNumber = (friend?.phoneNumber || merged.phoneNumber)?.replace(/\D/g, '');
                  if (phoneNumber) {
                    Linking.openURL(`tel:${phoneNumber}`);
                  }
                }}
              >
                <Ionicons name="call" size={16} color="#007AFF" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={(e) => {
                  const phoneNumber = (friend?.phoneNumber || merged.phoneNumber)?.replace(/\D/g, '');
                  if (phoneNumber) {
                    Linking.openURL(`sms:${phoneNumber}`);
                  }
                }}
              >
                <Ionicons name="chatbubble" size={16} color="#007AFF" />
              </TouchableOpacity>
              
              {friend && friend.status === 'connected' && (friend.sharedHomes || []).length > 0 && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleEditSharedHomes(friend)}
                >
                  <Ionicons name="settings-outline" size={16} color="#007AFF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Collapsible Content */}
          {!collapsedFriends[merged.key] && (
            <>
              {/* All Zones Section - Combined active and pending */}
              {(activeZoneNames.length > 0 || outgoingRequests.length > 0 || incomingRequests.length > 0) && (
            <View style={styles.zoneSection}>
              {/* Active/Connected Zones */}
              {merged.activeZones.map((zoneId, index) => {
                const zoneName = getHomeNameFromId(zoneId);
                const { iAmSharing, theyAreSharing } = friend ? getSharingStatus(friend, zoneId) : { iAmSharing: false, theyAreSharing: false };
                return (
                  <View key={index} style={styles.zoneItem}>
                    <View style={styles.zoneRow}>
                      <Text style={styles.zoneItemText}>• {zoneName}</Text>
                      <View style={styles.sharingChips}>
                        {(iAmSharing && theyAreSharing) && (
                          <View style={styles.connectedChip}>
                            <Text style={styles.connectedChipText}>Connected</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
              
              {/* Spacing between active and pending zones */}
              {merged.activeZones.length > 0 && (outgoingRequests.length > 0 || incomingRequests.length > 0) && (
                <View style={{height: 12}} />
              )}
              
              {/* Outgoing Pending Zones (you sent) */}
              {outgoingRequests.map((request) => {
                const zoneNames = getHomeNamesFromIds(request.homeIds || []);
                return zoneNames.map((zoneName, index) => (
                  <View key={`${request.id}-${index}`} style={styles.zoneItem}>
                    <View style={styles.zoneRow}>
                      <Text style={styles.zoneItemText}>• {zoneName}</Text>
                      <View style={styles.sharingChips}>
                        <View style={styles.pendingChip}>
                          <Text style={styles.pendingChipText}>Pending</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.cancelChip}
                          onPress={() => handleCancelRequest(request.id)}
                        >
                          <Text style={styles.cancelChipText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ));
              })}
            </View>
          )}

          {/* Broadcast Message - only show if location exists and timestamp is recent (within 24 hours) */}
          {friend && friend.broadcastLocation && friend.broadcastTimestamp && 
           (Date.now() - friend.broadcastTimestamp < 24 * 60 * 60 * 1000) && (
            <View style={styles.broadcastSection}>
              <Ionicons name="radio" size={12} color="#FF5A5F" style={{marginRight: 4}} />
              <Text style={styles.broadcastText}>
                {friend.broadcastLocation}
                {friend.broadcastMessage ? `: ${friend.broadcastMessage}` : ''}
              </Text>
            </View>
          )}
            </>
          )}
        </View>
      </Swipeable>
    );
  };

  const getHomeNameFromId = (homeId: string | undefined | null): string | null => {
    if (!homeId) return null;
    
    // First check your own homes
    const home = homes.find(h => h.id === homeId);
    if (home) return home.name;
    
    // Then check shared zone details cache
    const sharedZone = sharedZoneDetails[homeId];
    if (sharedZone) return sharedZone.name;
    
    // If homeId looks like encrypted data (long alphanumeric), return null instead of showing it
    // Firebase IDs are typically 20 chars, encrypted strings are also ~20 chars
    if (homeId.length >= 20 && /^[a-zA-Z0-9]+$/.test(homeId)) {
      logger.debug(`⚠️ Hiding encrypted/unknown zone ID: ${homeId}`);
      return null;
    }
    
    // Fallback to ID if not found (for short, readable IDs)
    return homeId;
  };

  const handleEditSharedHomes = (friend: Friend) => {
    logger.debug('🏠 Opening zone sharing modal');
    logger.debug('Friend shared homes:', friend.sharedHomes);
    logger.debug('Friend shared homes length:', friend.sharedHomes?.length);
    logger.debug('All available homes:', homes.map(h => `${h.name} (${h.id})`));
    
    // Create a snapshot of the friend to prevent re-renders from affecting the modal
    const friendSnapshot = {
      ...friend,
      sharedHomes: [...(friend.sharedHomes || [])]
    };
    
    setEditingFriend(friendSnapshot);
    // Store the ORIGINAL state when opening the modal
    const currentActiveZones = friend.activeHomes || friend.sharedHomes || [];
    setOriginalActiveZones([...currentActiveZones]);
    setEditingSharedHomes([...currentActiveZones]);
    setEditSharedHomesModalVisible(true);
  };

  const handleSaveSharedHomes = async () => {
    logger.debug('🚨 SAVE BUTTON CLICKED!');
    
    if (!editingFriend) {
      logger.debug('❌ No editing friend found');
      return;
    }
    
    // If no zones are selected, just turn OFF all sharing (keep friend, keep permissions)
    // This allows user to turn sharing back ON later without needing permission again
    proceedWithSave();
  };

  const proceedWithSave = async () => {
    if (!editingFriend) return;
    
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    
    logger.debug('=== SMART ZONE MANAGEMENT ===');
    logger.debug('Original shared homes:', editingFriend.sharedHomes);
    logger.debug('New shared homes:', editingSharedHomes);
    logger.debug('Friend:', editingFriend.name);
    
    try {
      const currentSharedHomes = editingFriend.sharedHomes || [];
      const newSharedHomes = editingSharedHomes;
      
      // Get the ORIGINAL permissions (what Jodi has already agreed to)
      const originalPermissions = editingFriend.sharedHomes || [];
      
      // Determine what's happening by comparing to ORIGINAL ACTIVE STATE (not permissions):
      const trulyNewZones = newSharedHomes.filter(id => !originalPermissions.includes(id)); // Never had permission
      const zonesToTurnOff = originalActiveZones.filter(id => !newSharedHomes.includes(id)); // Was active, now turning off
      const zonesToReactivate = newSharedHomes.filter(id => 
        originalPermissions.includes(id) && // Has permission
        !originalActiveZones.includes(id) // Was NOT active before, now turning ON
      );
      
      logger.debug('🔍 DEBUGGING ZONE LOGIC:');
      logger.debug('Original active zones when modal opened:', originalActiveZones);
      logger.debug('ORIGINAL permissions (what Jodi agreed to):', originalPermissions);
      logger.debug('New shared homes (what you selected):', newSharedHomes);
      logger.debug('TRULY NEW zones (requires permission):', trulyNewZones);
      logger.debug('Zones to turn OFF (immediate):', zonesToTurnOff);
      logger.debug('Zones to reactivate (immediate):', zonesToReactivate);
      
      let immediateChanges = 0;
      let requestsSent = 0;
      
      // Handle immediate changes (turning OFF + reactivating existing permissions)
      const totalImmediateChanges = zonesToTurnOff.length + zonesToReactivate.length;
      if (totalImmediateChanges > 0) {
        // DON'T update sharedHomes (permissions) - only update activeHomes (status)
        // Import the toggleZoneStatus function for individual zone control
        const { updateDoc, doc, query, collection, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('../../firebaseConfig');
        
        // Find the user's friend document
        const friendsQuery = query(
          collection(db, 'friends'),
          where('userId', '==', currentUser.uid),
          where('friendUserId', '==', editingFriend.friendUserId)
        );
        
        const snapshot = await getDocs(friendsQuery);
        
        if (!snapshot.empty) {
          const friendDoc = snapshot.docs[0];
          
          // Update ONLY the activeHomes field, keep sharedHomes (permissions) intact
          await updateDoc(friendDoc.ref, {
            activeHomes: newSharedHomes // This is the active status, not permissions
          });
          
          logger.debug('✅ Updated activeHomes only (permissions preserved):', { 
            activeHomes: newSharedHomes,
            originalPermissions: originalPermissions 
          });
        }
        
        immediateChanges = totalImmediateChanges;
        logger.debug('✅ Immediately updated zones (OFF + reactivated):', { zonesToTurnOff, zonesToReactivate });
      }
      
      // Handle adding TRULY NEW zones - requires permission
      if (trulyNewZones.length > 0) {
        const userData = await getUserData(currentUser.uid);
        if (!userData) {
          throw new Error('User data not found');
        }
        
        const zoneNames = trulyNewZones.map((zoneId: string) => {
          const home = homes.find(h => h.id === zoneId);
          if (home) return home.name;
          const sharedZone = sharedZoneDetails[zoneId];
          if (sharedZone) return sharedZone.name;
          return zoneId;
        });
        
        await sendZoneRequest(
          currentUser.uid,
          editingFriend.friendUserId,
          userData.name,
          editingFriend.name,
          'add',
          trulyNewZones,
          zoneNames,
          `${userData.name} wants to share ${zoneNames.length} new zone(s) with you`
        );
        
        requestsSent = trulyNewZones.length;
        logger.debug('📤 Sent requests for TRULY NEW zones:', trulyNewZones);
      }
      
      setEditSharedHomesModalVisible(false);
      setEditingFriend(null);
      
      // Show appropriate success message
      if (immediateChanges > 0 && requestsSent > 0) {
        Alert.alert(
          'Zone Changes Made',
          `Turned OFF ${immediateChanges} zone(s) immediately. Sent ${requestsSent} request(s) for new zones to ${editingFriend.name}.`,
          [{ text: 'OK' }]
        );
      } else if (immediateChanges > 0) {
        const offCount = zonesToTurnOff.length;
        const reactivatedCount = zonesToReactivate.length;
        
        let message = '';
        if (offCount > 0 && reactivatedCount > 0) {
          message = `Turned OFF ${offCount} zone(s) and reactivated ${reactivatedCount} zone(s).`;
        } else if (offCount > 0) {
          message = `Turned OFF ${offCount} zone(s). You're no longer sharing these zones with ${editingFriend.name}.`;
        } else {
          message = `Reactivated ${reactivatedCount} zone(s). You're now sharing these zones with ${editingFriend.name} again.`;
        }
        
        Alert.alert('Zone Changes Applied', message, [{ text: 'OK' }]);
      } else if (requestsSent > 0) {
        Alert.alert(
          'Zone Requests Sent',
          `Sent ${requestsSent} request(s) for new zones to ${editingFriend.name}. They need to accept before sharing begins.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('No Changes', 'No zone changes were made.', [{ text: 'OK' }]);
      }
      
    } catch (error) {
      logger.error('Error managing zones:', error);
      Alert.alert(
        'Error', 
        `Failed to update zones: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    } finally {
      // Always close the modal after save attempt
      setEditSharedHomesModalVisible(false);
      setEditingFriend(null);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    // Find the request to get the sender's name
    const request = friendRequests.find(r => r.id === requestId);
    if (!request) return;

    try {
      // Get the homes that sender offered to share
      const requestedHomeIds = request.homeIds || (request.homeId ? [request.homeId] : []);
      const requestedHomes = await getHomesByIds(requestedHomeIds);
      
      // Check if this is an existing friend (already have shared zones)
      const existingFriend = friends.find(f => 
        f.friendUserId === request.fromUserId
      );
      const existingSharedZones = existingFriend?.sharedHomes || [];
      
      // Separate into already connected and new zones
      const alreadyConnectedHomes = requestedHomes.filter(h => existingSharedZones.includes(h.id));
      const newInviteHomes = requestedHomes.filter(h => !existingSharedZones.includes(h.id));
      
      // Show home selection modal
      setPendingRequestId(requestId);
      setPendingRequestFromUser(request.fromUserName);
      setOfferedHomes(requestedHomes);
      setAlreadyConnectedHomes(alreadyConnectedHomes);
      setNewInviteHomes(newInviteHomes);
      
      // Pre-select all the NEW zones (not the already connected ones)
      setSelectedHomeIds(newInviteHomes.map(h => h.id));
      setAcceptModalVisible(true);
    } catch (error) {
      logger.error('Error loading offered homes:', error);
      Alert.alert('Error', 'Failed to load home details. Please try again.');
    }
  };

  const handleConfirmAccept = async () => {
    if (!pendingRequestId) return;

    setIsAccepting(true);
    try {
      // Accept the friend request with selected homes
      await acceptFriendRequest(pendingRequestId, selectedHomeIds);
      
      // Refresh geofencing if user joined new zones
      if (selectedHomeIds.length > 0) {
        const { refreshGeofencingRegions } = await import('../services/locationServiceV3');
        await refreshGeofencingRegions();
        logger.debug('📍 Joined new zones - refreshed geofencing regions');
      }
      
      setAcceptModalVisible(false);
      setPendingRequestId(null);
      setPendingRequestFromUser('');
      setSelectedHomeIds([]);
      
      Alert.alert('Request Accepted', `You are now connected with ${pendingRequestFromUser}!`);
    } catch (error) {
      logger.error('Error accepting friend request:', error);
      Alert.alert('Error', 'Failed to accept friend request. Please try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleCancelAccept = () => {
    setAcceptModalVisible(false);
    setPendingRequestId(null);
    setPendingRequestFromUser('');
    setSelectedHomeIds([]);
  };

  const toggleHomeSelection = (homeId: string) => {
    setSelectedHomeIds(prev =>
      prev.includes(homeId)
        ? prev.filter(id => id !== homeId)
        : [...prev, homeId]
    );
  };

  const handleIgnoreRequest = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId);
      Alert.alert('Request Ignored', 'Friend request has been ignored.');
    } catch (error) {
      logger.error('Error rejecting friend request:', error);
      Alert.alert('Error', 'Failed to ignore friend request. Please try again.');
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelFriendRequest(requestId);
      Alert.alert('Request Cancelled', 'Friend request has been cancelled.');
    } catch (error) {
      logger.error('Error cancelling friend request:', error);
      Alert.alert('Error', 'Failed to cancel friend request. Please try again.');
    }
  };

  const toggleFriendCollapse = (friendId: string) => {
    setCollapsedFriends(prev => ({
      ...prev,
      [friendId]: !prev[friendId]
    }));
  };

  const handleFriendPress = (friend: Friend) => {
    if (friend.status === 'connected' && (friend.sharedHomes || []).length > 0) {
      setSelectedFriend(friend);
      setModalVisible(true);
    }
  };

  const handleToggleHome = (homeId: string) => {
    if (selectedFriend) {
      const currentSharedHomes = selectedFriend.sharedHomes || [];
      const updatedHomes = currentSharedHomes.includes(homeId)
        ? currentSharedHomes.filter(h => h !== homeId)
        : [...currentSharedHomes, homeId];

      const updatedFriend = {...selectedFriend, sharedHomes: updatedHomes};
      setSelectedFriend(updatedFriend);
    }
  };

  const handleSaveSharedZones = async () => {
    if (!selectedFriend) return;

    try {
      // Update the friend document in Firestore
      const friendDoc = doc(db, 'friends', selectedFriend.id);
      await updateDoc(friendDoc, {
        sharedHomes: selectedFriend.sharedHomes || [],
      });

      // Update local state
      setFriends(friends.map(f => f.id === selectedFriend.id ? selectedFriend : f));
      
      setModalVisible(false);
      Alert.alert('Success', 'Shared zones updated successfully');
    } catch (error) {
      logger.error('Error updating shared zones:', error);
      Alert.alert('Error', 'Failed to update shared zones. Please try again.');
    }
  };

  const handleDeleteFriend = async (friend: Friend) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !friend.friendUserId) return;

    Alert.alert(
      'Delete Friend',
      `Are you sure you want to delete ${friend.name}? This will remove them from all shared zones.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              logger.debug(`🗑️ Starting delete for friend: ${friend.name} (${friend.friendUserId})`);
              logger.debug(`🔑 Current user: ${currentUser.uid}`);
              
              await deleteFriend(currentUser.uid, friend.friendUserId);
              
              logger.debug('✅ Delete completed successfully');
              Alert.alert('Success', `${friend.name} has been removed from your friends.`);
            } catch (error: any) {
              logger.error('❌ Error deleting friend:', error);
              logger.error('Error details:', {
                message: error?.message,
                code: error?.code,
                stack: error?.stack
              });
              Alert.alert('Error', `Failed to delete friend: ${error?.message || 'Unknown error'}`);
            }
          },
        },
      ]
    );
  };

  const handleCancelPendingRequest = async (request: FriendRequest, recipientName: string) => {
    Alert.alert(
      'Cancel Request',
      `Cancel friend request to ${recipientName}?`,
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelFriendRequest(request.id);
              Alert.alert('Cancelled', 'Friend request has been cancelled.');
            } catch (error) {
              logger.error('Error cancelling request:', error);
              Alert.alert('Error', 'Failed to cancel request. Please try again.');
            }
          },
        },
      ]
    );
  };

  const renderFriendRequest = (request: FriendRequest, index?: number) => {
    const zoneNames = getHomeNamesFromIds(request.homeIds || []);
    const zoneText = zoneNames.length > 0 ? ` in ${zoneNames.join(', ')}` : '';
    
    return (
      <View key={request.id || `request-${index}`} style={styles.requestCard}>
        <View style={styles.requestInfo}>
          <Text style={styles.requestName}>{request.fromUserName}</Text>
          <Text style={styles.requestText}>wants to connect{zoneText}</Text>
        </View>
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={styles.ignoreButton}
            onPress={() => handleIgnoreRequest(request.id)}
          >
            <Text style={styles.ignoreButtonText}>Ignore</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => handleAcceptRequest(request.id)}
          >
            <Text style={styles.acceptButtonText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPendingFriend = (request: FriendRequest, index?: number) => {
    const recipientUser = request.toUserId ? recipientUsers[request.toUserId] : null;
    const requestHomeIds = request.homeIds || (request.homeId ? [request.homeId] : []);
    
    // Handle cases where toUserId is null (user doesn't exist on FriendZone yet)
    let recipientName: string;
    let recipientPhone: string;
    let statusText: string;
    
    if (request.toUserId && recipientUser) {
      // User exists on FriendZone
      recipientName = recipientUser.name;
      recipientPhone = recipientUser.phoneNumber;
      statusText = formatPhoneNumber(recipientPhone);
    } else if (request.toPhoneNumber) {
      // User doesn't exist on FriendZone yet - try to get contact name
      recipientPhone = request.toPhoneNumber;
      const contactName = getContactNameByPhone(recipientPhone);
      recipientName = contactName || formatPhoneNumber(recipientPhone);
      statusText = 'SMS invitation sent';
    } else {
      // Fallback
      recipientName = 'Unknown Contact';
      statusText = 'Pending';
    }

    const handleCancelZone = (zoneId: string) => {
      const zoneName = getHomeNameFromId(zoneId);
      Alert.alert(
        'Cancel Zone',
        `Remove ${zoneName} from invitation to ${recipientName}?`,
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes, Remove',
            style: 'destructive',
            onPress: async () => {
              // If this is the last zone, cancel the entire request
              if (requestHomeIds.length === 1) {
                await handleCancelPendingRequest(request, recipientName);
              } else {
                // TODO: Implement partial zone removal
                Alert.alert('Coming Soon', 'Partial zone removal will be available soon. For now, you can cancel the entire request.');
              }
            }
          }
        ]
      );
    };

    return (
      <View key={request.id ? `pending-${request.id}` : `pending-${index}`} style={styles.pendingRequestCard}>
        <View style={styles.pendingRequestHeader}>
          <View style={styles.friendInfo}>
            <Text style={styles.friendName} numberOfLines={1} ellipsizeMode="tail">
              {recipientName}
            </Text>
            <Text style={styles.friendStatus}>
              {statusText}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.cancelAllButton}
            onPress={() => handleCancelPendingRequest(request, recipientName)}
          >
            <Text style={styles.cancelAllButtonText}>Cancel All</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.pendingZonesList}>
          {requestHomeIds.map((zoneId, idx) => {
            const zoneName = getHomeNameFromId(zoneId);
            return (
              <View key={idx} style={styles.pendingZoneItem}>
                <Text style={styles.pendingZoneName}>• {zoneName}</Text>
                <TouchableOpacity
                  style={styles.cancelZoneButton}
                  onPress={() => handleCancelZone(zoneId)}
                >
                  <Ionicons name="close-circle" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
        
        <Text style={styles.pendingStatusText}>
          {request.toUserId ? 'Pending' : 'SMS Sent'}
        </Text>
      </View>
    );
  };

  const renderRightActions = (friend: Friend) => (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        style={[
          styles.deleteAction,
          {
            transform: [{ translateX: trans }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteFriend(friend)}
        >
          <Ionicons name="trash" size={24} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderFriend = (friend: Friend) => {
    // Backward compatibility: check both currentHomeIds (new) and currentHomeId (old)
    const currentHomeIds = friend.currentHomeIds || (friend.currentHomeId ? [friend.currentHomeId] : []);
    const currentZoneNames = currentHomeIds.map(id => getHomeNameFromId(id)).filter(name => name !== null);
    const currentHomeName = currentZoneNames.length > 0 ? currentZoneNames[0] : null;
    const zoneCount = friend.sharedHomes?.length || 0;
    
    const locationText = friend.isCurrentlyAtHome && currentHomeName
      ? `at ${currentHomeName}`
      : 'away';

    return (
      <Swipeable
        key={friend.id}
        renderRightActions={renderRightActions(friend)}
        overshootRight={false}
      >
        <View style={styles.friendCard}>
          <View style={styles.friendCompactRow}>
            {/* Left: Name and info */}
            <View style={styles.friendInfo}>
              <View style={styles.friendNameRow}>
                <Text style={styles.friendName}>{friend.name}</Text>
                {friend.status === 'connected' && <Text style={styles.locationText}> at {currentHomeName || 'away'}</Text>}
              </View>
              <Text style={styles.zoneCountText}>
                {zoneCount} {zoneCount === 1 ? 'zone' : 'zones'}
              </Text>
              
              {/* Broadcast Message - only show if location exists and timestamp is recent (within 24 hours) */}
              {friend.broadcastLocation && friend.broadcastTimestamp && 
               (Date.now() - friend.broadcastTimestamp < 24 * 60 * 60 * 1000) && (
                <View style={styles.broadcastRow}>
                  <Ionicons name="radio" size={12} color="#FF5A5F" style={{marginRight: 4}} />
                  <Text style={styles.broadcastText}>
                    {friend.broadcastLocation}
                    {friend.broadcastMessage ? `: ${friend.broadcastMessage}` : ''}
                  </Text>
                </View>
              )}
            </View>

            {/* Right: Action buttons */}
            <View style={styles.friendActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  const phoneNumber = friend.phoneNumber?.replace(/\D/g, '');
                  if (phoneNumber) {
                    Linking.openURL(`tel:${phoneNumber}`);
                  }
                }}
              >
                <Ionicons name="call" size={16} color="#007AFF" />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  const phoneNumber = friend.phoneNumber?.replace(/\D/g, '');
                  if (phoneNumber) {
                    Linking.openURL(`sms:${phoneNumber}`);
                  }
                }}
              >
                <Ionicons name="chatbubble" size={16} color="#007AFF" />
              </TouchableOpacity>
              
              {friend.status === 'connected' && zoneCount > 0 && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleEditSharedHomes(friend)}
                >
                  <Ionicons name="chevron-forward" size={20} color="#666666" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Swipeable>
    );
  };

  const pendingRequestsCount = standaloneRequests.filter(r => r.status === 'pending').length;

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} allowFontScaling={false}>Friends</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('SelectFriends', {})}
        >
          <Ionicons name="person-add" size={18} color="#FFFFFF" style={{marginRight: 4}} />
          <Text style={styles.addButtonText}>Invite</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {/* Nearby Friends Section */}
        {nearbyFriends.length > 0 && (
          <View style={styles.section}>
            <View style={styles.nearbyHeader}>
              <Text style={styles.sectionTitle}>🧲 Nearby Friends</Text>
              <Text style={styles.nearbyCount}>{nearbyFriends.length}</Text>
            </View>
            {nearbyFriends.map((friend) => (
              <View key={friend.id} style={styles.nearbyFriendCard}>
                <View style={styles.nearbyFriendInfo}>
                  <Text style={styles.nearbyFriendName}>{friend.name}</Text>
                  <Text style={styles.nearbyFriendDistance}>
                    {formatDistance(friend.distance)}
                  </Text>
                </View>
                <View style={styles.nearbyIndicator}>
                  <Ionicons name="location" size={20} color="#FF5A5F" />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Incoming Friend Requests */}
        {standaloneRequests.filter(req => req.toUserId === auth.currentUser?.uid).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Friend Requests</Text>
            {standaloneRequests
              .filter(req => req.toUserId === auth.currentUser?.uid)
              .map((request, index) => renderFriendRequest(request, index))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Friends</Text>
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Loading friends from Firebase...</Text>
            </View>
          ) : mergedFriends.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                Add some friends to share your location
              </Text>
            </View>
          ) : (
            <>
              {mergedFriends.map((merged) => renderMergedFriend(merged))}
            </>
          )}
        </View>
      </ScrollView>

      {/* Shared Homes Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)} style={{minWidth: 70}}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              Shared Zones with {selectedFriend?.name}
            </Text>
            <TouchableOpacity onPress={handleSaveSharedZones} style={{minWidth: 70, alignItems: 'flex-end'}}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.modalDescription}>
              Select which zones you want to share with {selectedFriend?.name}:
            </Text>

            {homes
              .filter(home => selectedFriend?.sharedHomes.includes(home.id))
              .map(home => {
                const isChecked = selectedFriend?.sharedHomes.includes(home.id);
                return (
                  <TouchableOpacity
                    key={home.id}
                    style={styles.homeOption}
                    onPress={() => handleToggleHome(home.id)}
                  >
                    <View style={styles.checkboxContainer}>
                      <View style={[styles.checkbox, isChecked && styles.checkboxSelected]}>
                        {isChecked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                      </View>
                    </View>
                    <View style={styles.homeInfo}>
                      <Text style={styles.homeOptionText}>{home.name}</Text>
                      <Text style={styles.homeAddress}>{home.location.address}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Home Selection Modal for Accepting Friend Requests */}
      <Modal
        visible={acceptModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCancelAccept}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              Select Zones to Join
            </Text>
            <TouchableOpacity 
              onPress={handleConfirmAccept} 
              style={[styles.acceptButtonHeader, isAccepting && styles.acceptButtonDisabled]}
              disabled={isAccepting}
            >
              <Text style={styles.acceptButtonHeaderText}>
                {isAccepting ? 'Accepting...' : 'Accept'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.modalDescription}>
              {pendingRequestFromUser} wants to share zones with you:
            </Text>

            {/* Already Connected Section */}
            {alreadyConnectedHomes.length > 0 && (
              <View style={styles.zoneGroup}>
                <Text style={styles.zoneGroupTitle}>✅ Already Connected</Text>
                {alreadyConnectedHomes.map(home => (
                  <View key={home.id} style={styles.homeOption}>
                    <View style={styles.checkboxContainer}>
                      <View style={[styles.checkbox, styles.checkboxDisabled]}>
                        <Ionicons name="checkmark" size={16} color="#CCCCCC" />
                      </View>
                    </View>
                    <View style={styles.homeInfo}>
                      <Text style={[styles.homeOptionText, {color: '#999999'}]}>{home.name}</Text>
                      <Text style={styles.homeAddress}>{home.location.address}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* New Invite Section */}
            {newInviteHomes.length > 0 && (
              <View style={styles.zoneGroup}>
                <Text style={styles.zoneGroupTitle}>
                  {alreadyConnectedHomes.length > 0 ? '📍 New Invite' : 'Select zones:'}
                </Text>
                {newInviteHomes.map(home => (
                  <TouchableOpacity
                    key={home.id}
                    style={styles.homeOption}
                    onPress={() => toggleHomeSelection(home.id)}
                  >
                    <View style={styles.checkboxContainer}>
                      <TouchableOpacity
                        style={[
                          styles.checkbox,
                          selectedHomeIds.includes(home.id) && styles.checkboxSelected
                        ]}
                        onPress={() => toggleHomeSelection(home.id)}
                      >
                        {selectedHomeIds.includes(home.id) && (
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        )}
                      </TouchableOpacity>
                    </View>
                    <View style={styles.homeInfo}>
                      <Text style={styles.homeOptionText}>{home.name}</Text>
                      <Text style={styles.homeAddress}>{home.location.address}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {offeredHomes.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {pendingRequestFromUser} didn't offer any specific homes to share.
                </Text>
              </View>
            )}


            <View style={styles.modalFooter}>
              <Text style={styles.footerNote}>
                You can always change shared zones later in the friend's profile.
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Edit Shared Homes Modal */}
      <Modal
        visible={editSharedHomesModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              setEditSharedHomesModalVisible(false);
              setEditingFriend(null);
            }} style={{minWidth: 70}}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              Shared Zones with {editingFriend?.name}
            </Text>
            <TouchableOpacity onPress={handleSaveSharedHomes} style={{minWidth: 70, alignItems: 'flex-end'}}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.modalContent}
            contentContainerStyle={{ paddingBottom: 100 }}
          >
            <Text style={styles.modalDescription}>
              Select which zones you want to share with {editingFriend?.name}:
            </Text>

            {(() => {
              logger.debug('🔍 MODAL RENDER - editingSharedHomes:', editingSharedHomes);
              logger.debug('🔍 MODAL RENDER - editingFriend name:', editingFriend?.name);
              return null;
            })()}
            {homes.length > 0 ? (
              homes.map(home => {
                logger.debug(`Rendering home: ${home.name} (${home.id}) - Selected: ${editingSharedHomes.includes(home.id)}`);
                return (
                <View
                  key={home.id}
                  style={styles.homeOption}
                >
                  <View style={styles.checkboxContainer}>
                    <TouchableOpacity
                      style={[
                        styles.checkbox,
                        editingSharedHomes.includes(home.id) && styles.checkboxSelected
                      ]}
                      onPress={() => {
                        logger.debug(`Toggling home: ${home.name} (${home.id})`);
                        setEditingSharedHomes(prev => {
                          const isCurrentlySelected = prev.includes(home.id);
                          const newSelection = isCurrentlySelected
                            ? prev.filter(id => id !== home.id)
                            : [...prev, home.id];
                          logger.debug(`${home.name}: ${isCurrentlySelected ? 'DESELECTED' : 'SELECTED'}`);
                          logger.debug('New editingSharedHomes:', newSelection);
                          return newSelection;
                        });
                      }}
                    >
                      {editingSharedHomes.includes(home.id) && (
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={styles.homeInfo}>
                    <Text style={styles.homeOptionText}>{home.name}</Text>
                    <Text style={styles.homeAddress}>{home.location.address}</Text>
                  </View>
                </View>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  No homes available to share.
                </Text>
              </View>
            )}


            <View style={styles.modalFooter}>
              <Text style={styles.footerNote}>
                This only controls YOUR sharing with {editingFriend?.name}. They control their own sharing separately.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
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
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 16,
  },
  requestCard: {
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
  requestInfo: {
    flex: 1,
  },
  requestName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 2,
  },
  requestText: {
    fontSize: 14,
    color: '#717171',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  ignoreButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },
  ignoreButtonText: {
    color: '#717171',
    fontWeight: '600',
  },
  acceptButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FF5A5F',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  friendCard: {
    flexDirection: 'column',
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
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 2,
    flexShrink: 0, // Prevents name from shrinking
  },
  friendStatus: {
    fontSize: 14,
    color: '#717171',
  },
  pendingStatus: {
    color: '#FFA500',
  },
  activeStatus: {
    color: '#00C851',
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
    color: '#DDDDDD',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#717171',
    textAlign: 'center',
    lineHeight: 24,
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
    textAlign: 'center',
    flex: 1,
  },
  cancelButton: {
    color: '#007AFF',
    fontSize: 16,
    minWidth: 60,
  },
  cancelButtonText: {
    color: '#999999',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButtonHeader: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  acceptButtonHeaderText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  acceptButtonDisabled: {
    opacity: 0.5,
  },
  modalContent: {
    padding: 24,
    paddingTop: 32,
  },
  modalDescription: {
    fontSize: 14,
    color: '#717171',
    marginBottom: 8,
  },
  modalHint: {
    fontSize: 13,
    color: '#666666',
    fontStyle: 'italic',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  zoneGroup: {
    marginBottom: 24,
  },
  zoneGroupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 12,
  },
  checkboxDisabled: {
    backgroundColor: '#F0F0F0',
    borderColor: '#DDDDDD',
  },
  homeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  checkboxSquare: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#FF5A5F',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 12,
  },
  checkboxSquareChecked: {
    backgroundColor: '#FF5A5F',
    borderColor: '#FF5A5F',
  },
  homeOptionText: {
    fontSize: 16,
    color: '#222222',
    fontWeight: '600',
    marginBottom: 2,
    flexShrink: 1,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#DDDDDD',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    backgroundColor: '#FF5A5F',
    borderColor: '#FF5A5F',
  },
  homeInfo: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  homeAddress: {
    fontSize: 12,
    color: '#717171',
    marginTop: 2,
  },
  proximitySection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
  },
  proximityDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 12,
  },
  proximityInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  proximityInput: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    width: 100,
  },
  proximityUnit: {
    fontSize: 16,
    color: '#666666',
  },
  proximityHint: {
    fontSize: 12,
    color: '#999999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  radiusSelector: {
    marginTop: 16,
  },
  radiusSelectorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#222222',
    marginBottom: 8,
  },
  radiusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radiusButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#DDDDDD',
    minWidth: 60,
    alignItems: 'center',
  },
  radiusButtonSelected: {
    backgroundColor: '#FFF5F6',
    borderColor: '#FF5A5F',
  },
  radiusButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  radiusButtonTextSelected: {
    color: '#FF5A5F',
    fontWeight: '600',
  },
  modalFooter: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
  },
  footerNote: {
    fontSize: 14,
    color: '#717171',
    textAlign: 'center',
    lineHeight: 20,
  },
  pendingText: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 16,
  },
  friendMainContent: {
    flex: 1,
    flexDirection: 'column',
    minWidth: 0, // Prevents flex shrinking issues
  },
  friendTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  friendCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  friendInfo: {
    flex: 1,
    marginRight: 4,
  },
  friendNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  chevronIcon: {
    marginRight: 8,
  },
  chevronDown: {
    transform: [{rotate: '90deg'}],
  },
  zoneCountText: {
    fontSize: 13,
    color: '#717171',
    marginTop: 2,
  },
  zoneCount: {
    fontSize: 14,
    color: '#666666',
    fontWeight: 'normal',
  },
  locationText: {
    fontSize: 14,
    color: '#666666',
    fontWeight: 'normal',
  },
  locationTextStale: {
    color: '#999999',
    fontStyle: 'italic',
  },
  broadcastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  broadcastChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  broadcastText: {
    fontSize: 13,
    color: '#FF5A5F',
    flex: 1,
  },
  sharedZonesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E1E5E9',
    alignSelf: 'flex-start',
    flexWrap: 'wrap',
  },
  sharedZonesText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '500',
    flexShrink: 1,
  },
  // Nearby Friends styles
  nearbyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  nearbyCount: {
    backgroundColor: '#FF5A5F',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  nearbyFriendCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  nearbyFriendInfo: {
    flex: 1,
  },
  nearbyFriendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  nearbyFriendDistance: {
    fontSize: 14,
    color: '#FF5A5F',
    fontWeight: '500',
  },
  nearbyIndicator: {
    marginLeft: 12,
  },
  // Proximity Alert in accept modal
  proximityAlertSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#EBEBEB',
  },
  proximityAlertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 12,
  },
  proximityCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE0E0',
  },
  proximityCheckboxLabel: {
    flex: 1,
    marginLeft: 12,
  },
  proximityCheckboxText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222222',
    marginBottom: 4,
  },
  proximityCheckboxDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
  },
  // Swipe to delete styles
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    marginVertical: 8,
    borderRadius: 12,
  },
  deleteButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  // Pending zone invitation styles
  pendingZoneRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  pendingZoneText: {
    fontSize: 13,
    color: '#FF5A5F',
    fontWeight: '500',
    marginBottom: 6,
  },
  pendingZoneActions: {
    gap: 6,
  },
  pendingZoneButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  miniIgnoreButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    backgroundColor: '#FFFFFF',
  },
  miniAcceptButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#FF5A5F',
  },
  miniButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  miniPendingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  miniPendingText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#999999',
  },
  // New friend card styles
  friendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  zoneSection: {
    marginTop: 8,
    marginBottom: 4,
  },
  zoneSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 4,
    marginLeft: 8,
  },
  zoneItem: {
    paddingVertical: 1,
    marginLeft: 8,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneItemText: {
    fontSize: 14,
    color: '#333333',
    flex: 1,
    marginRight: 8,
  },
  sharingChips: {
    flexDirection: 'row',
    gap: 4,
  },
  chipColumn: {
    width: 60, // Fixed width to align chips
    alignItems: 'center',
  },
  chipSpacer: {
    height: 18, // Same height as chips to maintain alignment
    width: 60,
  },
  sharingChip: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sharingChipText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  receivingChip: {
    backgroundColor: '#34C759',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  receivingChipText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  connectedChip: {
    backgroundColor: '#34C759',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  connectedChipText: {
    fontSize: 11,
    color: 'white',
    fontWeight: '600',
  },
  pendingChip: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  pendingChipText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  cancelChip: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cancelChipText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  ignoreChip: {
    backgroundColor: '#8E8E93',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  ignoreChipText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  acceptChip: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  acceptChipText: {
    fontSize: 10,
    color: 'white',
    fontWeight: '500',
  },
  pendingZoneItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
    marginLeft: 8,
  },
  smallCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
  },
  smallCancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  incomingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  smallIgnoreButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  smallIgnoreButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  smallAcceptButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#34C759',
  },
  smallAcceptButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pendingRequestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pendingRequestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cancelAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
  },
  cancelAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pendingZonesList: {
    marginTop: 8,
    marginBottom: 8,
  },
  pendingZoneName: {
    fontSize: 14,
    color: '#333333',
    flex: 1,
  },
  cancelZoneButton: {
    padding: 4,
  },
  pendingStatusText: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '500',
    marginTop: 8,
  },
});