import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {RootStackParamList, Home} from '../types';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { sendFriendRequest, getUserData, subscribeToUserHomes, subscribeToUserFriends, updateFriendSharedHomes } from '../services/firebase';
import { auth } from '../../firebaseConfig';

// Smart friend sorting based on recent interactions
const sortFriendsByRelevance = async (friends: any[]): Promise<any[]> => {
  try {
    // Get recent friend interactions from AsyncStorage
    const recentInteractions = await AsyncStorage.getItem('recentFriendInteractions');
    const interactions = recentInteractions ? JSON.parse(recentInteractions) : {};
    
    return friends.sort((a, b) => {
      let aScore = 0;
      let bScore = 0;
      
      // 1. Recent zone invitations (highest priority)
      const aRecentInvites = interactions[a.friendUserId]?.invites || 0;
      const bRecentInvites = interactions[b.friendUserId]?.invites || 0;
      aScore += aRecentInvites * 1000;
      bScore += bRecentInvites * 1000;
      
      // 2. Recent friend request acceptance
      const aRecentAccept = interactions[a.friendUserId]?.lastAccepted || 0;
      const bRecentAccept = interactions[b.friendUserId]?.lastAccepted || 0;
      const now = Date.now();
      const daysSinceA = (now - aRecentAccept) / (1000 * 60 * 60 * 24);
      const daysSinceB = (now - bRecentAccept) / (1000 * 60 * 60 * 24);
      aScore += Math.max(0, 500 - daysSinceA * 10); // Decay over time
      bScore += Math.max(0, 500 - daysSinceB * 10);
      
      // 3. Frequency of interactions (total invites over time)
      const aTotalInvites = interactions[a.friendUserId]?.totalInvites || 0;
      const bTotalInvites = interactions[b.friendUserId]?.totalInvites || 0;
      aScore += aTotalInvites * 100;
      bScore += bTotalInvites * 100;
      
      // 4. Currently in shared zones (active friends)
      const aSharedZones = a.sharedHomes?.length || 0;
      const bSharedZones = b.sharedHomes?.length || 0;
      aScore += aSharedZones * 200;
      bScore += bSharedZones * 200;
      
      // 5. Alphabetical as tiebreaker
      if (Math.abs(aScore - bScore) < 50) {
        return a.name.localeCompare(b.name);
      }
      
      return bScore - aScore; // Higher score first
    });
  } catch (error) {
    logger.error('Error sorting friends by relevance:', error);
    // Fallback to alphabetical sorting
    return friends.sort((a, b) => a.name.localeCompare(b.name));
  }
};

// Track friend interactions for smart sorting
const trackFriendInteraction = async (friendUserId: string, type: 'invite' | 'accept') => {
  try {
    const key = 'recentFriendInteractions';
    const existing = await AsyncStorage.getItem(key);
    const interactions = existing ? JSON.parse(existing) : {};
    
    if (!interactions[friendUserId]) {
      interactions[friendUserId] = {
        invites: 0,
        totalInvites: 0,
        lastAccepted: 0
      };
    }
    
    if (type === 'invite') {
      interactions[friendUserId].invites += 1;
      interactions[friendUserId].totalInvites += 1;
    } else if (type === 'accept') {
      interactions[friendUserId].lastAccepted = Date.now();
    }
    
    await AsyncStorage.setItem(key, JSON.stringify(interactions));
  } catch (error) {
    logger.error('Error tracking friend interaction:', error);
  }
};

interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phoneNumbers?: Array<{number?: string; digits?: string}>;
}

type AddFriendsScreenRouteProp = RouteProp<RootStackParamList, 'AddFriends'>;

export default function AddFriendsScreen() {
  const route = useRoute<AddFriendsScreenRouteProp>();
  const navigation = useNavigation();
  const {homeId} = route.params || {};

  // Contact selection state
  const [selectedTab, setSelectedTab] = useState<'zonefriends' | 'contacts' | 'manual'>('zonefriends');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [existingFriends, setExistingFriends] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  
  // Zone selection modal state
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<any | null>(null);
  const [selectedManualContact, setSelectedManualContact] = useState<{name: string, phone: string} | null>(null);
  const [homes, setHomes] = useState<Home[]>([]);
  const [selectedHomeIds, setSelectedHomeIds] = useState<string[]>([]);

  useEffect(() => {
    loadContacts();
    loadHomes();
    loadFriends();
  }, [homeId]);

  const loadContacts = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Homer needs access to your contacts to help you find friends.',
          [{ text: 'OK' }]
        );
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      const contactsWithPhones: Contact[] = data
        .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map(contact => ({
          id: contact.id,
          name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
          firstName: contact.firstName,
          lastName: contact.lastName,
          phoneNumbers: contact.phoneNumbers,
        }))
        .slice(0, 200);

      setContacts(contactsWithPhones);
      logger.debug(`Loaded ${contactsWithPhones.length} contacts`);
    } catch (error) {
      logger.error('Error loading contacts:', error);
      Alert.alert('Error', 'Unable to load contacts. Please try again.');
    }
  };

  const loadHomes = () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const unsubscribe = subscribeToUserHomes(currentUser.uid, (homesData) => {
        // Deduplicate homes
        const uniqueHomes = homesData.filter((home, index, array) => {
          return array.findIndex(h => 
            h.name === home.name && 
            h.location.address === home.location.address
          ) === index;
        });
        
        setHomes(uniqueHomes);
        
        // Pre-select home if coming from specific zone
        if (homeId && uniqueHomes.some(h => h.id === homeId)) {
          setSelectedHomeIds([homeId]);
        }
      });
      
      return unsubscribe;
    }
  };

  const loadFriends = () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const unsubscribe = subscribeToUserFriends(currentUser.uid, async (friendsData) => {
        // Filter connected friends and consolidate duplicates
        const connectedFriends = friendsData.filter(f => f.status === 'connected');
        const consolidatedFriends = consolidateFriends(connectedFriends);
        
        // Apply smart sorting based on recent interactions
        const smartSortedFriends = await sortFriendsByRelevance(consolidatedFriends);
        setExistingFriends(smartSortedFriends);
      });
      
      return unsubscribe;
    }
  };

  // Consolidate duplicate friends by friendUserId
  const consolidateFriends = (friendsData: any[]): any[] => {
    const friendsMap = new Map<string, any>();
    
    friendsData.forEach(friend => {
      const key = friend.friendUserId || friend.phoneNumber;
      
      if (friendsMap.has(key)) {
        const existingFriend = friendsMap.get(key)!;
        const combinedHomes = [...new Set([...existingFriend.sharedHomes, ...friend.sharedHomes])];
        friendsMap.set(key, {
          ...existingFriend,
          sharedHomes: combinedHomes,
          lastSeen: Math.max(friend.lastSeen || 0, existingFriend.lastSeen || 0),
        });
      } else {
        friendsMap.set(key, friend);
      }
    });
    
    return Array.from(friendsMap.values());
  };

  // Handle contact selection - opens zone modal
  const handleContactSelect = (contact: Contact) => {
    setSelectedContact(contact);
    setSelectedFriend(null);
    setSelectedManualContact(null);
    setShowZoneModal(true);
  };

  // Handle friend selection - opens zone modal
  const handleFriendSelect = async (friend: any) => {
    setSelectedFriend(friend);
    setSelectedContact(null);
    setSelectedManualContact(null);
    setShowZoneModal(true);
    
    // Track friend interaction for smart sorting
    await trackFriendInteraction(friend.friendUserId, 'invite');
  };

  // Handle manual contact - opens zone modal
  const handleManualContactNext = () => {
    if (!manualName.trim() || !manualPhone.trim()) {
      Alert.alert('Missing Information', 'Please enter both name and phone number.');
      return;
    }
    
    setSelectedManualContact({
      name: manualName.trim(),
      phone: manualPhone.trim()
    });
    setSelectedContact(null);
    setShowZoneModal(true);
  };

  // Send invitation with selected zones
  const handleSendInvitation = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'You must be signed in to send invitations.');
      return;
    }

    // Zone selection is now optional - users can connect without sharing zones initially

    try {
      const userData = await getUserData(currentUser.uid);
      if (!userData) {
        Alert.alert('Error', 'User data not found. Please restart the app.');
        return;
      }

      const contactName = selectedContact?.name || selectedFriend?.name || selectedManualContact?.name || '';
      const phoneNumber = selectedContact?.phoneNumbers?.[0]?.number || 
                         selectedContact?.phoneNumbers?.[0]?.digits || 
                         selectedFriend?.phoneNumber ||
                         selectedManualContact?.phone || '';

      if (!phoneNumber) {
        Alert.alert('Error', 'No phone number found for this contact.');
        return;
      }

      // Check if this is an existing friend (ZoneFriends tab) or new contact
      if (selectedFriend) {
        // Existing friend - update shared zones
        await updateFriendSharedHomes(
          currentUser.uid,
          selectedFriend.friendUserId,
          selectedHomeIds
        );

        Alert.alert(
          'Zones Updated!',
          `${contactName} now has access to the selected zones.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setShowZoneModal(false);
                navigation.goBack();
              },
            },
          ]
        );
      } else {
        // New contact - send friend request and SMS invitation
        // Normalize phone number: remove all non-digits, then remove leading 1 if present
        let cleanPhone = phoneNumber.replace(/\D/g, '');
        if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
          cleanPhone = cleanPhone.slice(1); // Remove leading 1 to get 10 digits
        }
        
        await sendFriendRequest(
          currentUser.uid,
          cleanPhone, // Now guaranteed to be 10 digits
          userData.name,
          selectedHomeIds
        );

        // Send SMS with App Store link
        const smsMessage = `Hi ${contactName}! ${userData.name} invited you to join Homer - a location sharing app for friends and family. Download it here: https://apps.apple.com/app/homer`;
        const smsUrl = `sms:${cleanPhone}&body=${encodeURIComponent(smsMessage)}`;

        Alert.alert(
          'Send SMS Invitation?',
          `Would you like to send an SMS to ${contactName} with a link to download Homer?`,
          [
            {
              text: 'Skip SMS',
              style: 'cancel',
              onPress: () => {
                setShowZoneModal(false);
                navigation.goBack();
              },
            },
            {
              text: 'Send SMS',
              onPress: async () => {
                try {
                  const { Linking } = require('react-native');
                  const canOpen = await Linking.canOpenURL(smsUrl);
                  if (canOpen) {
                    await Linking.openURL(smsUrl);
                  } else {
                    Alert.alert(
                      'SMS Not Available',
                      `SMS not available on this device. The friend request has been sent and will be active when ${contactName} downloads Homer.`
                    );
                  }
                } catch (error) {
                  logger.error('Error opening SMS:', error);
                  Alert.alert(
                    'SMS Error',
                    `Could not open SMS app. The friend request has been sent and will be active when ${contactName} downloads Homer.`
                  );
                }
                setShowZoneModal(false);
                navigation.goBack();
              },
            },
          ]
        );
      }

    } catch (error: any) {
      logger.error('Error sending invitation:', error);
      Alert.alert('Error', error.message || 'Failed to send invitation.');
    }
  };

  // Filter contacts based on search
  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase().trim();
    const name = contact.name.toLowerCase();
    const firstName = contact.firstName?.toLowerCase() || '';
    const lastName = contact.lastName?.toLowerCase() || '';
    
    const nameMatch = name.includes(query) ||
                     firstName.includes(query) ||
                     lastName.includes(query);
    
    const phoneMatch = contact.phoneNumbers?.some(phone => 
      phone.number?.replace(/\D/g, '').includes(query.replace(/\D/g, '')) ||
      phone.digits?.includes(query.replace(/\D/g, ''))
    );
    
    return nameMatch || phoneMatch;
  });

  const formatPhoneNumber = (phoneNumber: string): string => {
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phoneNumber;
  };

  const toggleHomeSelection = (homeId: string) => {
    setSelectedHomeIds(prev =>
      prev.includes(homeId)
        ? prev.filter(id => id !== homeId)
        : [...prev, homeId]
    );
  };

  const renderTabButton = (tab: 'zonefriends' | 'contacts' | 'manual', title: string) => (
    <TouchableOpacity
      style={[styles.tabButton, selectedTab === tab && styles.activeTabButton]}
      onPress={() => setSelectedTab(tab)}
    >
      <Text style={[styles.tabButtonText, selectedTab === tab && styles.activeTabButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderFriends = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Your most active friends (sorted by recent interactions):
      </Text>

      <ScrollView style={styles.contactsList}>
        {existingFriends.map(friend => (
          <TouchableOpacity
            key={friend.id}
            style={styles.contactOption}
            onPress={() => handleFriendSelect(friend)}
          >
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{friend.name}</Text>
              <Text style={styles.contactPhone}>
                {formatPhoneNumber(friend.phoneNumber)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#717171" />
          </TouchableOpacity>
        ))}
        
        {existingFriends.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No existing friends found. Invite friends from contacts or manually to connect in zones.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderContacts = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Search and select a contact to invite:
      </Text>

      <TextInput
        style={styles.searchInput}
        placeholder="Search contacts..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
        autoCapitalize="none"
      />

      <ScrollView style={styles.contactsList}>
        {filteredContacts.map(contact => (
          <TouchableOpacity
            key={contact.id}
            style={styles.contactOption}
            onPress={() => handleContactSelect(contact)}
          >
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <Text style={styles.contactPhone}>
                {formatPhoneNumber(contact.phoneNumbers?.[0]?.number || contact.phoneNumbers?.[0]?.digits || 'No phone')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#717171" />
          </TouchableOpacity>
        ))}
        
        {filteredContacts.length === 0 && contacts.length > 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No contacts found matching "{searchQuery}"</Text>
          </View>
        )}
        
        {contacts.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No contacts with phone numbers found.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderManualEntry = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Enter friend details manually:
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Friend's Name"
        value={manualName}
        onChangeText={setManualName}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <TextInput
        style={styles.input}
        placeholder="Phone Number (e.g., 555-123-4567)"
        value={formatPhoneNumber(manualPhone)}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '');
          setManualPhone(digits);
        }}
        keyboardType="phone-pad"
        returnKeyType="done"
      />

      <TouchableOpacity
        style={[styles.nextButton, (!manualName.trim() || !manualPhone.trim()) && styles.nextButtonDisabled]}
        onPress={handleManualContactNext}
        disabled={!manualName.trim() || !manualPhone.trim()}
      >
        <Text style={[styles.nextButtonText, (!manualName.trim() || !manualPhone.trim()) && styles.nextButtonTextDisabled]}>
          Next: Select Zones
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderZoneModal = () => (
    <Modal
      visible={showZoneModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowZoneModal(false)}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Select Zones</Text>
          <TouchableOpacity onPress={handleSendInvitation}>
            <Text style={styles.sendButton}>{selectedFriend ? 'Update' : 'Send'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          <Text style={styles.inviteText}>
            {selectedFriend ? 'Update zones for:' : 'Inviting:'} {selectedContact?.name || selectedFriend?.name || selectedManualContact?.name}
          </Text>
          <Text style={styles.phoneText}>
            {formatPhoneNumber(
              selectedContact?.phoneNumbers?.[0]?.number || 
              selectedContact?.phoneNumbers?.[0]?.digits || 
              selectedFriend?.phoneNumber ||
              selectedManualContact?.phone || ''
            )}
          </Text>

          <Text style={styles.zoneSelectionTitle}>Select zones to share (optional):</Text>
          
          <ScrollView style={styles.zoneList}>
            {homes.map(home => (
              <TouchableOpacity
                key={home.id}
                style={styles.zoneOption}
                onPress={() => toggleHomeSelection(home.id)}
              >
                <View style={styles.checkboxContainer}>
                  <View style={[
                    styles.checkbox,
                    selectedHomeIds.includes(home.id) && styles.checkboxSelected
                  ]}>
                    {selectedHomeIds.includes(home.id) && (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </View>
                </View>
                <View style={styles.zoneInfo}>
                  <Text style={styles.zoneName}>{home.name}</Text>
                  <Text style={styles.zoneAddress}>{home.location.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Invite to Zone</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.tabContainer}>
          {renderTabButton('zonefriends', 'Friends')}
          {renderTabButton('contacts', 'Contacts')}
          {renderTabButton('manual', 'Manual')}
        </View>

        <View style={styles.content}>
          {selectedTab === 'zonefriends' && renderFriends()}
          {selectedTab === 'contacts' && renderContacts()}
          {selectedTab === 'manual' && renderManualEntry()}
        </View>
      </KeyboardAvoidingView>

      {renderZoneModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  keyboardAvoidingView: {
    flex: 1,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
  },
  cancelButton: {
    color: '#717171',
    fontSize: 16,
  },
  placeholder: {
    width: 50,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  activeTabButton: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF5A5F',
  },
  tabButtonText: {
    fontSize: 14,
    color: '#717171',
  },
  activeTabButtonText: {
    color: '#FF5A5F',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    padding: 24,
  },
  tabDescription: {
    fontSize: 16,
    color: '#222222',
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    marginBottom: 16,
  },
  contactsList: {
    flex: 1,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 2,
  },
  contactPhone: {
    fontSize: 14,
    color: '#717171',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    marginBottom: 16,
  },
  nextButton: {
    backgroundColor: '#FF5A5F',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  nextButtonDisabled: {
    backgroundColor: '#DDDDDD',
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  nextButtonTextDisabled: {
    color: '#999999',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#717171',
    textAlign: 'center',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
  },
  sendButton: {
    color: '#FF5A5F',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  inviteText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  phoneText: {
    fontSize: 16,
    color: '#717171',
    marginBottom: 24,
  },
  zoneSelectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 16,
  },
  zoneList: {
    flex: 1,
  },
  zoneOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderWidth: 2,
    borderColor: '#DDDDDD',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    backgroundColor: '#FF5A5F',
    borderColor: '#FF5A5F',
  },
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 2,
  },
  zoneAddress: {
    fontSize: 14,
    color: '#717171',
  },
});
