import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import {RouteProp, useRoute, useNavigation} from '@react-navigation/native';
import {RootStackParamList, Friend, Home} from '../types';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';
import { sendFriendRequest, getUserData, subscribeToUserHomes, subscribeToUserFriends, checkUserExistsByPhone } from '../services/firebase';
import { auth } from '../../firebaseConfig';
import { formatPhoneForDisplay } from '../components/PhoneNumberInput';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Smart contact sorting based on relevance
const sortContactsByRelevance = (contacts: Contact[]): Contact[] => {
  return contacts.sort((a, b) => {
    // Priority factors (higher = more relevant)
    let aScore = 0;
    let bScore = 0;
    
    // 1. Multiple phone numbers (indicates more active contact)
    const aPhoneCount = a.phoneNumbers?.length || 0;
    const bPhoneCount = b.phoneNumbers?.length || 0;
    aScore += aPhoneCount * 100;
    bScore += bPhoneCount * 100;
    
    // 2. Has both first and last name (more complete contact)
    const aHasFullName = !!(a.firstName && a.lastName);
    const bHasFullName = !!(b.firstName && b.lastName);
    if (aHasFullName) aScore += 50;
    if (bHasFullName) bScore += 50;
    
    // 3. Recently modified contacts (iOS provides this)
    const aModified = a.modificationDate ? new Date(a.modificationDate).getTime() : 0;
    const bModified = b.modificationDate ? new Date(b.modificationDate).getTime() : 0;
    aScore += Math.min(aModified / 1000000, 200); // Cap at 200 points
    bScore += Math.min(bModified / 1000000, 200);
    
    // 4. Alphabetical as tiebreaker
    if (Math.abs(aScore - bScore) < 10) {
      const aName = a.lastName || a.firstName || '';
      const bName = b.lastName || b.firstName || '';
      return aName.localeCompare(bName);
    }
    
    return bScore - aScore;
  });
};

// Track contact selections for future relevance
const trackContactSelection = async (contactPhone: string) => {
  try {
    const key = 'recentContactSelections';
    const existing = await AsyncStorage.getItem(key);
    const selections = existing ? JSON.parse(existing) : [];
    
    // Add new selection, limit to last 50
    const newSelections = [
      { phone: contactPhone, timestamp: Date.now() },
      ...selections.filter((s: any) => s.phone !== contactPhone)
    ].slice(0, 50);
    
    await AsyncStorage.setItem(key, JSON.stringify(newSelections));
  } catch (error) {
    logger.error('Error tracking contact selection:', error);
  }
};

// Get recently selected contacts for prioritization
const getRecentContactSelections = async (): Promise<string[]> => {
  try {
    const key = 'recentContactSelections';
    const existing = await AsyncStorage.getItem(key);
    if (!existing) return [];
    
    const selections = JSON.parse(existing);
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    return selections
      .filter((s: any) => s.timestamp > oneWeekAgo)
      .map((s: any) => s.phone);
  } catch (error) {
    logger.error('Error getting recent selections:', error);
    return [];
  }
};

// Real contacts interface using Expo Contacts
interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phoneNumbers?: Array<{number?: string; digits?: string}>;
};

type AddFriendsScreenRouteProp = RouteProp<RootStackParamList, 'AddFriends'>;

export default function AddFriendsScreen() {
  const navigation = useNavigation();
  const route = useRoute<AddFriendsScreenRouteProp>();
  
  // UI State
  type TabType = 'friends' | 'allContacts' | 'manual';
  const [selectedTab, setSelectedTab] = useState<TabType>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Contacts State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [smartContacts, setSmartContacts] = useState<Contact[]>([]); // Smart-sorted contacts for Friends tab
  const [filteredContactsState, setFilteredContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Array<string | Contact>>([]);
  
  // Manual Entry State
  const [manualPhone, setManualPhone] = useState('');
  const [manualName, setManualName] = useState('');
  
  // Friends & Homes State
  const [existingFriends, setExistingFriends] = useState<Friend[]>([]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [selectedHomeIds, setSelectedHomeIds] = useState<string[]>([]);
  
  // Phone Validation State
  const [phoneValidation, setPhoneValidation] = useState<{
    isChecking: boolean;
    exists: boolean;
    userName?: string;
  }>({ isChecking: false, exists: false });

  // Get homeId from route params if it exists
  const homeId = route.params?.homeId as string | undefined;

  useEffect(() => {
    const loadData = async () => {
      await loadContacts();
    };
    loadData();
    
    // Load user's homes and friends
    const currentUser = auth.currentUser;
    if (currentUser) {
      const unsubscribeHomes = subscribeToUserHomes(currentUser.uid, (homesData: Home[]) => {
        logger.debug('AddFriendsScreen: Received homes data:', homesData);
        logger.debug('Current user ID:', currentUser.uid);
        
        // Deduplicate homes by name and location to prevent multiple Stowe entries
        const uniqueHomes = homesData.filter((home, index, array) => {
          return array.findIndex(h => 
            h.name === home.name && 
            h.location?.address === home.location?.address
          ) === index;
        });
        
        logger.debug('AddFriendsScreen: Deduplicated homes:', uniqueHomes.length, 'from', homesData.length);
        setHomes(uniqueHomes);
        
        // If coming from a specific home, pre-select it
        if (homeId && uniqueHomes.some(h => h.id === homeId)) {
          setSelectedHomeIds([homeId]);
        }
      });

      // Load existing friends to show in ZoneFriends tab
      const unsubscribeFriends = subscribeToUserFriends(currentUser.uid, (friendsData) => {
        logger.debug('👥 AddFriendsScreen: Received friends data:', friendsData.length, 'friends');
        friendsData.forEach((f, i) => {
          logger.debug(`  ${i + 1}. ${f.name} (friendUserId: ${f.friendUserId}, id: ${f.id})`);
        });
        
        // Consolidate duplicate friends before setting state
        const consolidatedFriends = consolidateFriends(friendsData);
        logger.debug('✅ AddFriendsScreen: Consolidated to', consolidatedFriends.length, 'friends');
        consolidatedFriends.forEach((f, i) => {
          logger.debug(`  ${i + 1}. ${f.name} (friendUserId: ${f.friendUserId}, sharedHomes: ${f.sharedHomes.length})`);
        });
        
        setExistingFriends(consolidatedFriends);
      });

      return () => {
        unsubscribeHomes();
        unsubscribeFriends();
      };
    }
  }, [homeId]);

  // Check if phone number belongs to existing FriendZone user
  const validatePhoneNumber = async (phoneNumber: string) => {
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Only check if we have a complete phone number (10 or 11 digits)
    if (digits.length === 10 || (digits.length === 11 && digits[0] === '1')) {
      setPhoneValidation({ isChecking: true, exists: false });
      
      try {
        // Pass the original phone number (with formatting) to checkUserExistsByPhone
        // The function will format it internally to match stored format
        logger.debug('🔍 Validating phone number');
        const result = await checkUserExistsByPhone(phoneNumber);
        logger.debug('✅ Validation result:', result.exists ? 'User exists' : 'User not found');
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
      // Reset validation if phone number is incomplete
      setPhoneValidation({ isChecking: false, exists: false });
    }
  };

  // Validate phone number when it changes
  useEffect(() => {
    if (manualPhone) {
      const timeoutId = setTimeout(() => {
        validatePhoneNumber(manualPhone);
      }, 500); // Debounce for 500ms
      
      return () => clearTimeout(timeoutId);
    }
  }, [manualPhone]);

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
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'FriendZone needs access to your contacts to help you find friends. Please enable contacts permission in Settings.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Show loading state
      setIsLoading(true);
      logger.debug('📱 Starting to load contacts...');

      // Load ALL contacts - remove pageSize to get all contacts
      logger.debug('📱 Loading ALL contacts from device...');
      
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers
        ],
        // Don't use pageSize or sort - load everything and sort manually
      });

      logger.debug(`📱 Retrieved ${data.length} total contacts from device`);

      // Filter and map contacts
      const validContacts = data
        .filter(contact => 
          contact.phoneNumbers && contact.phoneNumbers.length > 0 &&
          (contact.name || contact.firstName || contact.lastName) &&
          // Ensure we have at least one valid phone number
          contact.phoneNumbers.some(pn => pn.number && pn.number.trim().length > 5)
        )
        .map(contact => {
          const firstName = contact.firstName || '';
          const lastName = contact.lastName || '';
          // Display as "Last, First" format
          let fullName: string;
          if (lastName && firstName) {
            fullName = `${lastName}, ${firstName}`;
          } else if (lastName) {
            fullName = lastName;
          } else if (firstName) {
            fullName = firstName;
          } else {
            fullName = contact.name || 'Unknown';
          }
          
          return {
            id: contact.id,
            name: fullName,
            firstName,
            lastName,
            phoneNumbers: contact.phoneNumbers,
          };
        });

      logger.debug(`📱 Filtered to ${validContacts.length} valid contacts with phone numbers`);

      // Sort all contacts by last name, then first name
      logger.debug('🔍 Sorting contacts by last name...');
      validContacts.sort((a: Contact, b: Contact) => {
        try {
          const aLast = (a.lastName || '').toLowerCase();
          const bLast = (b.lastName || '').toLowerCase();
          const aFirst = (a.firstName || '').toLowerCase();
          const bFirst = (b.firstName || '').toLowerCase();
          
          // Contacts without last names go to the end
          if (!aLast && bLast) return 1;
          if (aLast && !bLast) return -1;
          if (!aLast && !bLast) return aFirst.localeCompare(bFirst);
          
          // Sort by last name, then first name
          if (aLast !== bLast) return aLast.localeCompare(bLast);
          return aFirst.localeCompare(bFirst);
        } catch (error) {
          logger.error('Sort error:', error);
          return 0;
        }
      });

      // Create smart-sorted contacts for Friends tab
      const smartSortedContacts = sortContactsByRelevance([...validContacts]);
      
      // Update state with sorted contacts
      setContacts(validContacts); // Alphabetically sorted for "All Contacts" tab
      setSmartContacts(smartSortedContacts); // Smart-sorted for "Friends" tab
      setFilteredContacts(validContacts);
      
      logger.debug(`✅ Successfully loaded ${validContacts.length} contacts (alphabetical) and ${smartSortedContacts.length} smart-sorted contacts`);
      
      // Log first 10 contacts to verify sorting
      if (validContacts.length > 0) {
        logger.debug('📋 First 10 contacts after sorting:');
        validContacts.slice(0, 10).forEach((c: Contact, i: number) => {
          logger.debug(`  ${i + 1}. ${c.lastName || 'No Last Name'}, ${c.firstName || 'No First Name'}`);
        });
      }
    } catch (error) {
      logger.error('Error loading contacts:', error);
      Alert.alert('Error', 'Unable to load contacts. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const showContactsDebug = () => {
    Alert.alert(
      '📊 Contacts Debug Info',
      `Total Contacts Loaded: ${contacts.length}\n\n` +
      `Contacts with Phone: ${contacts.filter(c => c.phoneNumbers && c.phoneNumbers.length > 0).length}\n\n` +
      `Currently Filtered: ${filteredContacts.length}\n\n` +
      `Search Query: "${searchQuery}"\n\n` +
      `${contacts.length > 200 ? '✅ All contacts loaded!' : '⚠️ Only 200 contacts loaded?'}`,
      [{ text: 'OK' }]
    );
  };

  const handleSendInvitations = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'You must be signed in to send invitations.');
      return;
    }

    try {
      // Get current user data
      const userData = await getUserData(currentUser.uid);
      if (!userData) {
        Alert.alert(
          'User Data Missing', 
          'Your user profile was not found. This can happen if the database was recently cleared. Please sign out and sign back in to recreate your profile.',
          [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]
        );
        return;
      }

      // Ensure we have a valid name with robust fallback
      let fromUserName = 'FriendZone User'; // Default fallback
      
      if (userData && userData.name && userData.name.trim()) {
        fromUserName = userData.name.trim();
      } else if (currentUser.email) {
        const emailPrefix = currentUser.email.split('@')[0];
        if (emailPrefix && emailPrefix.trim()) {
          fromUserName = emailPrefix.trim();
        }
      }
      
      logger.debug('👤 User data retrieved:', {
        userDataExists: !!userData,
        userDataName: userData?.name || 'UNDEFINED',
        userDataNameTrimmed: userData?.name?.trim() || 'UNDEFINED',
        currentUserEmail: currentUser.email || 'UNDEFINED',
        emailPrefix: currentUser.email?.split('@')[0] || 'UNDEFINED',
        finalFromUserName: fromUserName,
        currentUserId: currentUser.uid
      });

      // Final validation
      if (!fromUserName || fromUserName.trim() === '') {
        fromUserName = 'FriendZone User';
        logger.debug('⚠️ Using final fallback name:', fromUserName);
      }

      let phoneNumbers: string[] = [];
      let successCount = 0;
      let errorMessages: string[] = [];

      // Collect phone numbers based on selected tab
      if (selectedTab === 'home') {
        // For ZoneFriends, we need to handle friends without phone numbers
        const friendsWithoutPhone: string[] = [];
        
        phoneNumbers = selectedContacts.map(contactId => {
          const friend = existingFriends.find((f: Friend) => f.id === contactId);
          logger.debug('📱 ZoneFriend phone:', { 
            contactId, 
            friendName: friend?.name,
            phoneNumber: friend?.phoneNumber,
            friendUserId: friend?.friendUserId 
          });
          
          if (!friend?.phoneNumber || friend.phoneNumber.trim() === '') {
            friendsWithoutPhone.push(friend?.name || 'Unknown');
          }
          
          return friend?.phoneNumber || '';
        }).filter(phone => phone && phone.trim() !== '');
        
        // Alert user if some friends don't have phone numbers
        if (friendsWithoutPhone.length > 0) {
          Alert.alert(
            'Missing Phone Numbers',
            `The following friends don't have phone numbers stored: ${friendsWithoutPhone.join(', ')}. They cannot be invited to new zones.`
          );
          return;
        }
      } else if (selectedTab === 'contacts') {
        phoneNumbers = selectedContacts.map(contactId => {
          const contact = contacts.find(c => c.id === contactId);
          const phoneNumber = getFirstValidPhoneNumber(contact) || '';
          return phoneNumber;
        }).filter(phone => phone && phone.trim() !== '');
      } else if (selectedTab === 'manual' && manualName && manualPhone) {
        logger.debug('📱 Manual phone:', { manualName, manualPhone });
        phoneNumbers = [manualPhone];
      }

      logger.debug('📋 Collected phone numbers count:', phoneNumbers.length);

      if (phoneNumbers.length === 0) {
        Alert.alert('No Selection', 'Please select friends to invite or enter a phone number.');
        return;
      }

      // Validate all phone numbers are not empty
      const invalidPhones = phoneNumbers.filter(phone => !phone || phone.trim() === '');
      if (invalidPhones.length > 0) {
        Alert.alert('Invalid Phone Numbers', 'Some selected contacts do not have valid phone numbers.');
        return;
      }

      // Zone selection is now optional - users can connect without sharing zones initially

      // Send friend requests
      for (const phoneNumber of phoneNumbers) {
        try {
          logger.debug('📞 About to send friend request:', {
            phoneNumber,
            fromUserId: currentUser.uid,
            fromUserName,
            selectedHomeIds,
            homeIdsCount: selectedHomeIds.length
          });
          
          await sendFriendRequest(
            currentUser.uid,
            phoneNumber,
            fromUserName,
            selectedHomeIds
          );
          
          // Track contact selection for future smart sorting
          await trackContactSelection(phoneNumber);
          
          successCount++;
        } catch (error: any) {
          logger.error('Error sending request to', phoneNumber, ':', error);
          errorMessages.push(`${phoneNumber}: ${error.message}`);
        }
      }

      // Show results
      if (successCount > 0) {
        Alert.alert(
          'Invitations Sent',
          `${successCount} friend invitation(s) sent successfully!${
            errorMessages.length > 0 ? `\n\nSome failed:\n${errorMessages.join('\n')}` : ''
          }`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert(
          'Failed to Send',
          `All invitations failed:\n${errorMessages.join('\n')}`,
          [{ text: 'OK' }]
        );
      }

      // Reset selections
      setSelectedContacts([]);
      setManualName('');
      setManualPhone('');

    } catch (error) {
      logger.error('Error in handleSendInvitations:', error);
      Alert.alert('Error', 'Failed to send invitations. Please try again.');
    }
  };

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const toggleHomeSelection = (homeId: string) => {
    setSelectedHomeIds(prev =>
      prev.includes(homeId)
        ? prev.filter(id => id !== homeId)
        : [...prev, homeId]
    );
  };

  const getFirstValidPhoneNumber = (contact: Contact | undefined): string | undefined => {
    if (!contact || !contact.phoneNumbers || contact.phoneNumbers.length === 0) {
      return undefined;
    }
    
    // Find the first phone number with a valid number
    const validPhone = contact.phoneNumbers.find(pn => pn.number && pn.number.trim().length > 5);
    return validPhone?.number || validPhone?.digits;
  };


  // SMART CONTACTS FILTER - matches beginning of first/last names
  const filteredContacts = React.useMemo<Contact[]>(() => {
    logger.debug(`🔍 FILTERING: query="${searchQuery}", contacts=${contacts.length}`);
    
    if (!searchQuery.trim()) {
      return contacts;
    }
    
    const query = searchQuery.toLowerCase().trim();
    const result = contacts.filter(contact => {
      const fullName = contact.name.toLowerCase();
      const firstName = contact.firstName?.toLowerCase() || '';
      const lastName = contact.lastName?.toLowerCase() || '';
      
      // Split full name into words for matching
      const nameWords = fullName.split(/\s+/);
      
      // Check if query matches the beginning of:
      // 1. Full name
      // 2. Any word in the full name (first/last name)
      // 3. First name specifically
      // 4. Last name specifically
      const matches = fullName.startsWith(query) ||
                     nameWords.some(word => word.startsWith(query)) ||
                     firstName.startsWith(query) ||
                     lastName.startsWith(query);
      
      if (matches) {
        logger.debug(`✅ MATCH: "${contact.name}" matches "${query}"`);
      }
      
      return matches;
    });
    
    logger.debug(`🔍 RESULT: ${result.length}/${contacts.length} contacts match "${query}"`);
    return result;
  }, [contacts, searchQuery]);

  // New Friends tab - shows existing friends + smart contact suggestions
  const renderFriendsTab = () => {
    const suggestedContacts = smartContacts.slice(0, 20); // Limit to top 20 suggestions
    
    return (
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#717171" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search friends and contacts..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>

        {/* Existing FriendZone Friends */}
        {existingFriends.length > 0 && (
          <>
            <Text style={styles.sectionHeader}>Your FriendZone Friends</Text>
            {existingFriends.map((friend) => {
              const uniqueId = friend.friendUserId || friend.phoneNumber || friend.id;
              return (
                <TouchableOpacity
                  key={uniqueId}
                  style={[styles.contactItem, { opacity: 0.6 }]}
                >
                  <View style={[styles.contactCheckbox, { backgroundColor: '#E0E0E0' }]}>
                    <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.friendInfo}>
                    <Text style={styles.friendName}>{friend.name}</Text>
                    <Text style={styles.friendPhone}>{formatPhoneForDisplay(friend.phoneNumber)}</Text>
                  </View>
                  <Text style={styles.alreadyFriendText}>Already friends</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Smart Contact Suggestions */}
        <Text style={styles.sectionHeader}>
          {existingFriends.length > 0 ? 'Suggested Friends' : 'Find Friends'}
        </Text>
        
        {suggestedContacts.length > 0 ? (
          suggestedContacts
            .filter(contact => {
              // Filter by search query if present
              if (!searchQuery.trim()) return true;
              const query = searchQuery.toLowerCase();
              return contact.name.toLowerCase().includes(query);
            })
            .map((contact) => {
              const uniqueId = contact.id;
              const isSelected = selectedContacts.includes(uniqueId);
              
              return (
                <TouchableOpacity
                  key={uniqueId}
                  style={styles.contactItem}
                  onPress={() => toggleContactSelection(uniqueId)}
                >
                  <View style={[
                    styles.contactCheckbox,
                    isSelected && styles.selectedCheckbox
                  ]}>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <Text style={styles.contactPhone}>
                      {formatPhoneForDisplay(contact.phoneNumbers?.[0]?.number || 'No phone')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#717171" />
                </TouchableOpacity>
              );
            })
        ) : (
          <Text style={styles.noContactsText}>
            {searchQuery ? 'No contacts match your search' : 'No contacts found'}
          </Text>
        )}
      </ScrollView>
    );
  };

  const renderTabButton = (tab: TabType, title: string) => (
    <TouchableOpacity
      style={[styles.tabButton, selectedTab === tab && styles.activeTabButton]}
      onPress={() => setSelectedTab(tab)}
    >
      <Text style={[styles.tabButtonText, selectedTab === tab && styles.activeTabButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderHomeFriends = () => {
    // Use friendUserId for unique identification (consolidated friends)
    const allSelected = existingFriends.length > 0 && existingFriends.every(friend => {
      const uniqueId = friend.friendUserId || friend.id;
      return selectedContacts.includes(uniqueId);
    });
    
    const handleSelectAll = () => {
      if (allSelected) {
        // Deselect all
        const uniqueIds = existingFriends.map(f => f.friendUserId || f.id);
        setSelectedContacts(prev => prev.filter(id => !uniqueIds.includes(id)));
      } else {
        // Select all
        const friendIds = existingFriends.map(f => f.friendUserId || f.id);
        setSelectedContacts(prev => [...new Set([...prev, ...friendIds])]);
      }
    };

    return (
      <View style={styles.tabContent}>
        <View style={styles.sectionHeader}>
          <Text style={styles.tabDescription}>
            Friends already on FriendZone:
          </Text>
          {existingFriends.length > 0 && (
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={handleSelectAll}
            >
              <Text style={styles.selectAllText}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      {existingFriends.map((friend: Friend) => {
        // Use friendUserId as the unique identifier (consolidated friends have same friendUserId)
        const uniqueId = friend.friendUserId || friend.id;
        return (
        <TouchableOpacity
          key={uniqueId}
          style={styles.friendOption}
          onPress={() => toggleContactSelection(uniqueId)}
        >
          <View style={styles.checkboxContainer}>
            <TouchableOpacity
              style={[
                styles.checkbox,
                selectedContacts.includes(uniqueId) && styles.checkboxSelected
              ]}
              onPress={() => toggleContactSelection(uniqueId)}
            >
              {selectedContacts.includes(uniqueId) && (
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.friendInfo}>
            <Text style={styles.friendName}>{friend.name}</Text>
            <Text style={styles.friendPhone}>{formatPhoneForDisplay(friend.phoneNumber)}</Text>
          </View>
        </TouchableOpacity>
      )})}
    </View>
    );
  };

  const renderContacts = () => {
    logger.debug(`🎯 renderContacts called - searchQuery: "${searchQuery}", filteredContacts.length: ${filteredContacts.length}`);
    
    return (
      <View style={styles.tabContent}>
        <Text style={styles.tabDescription}>
          Select friends from your contacts: ✅ FIXED
        </Text>
        
        <Text style={styles.debugText}>
          Query: "{searchQuery}" | Results: {filteredContacts.length}/{contacts.length}
        </Text>

        <TextInput
          style={styles.searchInput}
          placeholder="Search contacts..."
          value={searchQuery}
          onChangeText={(text) => {
            logger.debug(`🔍 Search input changed from "${searchQuery}" to "${text}"`);
            setSearchQuery(text);
            // Force re-render by logging the change
            logger.debug(`🔍 State updated, searchQuery is now: "${text}"`);
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
        
        <Text style={styles.debugText}>
          Search: "{searchQuery}" | Showing {filteredContacts.length} of {contacts.length} contacts
        </Text>

      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        style={styles.contactsList}
        renderItem={({ item: contact }) => (
          <TouchableOpacity
            style={styles.friendOption}
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
            <View style={styles.friendInfo}>
              <Text style={styles.friendName}>
                {contact.name}
              </Text>
              <Text style={styles.friendPhone}>
                {formatPhoneNumber(contact.phoneNumbers?.[0]?.number || contact.phoneNumbers?.[0]?.digits || 'No phone')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          contacts.length > 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No contacts found matching "{searchQuery}"</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No contacts with phone numbers found. Make sure you have contacts saved on your device.
              </Text>
            </View>
          )
        }
        initialNumToRender={100}
        maxToRenderPerBatch={100}
        windowSize={21}
      />
    </View>
  );
};

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
        enablesReturnKeyAutomatically={true}
      />

      <View>
        <TextInput
          style={styles.input}
          placeholder="Phone Number (e.g., 555-123-4567)"
          value={formatPhoneNumber(manualPhone)}
          onChangeText={(text) => setManualPhone(text.replace(/[^\d]/g, ''))}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => {
            // Handle submit if needed
          }}
          enablesReturnKeyAutomatically={true}
        />
      </View>
    </View>
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
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
            <TouchableOpacity onPress={showContactsDebug}>
              <Ionicons name="bug-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Invite to Zone</Text>
          </View>
          <TouchableOpacity onPress={handleSendInvitations}>
            <Text style={styles.sendButton}>Send</Text>
          </TouchableOpacity>
        </View>

      {/* Home Selection Section */}
      <View style={styles.homeSelectionSection}>
        <Text style={styles.homeSelectionTitle}>Select zones to share (optional):</Text>
        {homes.length > 0 ? (
          <ScrollView style={styles.homeListContainer} showsVerticalScrollIndicator={false}>
            {homes.map(home => (
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
                      <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.homeInfo}>
                  <Text style={styles.homeOptionText}>{home.name}</Text>
                  <Text style={styles.homeAddress}>{home.location.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noHomesText}>
            No zones found. Go to the Zones tab to create a zone first, or make sure you're signed in properly.
          </Text>
        )}
      </View>

      <View style={styles.tabContainer}>
        {renderTabButton('friends', 'Friends')}
        {renderTabButton('allContacts', 'All Contacts')}
        {renderTabButton('manual', 'Manual')}
      </View>

        <View style={styles.content}>
          {selectedTab === 'friends' && renderFriendsTab()}
          {selectedTab === 'allContacts' && renderContacts()}
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
    fontWeight: 'bold',
    color: '#222222',
  },
  cancelButton: {
    color: '#717171',
    fontSize: 16,
  },
  sendButton: {
    color: '#FF5A5F',
    fontSize: 16,
    fontWeight: '600',
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
    color: '#717171',
    marginBottom: 20,
    lineHeight: 24,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  contactsList: {
    flex: 1,
  },
  friendOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 2,
  },
  friendPhone: {
    fontSize: 14,
    color: '#717171',
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#717171',
    textAlign: 'center',
    lineHeight: 24,
  },
  homeSelectionSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  homeSelectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  noHomesText: {
    fontSize: 14,
    color: '#717171',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 8,
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
  homeListContainer: {
    paddingVertical: 8,
    maxHeight: 120, // Limit height to show ~2 zones max
  },
  homeOption: {
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
  homeInfo: {
    flex: 1,
  },
  homeOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 2,
  },
  homeAddress: {
    fontSize: 14,
    color: '#717171',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF5A5F',
    backgroundColor: 'transparent',
  },
  selectAllText: {
    fontSize: 14,
    color: '#FF5A5F',
    fontWeight: '600',
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
    marginTop: 8,
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
  debugText: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginTop: 24,
    marginBottom: 12,
    marginHorizontal: 24,
  },
  alreadyFriendText: {
    fontSize: 14,
    color: '#717171',
    fontStyle: 'italic',
  },
  noContactsText: {
    fontSize: 16,
    color: '#717171',
    textAlign: 'center',
    marginTop: 32,
    marginHorizontal: 24,
  },
});