import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { logger } from '../utils/logger';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { checkUserExistsByPhone, subscribeToUserFriends, getUserData } from '../services/firebase';
import { auth } from '../../firebaseConfig';
import { Friend } from '../types';

interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phoneNumbers?: Array<{number?: string; digits?: string}>;
}

type SelectFriendsScreenRouteProp = RouteProp<RootStackParamList, 'SelectFriends'>;

export default function SelectFriendsScreen() {
  const navigation = useNavigation();
  const route = useRoute<SelectFriendsScreenRouteProp>();
  const preSelectedZoneId = route.params?.preSelectedZoneId;
  const [selectedTab, setSelectedTab] = useState<'zonefriends' | 'contacts' | 'manual'>('zonefriends');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [existingFriends, setExistingFriends] = useState<Friend[]>([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  
  // Manual entry state
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [phoneValidation, setPhoneValidation] = useState<{
    isChecking: boolean;
    exists: boolean;
  }>({ isChecking: false, exists: false });

  useEffect(() => {
    // Don't load contacts on mount - wait for user to click Contacts tab
    
    // Load existing friends for ZoneFriends tab
    const currentUser = auth.currentUser;
    if (currentUser) {
      const unsubscribe = subscribeToUserFriends(currentUser.uid, (friendsData) => {
        // Deduplicate friends by friendUserId or phoneNumber
        const uniqueFriendsMap = new Map<string, Friend>();
        friendsData.forEach(friend => {
          const key = friend.friendUserId || friend.phoneNumber;
          if (!uniqueFriendsMap.has(key)) {
            uniqueFriendsMap.set(key, friend);
          } else {
            // Merge shared zones if duplicate
            const existing = uniqueFriendsMap.get(key)!;
            const mergedSharedHomes = [...new Set([...(existing.sharedHomes || []), ...(friend.sharedHomes || [])])];
            uniqueFriendsMap.set(key, {
              ...existing,
              sharedHomes: mergedSharedHomes
            });
          }
        });
        setExistingFriends(Array.from(uniqueFriendsMap.values()));
      });
      return unsubscribe;
    }
  }, []);
  // Phone validation
  useEffect(() => {
    if (manualPhone) {
      const timeoutId = setTimeout(() => {
        validatePhoneNumber(manualPhone);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setPhoneValidation({ isChecking: false, exists: false });
    }
  }, [manualPhone]);

  const validatePhoneNumber = async (phoneNumber: string) => {
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 10 || (digits.length === 11 && digits[0] === '1')) {
      setPhoneValidation({ isChecking: true, exists: false });
      
      try {
        const result = await checkUserExistsByPhone(digits);
        setPhoneValidation({
          isChecking: false,
          exists: result.exists,
          userName: result.userData?.name
        });
      } catch (error) {
        logger.error('Error validating phone number:', error);
        setPhoneValidation({ isChecking: false, exists: false });
      }
    } else {
      setPhoneValidation({ isChecking: false, exists: false });
    }
  };

  const showContactsDebug = () => {
    Alert.alert(
      '📊 Contacts Debug Info',
      `Total Contacts Loaded: ${contacts.length}\n\n` +
      `Contacts with Phone: ${contacts.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0).length}\n\n` +
      `Favorites: ${contacts.filter(c => c.isFavorite).length}\n\n` +
      `${contacts.length > 200 ? '✅ All contacts loaded!' : '⚠️ Only 200 contacts loaded?'}`,
      [{ text: 'OK' }]
    );
  };

  const loadContacts = async () => {
    try {
      // Check current permission status first
      const { status: currentStatus } = await Contacts.getPermissionsAsync();
      
      // If permission was never asked, show our explainer first
      if (currentStatus === 'undetermined') {
        const userWantsToAllow = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Access Your Contacts?',
            'Do you want to allow FriendZone to see your Contacts list to add friends without entering their name and phone number?\n\n' +
            '✅ We only read names and phone numbers\n' +
            '✅ We never store your full contact list\n' +
            '✅ We never message anyone without your permission',
            [
              {
                text: 'No Thanks',
                style: 'cancel',
                onPress: () => resolve(false)
              },
              {
                text: 'Yes, Allow',
                onPress: () => resolve(true)
              }
            ]
          );
        });
        
        // If user said no, don't even show system dialog
        if (!userWantsToAllow) {
          logger.debug('User declined contacts access from our dialog');
          return;
        }
      }
      
      // User said yes (or already granted) - now request permission (system dialog will show)
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        // User denied in system dialog - show what they're missing
        Alert.alert(
          'Contacts Access Denied',
          'No problem! You can still invite friends manually by entering their phone number.\n\n' +
          'To enable contacts later, go to Settings > FriendZone > Contacts.',
          [{ text: 'OK' }]
        );
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.ContactType, // To identify favorites
        ],
        // Don't use API sort - we'll sort manually by last name
      });

      setContactsLoaded(true);

      const contactsWithPhones = data
        .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
        .map(contact => ({
          id: contact.id,
          name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
          firstName: contact.firstName,
          lastName: contact.lastName,
          phoneNumbers: contact.phoneNumbers,
          isFavorite: contact.contactType === Contacts.ContactTypes.Person && 
                     (contact as any).starred === true, // iOS favorites
        }));

      // Sort: Favorites first, then by last name, then first name
      const sortedContacts = contactsWithPhones.sort((a, b) => {
        // Favorites come first
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
        
        // Then sort by last name
        const lastNameA = (a.lastName || '').toLowerCase();
        const lastNameB = (b.lastName || '').toLowerCase();
        
        if (lastNameA !== lastNameB) {
          return lastNameA.localeCompare(lastNameB);
        }
        
        // If last names are the same, sort by first name
        const firstNameA = (a.firstName || '').toLowerCase();
        const firstNameB = (b.firstName || '').toLowerCase();
        return firstNameA.localeCompare(firstNameB);
      });

      setContacts(sortedContacts);
      logger.debug(`Loaded ${sortedContacts.length} contacts (${sortedContacts.filter(c => c.isFavorite).length} favorites)`);
    } catch (error) {
      logger.error('Error loading contacts:', error);
    }
  };

  // Smart contacts filtering - matches beginning of names
  const filteredContacts = React.useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    
    const query = searchQuery.toLowerCase().trim();
    return contacts.filter(contact => {
      const fullName = contact.name.toLowerCase();
      const firstName = contact.firstName?.toLowerCase() || '';
      const lastName = contact.lastName?.toLowerCase() || '';
      const nameWords = fullName.split(/\s+/);
      
      return fullName.startsWith(query) ||
             nameWords.some(word => word.startsWith(query)) ||
             firstName.startsWith(query) ||
             lastName.startsWith(query);
    });
  }, [contacts, searchQuery]);

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const formatPhoneNumber = (phoneNumber: string): string => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return phoneNumber;
  };

  const handleNext = () => {
    const selectedFriends = [];
    
    // Add selected existing friends (ZoneFriends)
    selectedContacts.forEach(contactId => {
      const friend = existingFriends.find(f => f.id === contactId);
      if (friend) {
        selectedFriends.push({
          name: friend.name,
          phoneNumber: friend.phoneNumber,
          source: 'zonefriend',
          existingSharedZones: friend.sharedHomes || []
        });
      }
    });
    
    // Add selected contacts
    selectedContacts.forEach(contactId => {
      const contact = contacts.find(c => c.id === contactId);
      if (contact && contact.phoneNumbers && contact.phoneNumbers.length > 0) {
        // Prefer mobile number
        const mobileNumber = contact.phoneNumbers.find(p => 
          (p as any).label?.toLowerCase().includes('mobile') || 
          (p as any).label?.toLowerCase().includes('cell') ||
          (p as any).label?.toLowerCase().includes('iphone')
        );
        const phoneToUse = mobileNumber || contact.phoneNumbers[0];
        
        selectedFriends.push({
          name: contact.name,
          phoneNumber: phoneToUse.number?.replace(/\D/g, '') || '',
          source: 'contact'
        });
      }
    });
    
    // Add manual entry if filled
    if (manualName.trim() && manualPhone.trim()) {
      selectedFriends.push({
        name: manualName.trim(),
        phoneNumber: manualPhone.replace(/\D/g, ''),
        source: 'manual'
      });
    }
    
    if (selectedFriends.length === 0) {
      Alert.alert('No Friends Selected', 'Please select at least one friend to invite.');
      return;
    }
    
    // Navigate to zone selection screen
    navigation.navigate('SelectZones', { selectedFriends, preSelectedZoneId });
  };

  const renderTabButton = (tab: 'zonefriends' | 'contacts' | 'manual', title: string) => (
    <TouchableOpacity
      style={[styles.tabButton, selectedTab === tab && styles.activeTabButton]}
      onPress={() => {
        setSelectedTab(tab);
        // Load contacts only when Contacts tab is clicked
        if (tab === 'contacts' && !contactsLoaded) {
          loadContacts();
          setContactsLoaded(true);
        }
      }}
    >
      <Text style={[styles.tabButtonText, selectedTab === tab && styles.activeTabButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderFriends = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Invite existing friends to new zones:
      </Text>

      {existingFriends.length > 0 ? (
        <ScrollView style={styles.contactsList}>
          {existingFriends.map(friend => (
            <TouchableOpacity
              key={friend.id}
              style={styles.contactItem}
              onPress={() => toggleContactSelection(friend.id)}
            >
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={[
                    styles.checkbox,
                    selectedContacts.includes(friend.id) && styles.checkboxSelected
                  ]}
                  onPress={() => toggleContactSelection(friend.id)}
                >
                  {selectedContacts.includes(friend.id) && (
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{friend.name}</Text>
                <Text style={styles.contactPhone}>
                  {formatPhoneNumber(friend.phoneNumber)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No existing friends found. Add some friends first to invite them to new zones.
          </Text>
        </View>
      )}
    </View>
  );

  const renderContacts = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Select friends from your contacts:
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
            style={styles.contactItem}
            onPress={() => toggleContactSelection(contact.id)}
          >
            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                style={[
                  styles.checkbox,
                  selectedContacts.includes(contact.id) && styles.checkboxSelected
                ]}
                onPress={() => toggleContactSelection(contact.id)}
              >
                {selectedContacts.includes(contact.id) && (
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactName}>{contact.name}</Text>
              {(() => {
                const phoneNumbers = contact.phoneNumbers || [];
                // Find mobile number first
                const mobileNumber = phoneNumbers.find(p => 
                  p.label?.toLowerCase().includes('mobile') || 
                  p.label?.toLowerCase().includes('cell') ||
                  p.label?.toLowerCase().includes('iphone')
                );
                
                if (mobileNumber) {
                  // Show only mobile number
                  return (
                    <Text style={styles.contactPhone}>
                      {formatPhoneNumber(mobileNumber.number || '')} (mobile)
                    </Text>
                  );
                } else if (phoneNumbers.length === 1) {
                  // Show single number without label
                  return (
                    <Text style={styles.contactPhone}>
                      {formatPhoneNumber(phoneNumbers[0].number || '')}
                    </Text>
                  );
                } else if (phoneNumbers.length > 1) {
                  // Show all numbers with labels
                  return (
                    <View>
                      {phoneNumbers.map((phone, idx) => (
                        <Text key={idx} style={styles.contactPhone}>
                          {formatPhoneNumber(phone.number || '')} {phone.label ? `(${phone.label.toLowerCase()})` : ''}
                        </Text>
                      ))}
                    </View>
                  );
                }
                return null;
              })()}
            </View>
          </TouchableOpacity>
        ))}
        
        {filteredContacts.length === 0 && contacts.length > 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No contacts found matching "{searchQuery}"</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderManualEntry = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Add a friend manually:
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Friend's Name"
        value={manualName}
        onChangeText={setManualName}
        autoCapitalize="words"
        returnKeyType="next"
      />

      <View>
        <TextInput
          style={[
            styles.input,
            phoneValidation.exists && styles.inputSuccess,
            phoneValidation.isChecking && styles.inputChecking
          ]}
          placeholder="Phone Number (e.g., 555-123-4567)"
          value={formatPhoneNumber(manualPhone)}
          onChangeText={(text) => {
            const digits = text.replace(/\D/g, '');
            setManualPhone(digits);
          }}
          keyboardType="phone-pad"
          returnKeyType="done"
        />
        
        {phoneValidation.isChecking && (
          <View style={styles.validationStatus}>
            <Text style={styles.validationText}>Checking...</Text>
          </View>
        )}
        
        {!phoneValidation.isChecking && phoneValidation.exists && phoneValidation.userName && (
          <View style={styles.validationStatus}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <Text style={styles.validationTextSuccess}>
              ✅ {phoneValidation.userName} is on FriendZone!
            </Text>
          </View>
        )}
        
        {!phoneValidation.isChecking && manualPhone.replace(/\D/g, '').length >= 10 && !phoneValidation.exists && (
          <View style={styles.validationStatus}>
            <Ionicons name="information-circle" size={16} color="#FF9800" />
            <Text style={styles.validationTextInfo}>
              This person isn't on FriendZone yet. We'll send them an SMS invitation.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Select Friends</Text>
          <TouchableOpacity onPress={handleNext}>
            <Text style={styles.nextButton}>Next</Text>
          </TouchableOpacity>
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
    fontWeight: '600',
    color: '#222222',
  },
  cancelButton: {
    fontSize: 16,
    color: '#666666',
  },
  nextButton: {
    fontSize: 17,
    color: '#FF5A5F',
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: '#FF5A5F',
  },
  tabButtonText: {
    fontSize: 16,
    color: '#666666',
    fontWeight: '500',
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
    color: '#666666',
    marginBottom: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
    marginBottom: 16,
  },
  contactsList: {
    flex: 1,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DDD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxSelected: {
    backgroundColor: '#FF5A5F',
    borderColor: '#FF5A5F',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222222',
    marginBottom: 4,
  },
  contactPhone: {
    fontSize: 14,
    color: '#666666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFF',
    marginBottom: 16,
  },
  inputSuccess: {
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  inputChecking: {
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  validationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  validationText: {
    fontSize: 14,
    color: '#2196F3',
    marginLeft: 4,
  },
  validationTextSuccess: {
    fontSize: 14,
    color: '#4CAF50',
    marginLeft: 4,
    fontWeight: '500',
  },
  validationTextInfo: {
    fontSize: 14,
    color: '#FF9800',
    marginLeft: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
  },
});
