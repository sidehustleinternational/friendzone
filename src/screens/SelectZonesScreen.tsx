import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { logger } from '../utils/logger';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList, Home } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { sendFriendRequest, getUserData, subscribeToUserHomes } from '../services/firebase';
import { auth } from '../../firebaseConfig';

type SelectZonesScreenRouteProp = RouteProp<RootStackParamList, 'SelectZones'>;

interface SelectedFriend {
  name: string;
  phoneNumber: string;
  source: 'contact' | 'manual' | 'zonefriend';
}

export default function SelectZonesScreen() {
  const route = useRoute<SelectZonesScreenRouteProp>();
  const navigation = useNavigation();
  const { selectedFriends, preSelectedZoneId } = route.params;
  
  const [homes, setHomes] = useState<Home[]>([]);
  const [selectedHomeIds, setSelectedHomeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const unsubscribe = subscribeToUserHomes(currentUser.uid, (homesData) => {
        setHomes(homesData);
        
        // Pre-select the zone if preSelectedZoneId is provided
        if (preSelectedZoneId && !selectedHomeIds.includes(preSelectedZoneId)) {
          setSelectedHomeIds([preSelectedZoneId]);
        }
      });
      return unsubscribe;
    }
  }, [preSelectedZoneId]);

  const toggleHomeSelection = (homeId: string) => {
    setSelectedHomeIds(prev =>
      prev.includes(homeId)
        ? prev.filter(id => id !== homeId)
        : [...prev, homeId]
    );
  };

  // Check if there are any new zones available to share
  const hasNewZonesAvailable = () => {
    const existingZoneIds = new Set<string>();
    selectedFriends.forEach(friend => {
      if (friend.existingSharedZones) {
        friend.existingSharedZones.forEach(zoneId => existingZoneIds.add(zoneId));
      }
    });
    
    // Check if there are any zones not already connected
    return homes.some(h => !existingZoneIds.has(h.id));
  };

  const handleSendInvitations = async () => {
    // Check if already connected to all zones
    if (!hasNewZonesAvailable()) {
      Alert.alert(
        'Already Connected',
        'You are already sharing all your zones with this person.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Zone selection is now optional - users can connect without sharing zones initially

    const currentUser = auth.currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'You must be signed in to send invitations.');
      return;
    }

    setLoading(true);

    try {
      const userData = await getUserData(currentUser.uid);
      if (!userData) {
        Alert.alert('Error', 'User data not found. Please try again.');
        setLoading(false);
        return;
      }

      let successCount = 0;
      let errorMessages: string[] = [];

      for (const friend of selectedFriends) {
        try {
          await sendFriendRequest(
            currentUser.uid,
            friend.phoneNumber,
            userData.name,
            selectedHomeIds,
            false,
            0.5
          );
          successCount++;
        } catch (error) {
          logger.error(`Error sending invitation to ${friend.name}:`, error);
          errorMessages.push(`${friend.name}: ${(error as Error).message}`);
        }
      }

      setLoading(false);

      if (successCount > 0) {
        const zoneNames = selectedHomeIds.map(homeId => {
          const home = homes.find(h => h.id === homeId);
          return home?.name || 'Unknown Zone';
        }).join(', ');

        Alert.alert(
          'Invitations Sent!',
          `Successfully sent ${successCount} invitation${successCount !== 1 ? 's' : ''} to join: ${zoneNames}`,
          [
            {
              text: 'OK',
              onPress: () => navigation.navigate('Main' as never),
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
    } catch (error) {
      setLoading(false);
      logger.error('Error in handleSendInvitations:', error);
      Alert.alert('Error', 'Failed to send invitations. Please try again.');
    }
  };

  const noNewZones = !hasNewZonesAvailable();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Select Zones</Text>
        <TouchableOpacity 
          onPress={handleSendInvitations} 
          disabled={loading || noNewZones}
        >
          <Text style={[
            styles.sendButton, 
            (loading || noNewZones) && styles.sendButtonDisabled
          ]}>
            {loading ? 'Sending...' : 'Send'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summarySection}>
          <Text style={styles.summaryTitle}>
            Inviting {selectedFriends.length} friend{selectedFriends.length !== 1 ? 's' : ''}:
          </Text>
          <ScrollView 
            style={styles.friendsList}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            {selectedFriends.map((friend, index) => (
              <View key={index} style={styles.friendItem}>
                <Text style={styles.friendName}>{friend.name}</Text>
                <Text style={styles.friendPhone}>
                  {friend.phoneNumber.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3')}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.zonesSection}>
          {/* Check if any friends have existing shared zones */}
          {(() => {
            const existingZoneIds = new Set<string>();
            selectedFriends.forEach(friend => {
              if (friend.existingSharedZones) {
                friend.existingSharedZones.forEach(zoneId => existingZoneIds.add(zoneId));
              }
            });
            
            const alreadyConnectedHomes = homes.filter(h => existingZoneIds.has(h.id));
            
            // Split new invite homes into pre-selected and other zones
            const preSelectedHome = preSelectedZoneId 
              ? homes.find(h => h.id === preSelectedZoneId && !existingZoneIds.has(h.id))
              : null;
            const otherNewInviteHomes = homes.filter(h => 
              !existingZoneIds.has(h.id) && h.id !== preSelectedZoneId
            );
            
            return (
              <>
                {/* Message when all zones are already connected */}
                {alreadyConnectedHomes.length > 0 && otherNewInviteHomes.length === 0 && !preSelectedHome && (
                  <View style={styles.alreadyConnectedMessage}>
                    <Text style={styles.alreadyConnectedTitle}>✅ Already Connected</Text>
                    <Text style={styles.alreadyConnectedText}>
                      You're already sharing all your zones with this person.
                    </Text>
                  </View>
                )}
                
                {/* Already Connected Section */}
                {alreadyConnectedHomes.length > 0 && (
                  <View style={styles.zoneGroup}>
                    <Text style={styles.zoneGroupTitle}>✅ Already Connected</Text>
                    <View style={styles.zonesList}>
                      {alreadyConnectedHomes.map(home => (
                        <View key={home.id} style={styles.zoneItem}>
                          <View style={styles.checkboxContainer}>
                            <View style={[styles.checkbox, styles.checkboxDisabled]}>
                              <Ionicons name="checkmark" size={18} color="#CCCCCC" />
                            </View>
                          </View>
                          <View style={styles.zoneInfo}>
                            <Text style={[styles.zoneName, {color: '#999999'}]}>{home.name}</Text>
                            <Text style={styles.zoneDescription}>
                              {home.members?.length || 0} member{(home.members?.length || 0) !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
                
                {/* Pre-selected Zone Section (if exists and not already connected) */}
                {preSelectedHome && (
                  <View style={styles.zoneGroup}>
                    <View style={styles.zonesList}>
                      <TouchableOpacity
                        key={preSelectedHome.id}
                        style={styles.zoneItem}
                        onPress={() => toggleHomeSelection(preSelectedHome.id)}
                      >
                        <View style={styles.checkboxContainer}>
                          <TouchableOpacity
                            style={[
                              styles.checkbox,
                              selectedHomeIds.includes(preSelectedHome.id) && styles.checkboxSelected
                            ]}
                            onPress={() => toggleHomeSelection(preSelectedHome.id)}
                          >
                            {selectedHomeIds.includes(preSelectedHome.id) && (
                              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                            )}
                          </TouchableOpacity>
                        </View>
                        <View style={styles.zoneInfo}>
                          <Text style={styles.zoneName}>{preSelectedHome.name}</Text>
                          <Text style={styles.zoneDescription}>
                            {preSelectedHome.members?.length || 0} member{(preSelectedHome.members?.length || 0) !== 1 ? 's' : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                
                {/* Other Zones Section */}
                {otherNewInviteHomes.length > 0 && (
                  <View style={styles.zoneGroup}>
                    <Text style={styles.zoneGroupTitle}>
                      {preSelectedHome ? 'Add other zones?' : (alreadyConnectedHomes.length > 0 ? '📍 New Invite' : 'Select zones to share (optional):')}
                    </Text>
                    <View style={styles.zonesList}>
                      {otherNewInviteHomes.map(home => (
                        <TouchableOpacity
                          key={home.id}
                          style={styles.zoneItem}
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
                          <View style={styles.zoneInfo}>
                            <Text style={styles.zoneName}>{home.name}</Text>
                            <Text style={styles.zoneDescription}>
                              {home.members?.length || 0} member{(home.members?.length || 0) !== 1 ? 's' : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                
                {homes.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      Create a zone first, then invite friends to share it.
                    </Text>
                    <TouchableOpacity 
                      style={styles.createZoneButton}
                      onPress={() => navigation.goBack()}
                    >
                      <Text style={styles.createZoneButtonText}>Go to Zones</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            );
          })()}
        </View>

      </ScrollView>
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
    fontSize: 18,
    fontWeight: '600',
    color: '#222222',
  },
  backButton: {
    fontSize: 16,
    color: '#666666',
  },
  sendButton: {
    fontSize: 17,
    color: '#FF5A5F',
    fontWeight: '700',
  },
  sendButtonDisabled: {
    color: '#CCCCCC',
  },
  content: {
    flex: 1,
  },
  summarySection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 24,
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  friendsList: {
    maxHeight: 100,
  },
  friendItem: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  friendName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#222222',
  },
  friendPhone: {
    fontSize: 12,
    color: '#666666',
    marginTop: 1,
  },
  zonesSection: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  zoneGroup: {
    marginBottom: 16,
  },
  zoneGroupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  alreadyConnectedMessage: {
    backgroundColor: '#F0F9FF',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#B3E0FF',
  },
  alreadyConnectedTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0066CC',
    marginBottom: 8,
  },
  alreadyConnectedText: {
    fontSize: 15,
    color: '#555555',
    lineHeight: 22,
  },
  checkboxDisabled: {
    backgroundColor: '#F0F0F0',
    borderColor: '#DDDDDD',
  },
  zonesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 16,
  },
  zonesList: {
    // No flex needed, will expand naturally
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 8,
    borderRadius: 10,
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
  zoneInfo: {
    flex: 1,
  },
  zoneName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#222222',
    marginBottom: 4,
  },
  zoneDescription: {
    fontSize: 14,
    color: '#666666',
  },
  selectionSummary: {
    backgroundColor: '#E8F5E8',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  selectionText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 20,
  },
  createZoneButton: {
    backgroundColor: '#FF5A5F',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  createZoneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
