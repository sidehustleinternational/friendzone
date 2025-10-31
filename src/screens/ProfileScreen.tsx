import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  Linking,
  Platform,
  TextInput,
  Modal,
  Clipboard,
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList, Friend, FriendRequest, Home} from '../types';
import {signOutUser, clearUserData, clearAllData} from '../services/firebase';
import {auth, db} from '../../firebaseConfig';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import * as Location from 'expo-location';
import { formatPhoneForDisplay } from '../components/PhoneNumberInput';
import { getRecentErrors } from '../services/locationServiceV3';
import Constants from 'expo-constants';

type ProfileScreenNavigationProp = StackNavigationProp<RootStackParamList>;

// Debug mode flag - set to true to show debug sections
const SHOW_DEBUG_SECTIONS = false;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  
  const [user, setUser] = useState({
    name: 'John Doe',
    phoneNumber: '+1 (234) 567-8901',
    email: 'john.doe@example.com',
  });

  const [firebaseUser, setFirebaseUser] = useState<any>(null);
  const [dbFriends, setDbFriends] = useState<Friend[]>([]);
  const [dbFriendRequests, setDbFriendRequests] = useState<FriendRequest[]>([]);
  const [dbHomes, setDbHomes] = useState<Home[]>([]);
  const [dbUsers, setDbUsers] = useState<any[]>([]);
  const [dbLocations, setDbLocations] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);
  const [contactMessage, setContactMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(user.name);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const handleSaveProfile = () => {
    setUser({...user, name: editedName});
    setIsEditing(false);
    Alert.alert('Success', 'Profile updated successfully!');
  };

  const collectDebugInfo = async () => {
    try {
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setDebugInfo('Not logged in');
        return;
      }

      let info = `DEBUG INFO\n`;
      info += `Build: ${Constants.expoConfig?.ios?.buildNumber || 'Unknown'}\n`;
      info += `User ID: ${currentUser.uid}\n\n`;

      // Get friends
      const friendsQuery = query(collection(db, 'friends'), where('userId', '==', currentUser.uid));
      const friendsSnapshot = await getDocs(friendsQuery);
      info += `FRIENDS (${friendsSnapshot.docs.length} total):\n`;
      friendsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        info += `\n${data.name}:\n`;
        info += `  sharedHomes: [${(data.sharedHomes || []).join(', ')}]\n`;
      });

      // Get homes
      info += `\n\nHOMES:\n`;
      const homesQuery = query(collection(db, 'homes'), where('members', 'array-contains', currentUser.uid));
      const homesSnapshot = await getDocs(homesQuery);
      homesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        info += `\n"${data.name}": ${doc.id}\n`;
        
        // Show which friends have this zone
        const friendsWithZone = friendsSnapshot.docs.filter(fdoc => {
          const fdata = fdoc.data();
          return fdata.sharedHomes && fdata.sharedHomes.includes(doc.id);
        });
        info += `  Friends with this zone: ${friendsWithZone.map(f => f.data().name).join(', ') || 'none'}\n`;
      });

      setDebugInfo(info);
    } catch (error) {
      setDebugInfo(`Error: ${error}`);
    }
  };

  const copyDebugInfo = () => {
    Clipboard.setString(debugInfo);
    Alert.alert('Copied', 'Debug info copied to clipboard');
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setFirebaseUser(user);
      if (user) {
        // Fetch user data from Firestore to get phone number
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const userData = userDoc.data();
          
          setUser({
            name: user.displayName || userData?.name || 'User',
            phoneNumber: userData?.phoneNumber || 'Not provided',
            email: user.email || 'Not provided',
          });

          // Register for push notifications
          const { registerForPushNotifications } = await import('../services/notificationService');
          registerForPushNotifications().catch(err => {
            logger.error('Failed to register for push notifications:', err);
          });
        } catch (error) {
          logger.error('Error fetching user data:', error);
          setUser({
            name: user.displayName || 'User',
            phoneNumber: 'Not provided',
            email: user.email || 'Not provided',
          });
        }
      }
    });

    return unsubscribe;
  }, []);


  const [locationPermission, setLocationPermission] = useState<'always' | 'whenInUse' | 'denied' | 'unknown'>('unknown');
  const [locationDebug, setLocationDebug] = useState<any>(null);

  // Check location permission status and fetch debug info
  useEffect(() => {
    checkLocationPermission();
    fetchLocationDebugInfo();
  }, []);

  const fetchLocationDebugInfo = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const { doc, getDoc } = await import('firebase/firestore');
      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      const userData = userDoc.data();

      if (userData?.lastLocation) {
        setLocationDebug({
          hasEncryptedCoords: !!userData.lastLocation.encryptedCoordinates,
          timestamp: userData.lastLocation.timestamp ? new Date(userData.lastLocation.timestamp).toLocaleString() : 'NONE',
          accuracy: userData.lastLocation.accuracy || 'NONE',
          lastSeen: userData.lastSeen ? new Date(userData.lastSeen.toDate()).toLocaleString() : 'NONE',
          isAtHome: userData.isAtHome,
          currentHomeIds: userData.currentHomeIds || [],
        });
      } else {
        setLocationDebug({ error: 'No location data' });
      }
    } catch (error) {
      logger.error('Error fetching location debug info:', error);
      setLocationDebug({ error: String(error) });
    }
  };

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();
      
      if (backgroundStatus.status === 'granted') {
        setLocationPermission('always');
      } else if (status === 'granted') {
        setLocationPermission('whenInUse');
      } else {
        setLocationPermission('denied');
      }
    } catch (error) {
      logger.error('Error checking location permission:', error);
    }
  };

  const handleOpenSettings = () => {
    Alert.alert(
      'Enable Background Location',
      'To detect when you enter or leave zones, FriendZone needs "Always" location permission.\n\n1. Tap "Open Settings" below\n2. Tap "Location"\n3. Select "Always"',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Open Settings', 
          onPress: () => {
            if (Platform.OS === 'ios') {
              Linking.openURL('app-settings:');
            } else {
              Linking.openSettings();
            }
          }
        }
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Sign Out', style: 'destructive', onPress: async () => {
          try {
            await signOutUser();
            navigation.reset({
              index: 0,
              routes: [{name: 'Auth'}],
            });
          } catch (error: any) {
            Alert.alert('Error', 'Failed to sign out. Please try again.');
          }
        }},
      ]
    );
  };

  const handleClearUserData = () => {
    if (!firebaseUser) {
      Alert.alert('Error', 'No user signed in');
      return;
    }

    Alert.alert(
      'Clear My Data',
      'This will delete all YOUR data from the database:\n\n• Your user profile\n• Your homes\n• Your friends\n\nThis action cannot be undone!',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Clear My Data', style: 'destructive', onPress: async () => {
          try {
            await clearUserData(firebaseUser.uid);
            Alert.alert('✅ Success', 'Your data and account have been deleted. You will be signed out.', [
              {
                text: 'OK',
                onPress: () => {
                  navigation.reset({
                    index: 0,
                    routes: [{name: 'Auth'}],
                  });
                }
              }
            ]);
          } catch (error: any) {
            Alert.alert('Error', 'Failed to clear data: ' + error.message);
          }
        }},
      ]
    );
  };

  const handleClearAllData = () => {
    Alert.alert(
      'Clear ALL Database',
      'This will delete EVERYTHING from the database:\n\n• All users\n• All homes\n• All friends\n• All data from all users\n\nThis action cannot be undone!',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'CLEAR EVERYTHING', style: 'destructive', onPress: async () => {
          try {
            await clearAllData();
            Alert.alert(
              '✅ Database Cleared!', 
              'All Firebase data has been cleared:\n\n• All users\n• All friends\n• All homes\n• All friend requests\n• All location data\n\nThe Friends screen will update in real-time to show the empty state!'
            );
          } catch (error: any) {
            Alert.alert('Error', 'Failed to clear database: ' + error.message);
          }
        }},
      ]
    );
  };

  const handleAdminClearDatabase = () => {
    Alert.alert(
      '🔧 Admin: Clear Database',
      'Admin access detected for user 7812494070.\n\nThis will clear the entire FriendZone database:\n\n• All users\n• All friends & friend requests\n• All homes & locations\n• All data from all users\n\nThis action cannot be undone!',
      [
        {text: 'Cancel', style: 'cancel'},
        {text: 'ADMIN CLEAR ALL', style: 'destructive', onPress: async () => {
          try {
            logger.debug('🔧 Admin clearing database');
            await clearAllData();
            Alert.alert(
              '✅ Admin Database Clear Complete!', 
              'All FriendZone data has been cleared by admin:\n\n• All users removed\n• All friendships deleted\n• All homes cleared\n• All friend requests removed\n• All location data wiped\n\nDatabase is now empty and ready for fresh testing.'
            );
          } catch (error: any) {
            logger.error('❌ Admin database clear failed:', error);
            Alert.alert('Admin Error', 'Failed to clear database: ' + error.message);
          }
        }},
      ]
    );
  };

  const scanDatabase = async () => {
    setIsScanning(true);
    try {
      // Scan all collections
      const [usersSnap, friendsSnap, friendRequestsSnap, homesSnap, locationsSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'friends')),
        getDocs(collection(db, 'friendRequests')),
        getDocs(collection(db, 'homes')),
        getDocs(collection(db, 'locations'))
      ]);

      // Process users
      const users = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Process friends
      const friends = friendsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Friend[];

      // Process friend requests
      const friendRequests = friendRequestsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as FriendRequest[];

      // Process homes
      const homes = homesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as Home[];

      // Process locations
      const locations = locationsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setDbUsers(users);
      setDbFriends(friends);
      setDbFriendRequests(friendRequests);
      setDbHomes(homes);
      setDbLocations(locations);

      logger.debug('Database scan complete:', {
        users: users.length,
        friends: friends.length,
        friendRequests: friendRequests.length,
        homes: homes.length,
        locations: locations.length
      });

    } catch (error) {
      logger.error('Error scanning database:', error);
      Alert.alert('Error', 'Failed to scan database: ' + error);
    } finally {
      setIsScanning(false);
    }
  };

  const handleContactDeveloper = async () => {
    if (!contactMessage.trim()) {
      Alert.alert('Error', 'Please enter a message before sending.');
      return;
    }

    try {
      setSendingMessage(true);
      
      // Get user info for context
      const userInfo = firebaseUser ? {
        name: user.name,
        email: user.email,
        uid: firebaseUser.uid.substring(0, 8)
      } : { name: 'Anonymous', email: 'N/A', uid: 'N/A' };

      // Create email body with user context
      const emailBody = `Message from FriendZone user:

${contactMessage.trim()}

---
User Info:
Name: ${userInfo.name}
Email: ${userInfo.email}
User ID: ${userInfo.uid}
App Version: 4.0.0
Platform: ${Platform.OS}
Date: ${new Date().toLocaleString()}`;

      // Use mailto to open default email app
      const emailUrl = `mailto:jamiegoldstein44@gmail.com?subject=FriendZone Feedback&body=${encodeURIComponent(emailBody)}`;
      
      const canOpen = await Linking.canOpenURL(emailUrl);
      if (canOpen) {
        await Linking.openURL(emailUrl);
        setContactModalVisible(false);
        setContactMessage('');
        Alert.alert('Success', 'Your email app has been opened with your message. Please send the email to complete your request.');
      } else {
        Alert.alert('Error', 'Unable to open email app. Please make sure you have an email app configured on your device.');
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to open email app: ' + error.message);
    } finally {
      setSendingMessage(false);
    }
  };

  const renderProfileSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Profile Information</Text>

      <View style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Text style={styles.profileLabel}>Name</Text>
          {isEditing ? (
            <TextInput
              style={styles.profileInput}
              value={editedName}
              onChangeText={setEditedName}
              autoCapitalize="words"
            />
          ) : (
            <Text style={styles.profileValue}>{user.name}</Text>
          )}
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileLabel}>Phone</Text>
          <Text style={styles.profileValue}>{formatPhoneForDisplay(user.phoneNumber)}</Text>
        </View>

        <View style={styles.profileRow}>
          <Text style={styles.profileLabel}>Email</Text>
          <Text style={styles.profileValue}>{user.email || 'Not provided'}</Text>
        </View>

        <TouchableOpacity
          style={styles.editButton}
          onPress={isEditing ? handleSaveProfile : () => setIsEditing(true)}
        >
          <Text style={styles.editButtonText}>
            {isEditing ? 'Save Changes' : 'Edit Profile'}
          </Text>
        </TouchableOpacity>

        {isEditing && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setIsEditing(false);
              setEditedName(user.name);
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderSettingsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Privacy & Settings</Text>

      {/* Location Permission Warning */}
      {locationPermission === 'whenInUse' && (
        <TouchableOpacity 
          style={styles.warningBanner}
          onPress={handleOpenSettings}
        >
          <Text style={styles.warningIcon}>🟡</Text>
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Limited Location Access</Text>
            <Text style={styles.warningText}>
              You're using "While Using App" mode. Location sharing works when app is open, but you won't get zone arrival or proximity notifications. Tap to enable "Always" for full features.
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Location Debug Info */}
      {locationDebug && (
        <View style={styles.debugCard}>
          <Text style={styles.debugTitle}>📍 Location Service Status</Text>
          <Text style={styles.debugText}>Permission: {locationPermission}</Text>
          {locationDebug.error ? (
            <Text style={styles.debugText}>❌ Error: {locationDebug.error}</Text>
          ) : (
            <>
              <Text style={styles.debugText}>Has Coordinates: {locationDebug.hasEncryptedCoords ? '✅ YES' : '❌ NO'}</Text>
              <Text style={styles.debugText}>Last Update: {locationDebug.timestamp}</Text>
              <Text style={styles.debugText}>Accuracy: {locationDebug.accuracy}m</Text>
              <Text style={styles.debugText}>At Home: {locationDebug.isAtHome ? '✅ YES' : '❌ NO'}</Text>
              <Text style={styles.debugText}>Zones: {locationDebug.currentHomeIds.length || 0}</Text>
              <Text style={styles.debugText}>Last Seen: {locationDebug.lastSeen}</Text>
            </>
          )}
          
          {/* Recent Errors */}
          {(() => {
            const errors = getRecentErrors();
            if (errors.length > 0) {
              const errorText = errors.map(e => 
                `[${e.timestamp.toLocaleTimeString()}] ${e.context}: ${e.error}`
              ).join('\n');
              
              return (
                <View style={styles.errorSection}>
                  <Text style={styles.errorTitle}>🐛 Recent Errors ({errors.length})</Text>
                  <ScrollView style={styles.errorScroll} nestedScrollEnabled>
                    <Text style={styles.errorText}>{errorText}</Text>
                  </ScrollView>
                  <TouchableOpacity 
                    onPress={() => {
                      Clipboard.setString(errorText);
                      Alert.alert('Copied!', 'Error log copied to clipboard');
                    }} 
                    style={styles.copyButton}
                  >
                    <Text style={styles.copyButtonText}>📋 Copy Errors</Text>
                  </TouchableOpacity>
                </View>
              );
            }
            return null;
          })()}
          
          <TouchableOpacity onPress={fetchLocationDebugInfo} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );

  const renderDebugSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Debug Info</Text>
      <View style={styles.accountCard}>
        <TouchableOpacity 
          style={styles.accountOption}
          onPress={collectDebugInfo}
        >
          <Text style={styles.accountOptionText}>Collect Debug Info</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
        
        {debugInfo ? (
          <>
            <View style={styles.debugInfoContainer}>
              <ScrollView style={styles.debugInfoScroll} nestedScrollEnabled>
                <Text style={styles.debugInfoText}>{debugInfo}</Text>
              </ScrollView>
            </View>
            <TouchableOpacity 
              style={styles.debugCopyButton}
              onPress={copyDebugInfo}
            >
              <Text style={styles.debugCopyButtonText}>Copy to Clipboard</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );

  const renderAccountSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Account</Text>

      <View style={styles.accountCard}>
        <TouchableOpacity 
          style={styles.accountOption}
          onPress={() => navigation.navigate('PrivacyPolicy')}
        >
          <Text style={styles.accountOptionText}>Privacy Policy</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.accountOption}
          onPress={() => navigation.navigate('TermsOfService')}
        >
          <Text style={styles.accountOptionText}>Terms of Service</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.accountOption}
          onPress={() => setContactModalVisible(true)}
        >
          <Text style={styles.accountOptionText}>Contact the Developer</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        {/* Admin-only database cleaner for phone number 7812494070 */}
        {SHOW_DEBUG_SECTIONS && (user.phoneNumber.replace(/\D/g, '') === '17812494070' || user.phoneNumber.replace(/\D/g, '') === '7812494070') && (
          <TouchableOpacity
            style={[styles.accountOption, {backgroundColor: '#FF3B30'}]}
            onPress={handleAdminClearDatabase}
          >
            <Text style={[styles.accountOptionText, {color: 'white', fontWeight: '600'}]}>🔧 Admin: Clear Database</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.accountOption, styles.signOutOption]}
          onPress={handleSignOut}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFirebaseStatus = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Firebase Status</Text>
      <View style={styles.profileCard}>
        <View style={styles.profileRow}>
          <Text style={styles.profileLabel}>Connection</Text>
          <Text style={[styles.profileValue, {color: firebaseUser ? '#00AA00' : '#FF5A5F'}]}>
            {firebaseUser ? '✅ Connected' : '❌ Not Connected'}
          </Text>
        </View>
        
        {firebaseUser && (
          <>
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>User ID</Text>
              <Text style={styles.profileValue}>
                {firebaseUser.uid.substring(0, 8)}...
              </Text>
            </View>
            
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Email</Text>
              <Text style={styles.profileValue}>
                {firebaseUser.email || 'N/A'}
              </Text>
            </View>
            
            <View style={styles.profileRow}>
              <Text style={styles.profileLabel}>Created</Text>
              <Text style={styles.profileValue}>
                {firebaseUser.metadata?.creationTime ? 
                  new Date(firebaseUser.metadata.creationTime).toLocaleDateString() : 'N/A'}
              </Text>
            </View>
          </>
        )}
        
        {firebaseUser && (
          <View style={{marginTop: 16}}>
            <TouchableOpacity
              style={[styles.editButton, {backgroundColor: '#FF9500', marginBottom: 8}]}
              onPress={handleClearUserData}
            >
              <Text style={styles.editButtonText}>Clear My Data</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.editButton, {backgroundColor: '#FF3B30'}]}
              onPress={handleClearAllData}
            >
              <Text style={styles.editButtonText}>Clear ALL Database</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  const renderDatabaseScanner = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Database Scanner</Text>
      <View style={styles.profileCard}>
        <TouchableOpacity
          style={[styles.editButton, {backgroundColor: '#007AFF', marginBottom: 16}]}
          onPress={scanDatabase}
          disabled={isScanning}
        >
          <Text style={styles.editButtonText}>
            {isScanning ? 'Scanning...' : 'Scan Database'}
          </Text>
        </TouchableOpacity>

        {/* Users Section */}
        <View style={styles.dbSection}>
          <Text style={styles.dbSectionTitle}>Users ({dbUsers.length})</Text>
          {dbUsers.map((user, index) => (
            <View key={user.id} style={styles.dbItem}>
              <Text style={styles.dbItemTitle}>{user.name || 'No name'}</Text>
              <Text style={styles.dbItemSubtitle}>Phone: {formatPhoneForDisplay(user.phoneNumber) || 'N/A'}</Text>
              <Text style={styles.dbItemSubtitle}>ID: {user.id}</Text>
            </View>
          ))}
          {dbUsers.length === 0 && <Text style={styles.emptyText}>No users found</Text>}
        </View>

        {/* Friends Section */}
        <View style={styles.dbSection}>
          <Text style={styles.dbSectionTitle}>Friends ({dbFriends.length})</Text>
          {dbFriends.map((friend, index) => (
            <View key={friend.id} style={styles.dbItem}>
              <Text style={styles.dbItemTitle}>{friend.name}</Text>
              <Text style={styles.dbItemSubtitle}>Phone: {formatPhoneForDisplay(friend.phoneNumber)}</Text>
              <Text style={styles.dbItemSubtitle}>User: {(friend as any).userId || 'N/A'}</Text>
              <Text style={styles.dbItemSubtitle}>Shared Homes: {friend.sharedHomes?.length || 0}</Text>
            </View>
          ))}
          {dbFriends.length === 0 && <Text style={styles.emptyText}>No friends found</Text>}
        </View>

        {/* Friend Requests Section */}
        <View style={styles.dbSection}>
          <Text style={styles.dbSectionTitle}>Friend Requests ({dbFriendRequests.length})</Text>
          {dbFriendRequests.map((request, index) => (
            <View key={request.id} style={styles.dbItem}>
              <Text style={styles.dbItemTitle}>{request.fromUserName} → {request.toUserId}</Text>
              <Text style={styles.dbItemSubtitle}>Status: {request.status}</Text>
              <Text style={styles.dbItemSubtitle}>From: {request.fromUserId}</Text>
              {request.homeId && <Text style={styles.dbItemSubtitle}>Home: {request.homeId}</Text>}
            </View>
          ))}
          {dbFriendRequests.length === 0 && <Text style={styles.emptyText}>No friend requests found</Text>}
        </View>

        {/* Homes Section */}
        <View style={styles.dbSection}>
          <Text style={styles.dbSectionTitle}>Homes ({dbHomes.length})</Text>
          {dbHomes.map((home, index) => (
            <View key={home.id} style={styles.dbItem}>
              <Text style={styles.dbItemTitle}>{home.name}</Text>
              <Text style={styles.dbItemSubtitle}>Address: {home.location?.address || 'N/A'}</Text>
              <Text style={styles.dbItemSubtitle}>Created by: {home.createdBy}</Text>
              <Text style={styles.dbItemSubtitle}>Members: {home.members?.length || 0}</Text>
            </View>
          ))}
          {dbHomes.length === 0 && <Text style={styles.emptyText}>No homes found</Text>}
        </View>

        {/* Locations Section */}
        <View style={styles.dbSection}>
          <Text style={styles.dbSectionTitle}>Locations ({dbLocations.length})</Text>
          {dbLocations.map((location, index) => (
            <View key={location.id} style={styles.dbItem}>
              <Text style={styles.dbItemTitle}>User: {location.userId || location.id}</Text>
              <Text style={styles.dbItemSubtitle}>
                Lat: {location.latitude?.toFixed(4)}, Lng: {location.longitude?.toFixed(4)}
              </Text>
              <Text style={styles.dbItemSubtitle}>At Home: {location.isAtHome ? 'Yes' : 'No'}</Text>
              {location.timestamp && (
                <Text style={styles.dbItemSubtitle}>
                  Updated: {new Date(location.timestamp).toLocaleString()}
                </Text>
              )}
            </View>
          ))}
          {dbLocations.length === 0 && <Text style={styles.emptyText}>No locations found</Text>}
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} allowFontScaling={false}>Profile</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderProfileSection()}
        {renderSettingsSection()}
        {SHOW_DEBUG_SECTIONS && renderDebugSection()}
        {renderAccountSection()}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            FriendZone v{Constants.expoConfig?.version || '1.0.0'}
          </Text>
          <Text style={styles.footerText}>
            Build {Constants.expoConfig?.ios?.buildNumber || 'Unknown'}
          </Text>
        </View>
      </ScrollView>

      {/* Contact Developer Modal */}
      <Modal
        visible={contactModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setContactModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setContactModalVisible(false)}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Contact Developer</Text>
            <TouchableOpacity 
              onPress={handleContactDeveloper}
              disabled={sendingMessage}
            >
              <Text style={[styles.sendButton, sendingMessage && styles.sendButtonDisabled]}>
                {sendingMessage ? 'Sending...' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <Text style={styles.modalDescription}>
              Send feedback, report bugs, or ask questions about FriendZone.
            </Text>
            
            <TextInput
              style={styles.messageInput}
              placeholder="Type your message here..."
              value={contactMessage}
              onChangeText={setContactMessage}
              multiline
              numberOfLines={10}
              textAlignVertical="top"
              autoFocus
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
  section: {
    padding: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 16,
  },
  warningBanner: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE69C',
  },
  warningIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 16,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
  },
  profileLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    flex: 1,
  },
  profileValue: {
    fontSize: 16,
    color: '#717171',
    flex: 2,
    textAlign: 'right',
  },
  profileInput: {
    fontSize: 16,
    color: '#222222',
    flex: 2,
    textAlign: 'right',
    borderBottomWidth: 1,
    borderBottomColor: '#FF5A5F',
    paddingVertical: 4,
  },
  editButton: {
    backgroundColor: '#FF5A5F',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  cancelButton: {
    backgroundColor: '#F7F7F7',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: '#717171',
    fontWeight: '600',
    fontSize: 16,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#717171',
    lineHeight: 20,
  },
  accountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  accountOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F7F7F7',
  },
  accountOptionText: {
    fontSize: 16,
    color: '#222222',
  },
  chevron: {
    fontSize: 20,
    color: '#DDDDDD',
  },
  signOutOption: {
    borderBottomWidth: 0,
  },
  signOutText: {
    fontSize: 16,
    color: '#FF5A5F',
    fontWeight: '600',
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#717171',
  },
  dbSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  dbSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  dbItem: {
    backgroundColor: '#F9F9F9',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  dbItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  dbItemSubtitle: {
    fontSize: 12,
    color: '#717171',
    marginBottom: 2,
  },
  emptyText: {
    fontSize: 14,
    color: '#717171',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  debugCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 12,
  },
  debugText: {
    fontSize: 14,
    color: '#717171',
    marginBottom: 6,
    fontFamily: 'Courier',
  },
  refreshButton: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    alignItems: 'center',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222222',
  },
  errorSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF5A5F',
    marginBottom: 8,
  },
  errorScroll: {
    maxHeight: 150,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    fontFamily: 'Courier',
    lineHeight: 18,
  },
  copyButton: {
    padding: 10,
    backgroundColor: '#FF5A5F',
    borderRadius: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    fontSize: 16,
    fontWeight: '600',
    color: '#FF5A5F',
  },
  sendButtonDisabled: {
    color: '#CCCCCC',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  modalDescription: {
    fontSize: 16,
    color: '#717171',
    marginBottom: 20,
    lineHeight: 24,
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#222222',
    borderWidth: 1,
    borderColor: '#EBEBEB',
    textAlignVertical: 'top',
  },
  debugInfoContainer: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    maxHeight: 300,
  },
  debugInfoScroll: {
    maxHeight: 280,
  },
  debugInfoText: {
    fontSize: 12,
    color: '#222222',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  debugCopyButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  debugCopyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});