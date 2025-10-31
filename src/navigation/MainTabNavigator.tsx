import React, { useState, useEffect } from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {Text, View, StyleSheet} from 'react-native';
import {MainTabParamList} from '../types';
import HomesScreen from '../screens/HomesScreen';
import TestScreen from '../screens/TestScreen';
import HomesScreenSimple from '../screens/HomesScreenSimple';
import HomesScreenExact from '../screens/HomesScreenExact';
import FriendsScreen from '../screens/FriendsScreen';
import BroadcastScreen from '../screens/BroadcastScreen';
import ProfileScreen from '../screens/ProfileScreen';
import MapScreen from '../screens/MapScreen';
import { subscribeToFriendRequests, createUser } from '../services/firebase';
import { auth } from '../../firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { requestNotificationPermissions } from '../services/notificationService';
import { subscribeFriendLocationNotifications } from '../services/friendNotificationService';
import { logger } from '../utils/logger';

const Tab = createBottomTabNavigator<MainTabParamList>();


export default function MainTabNavigator() {
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    // Clear badge when app opens
    const clearAppBadge = async () => {
      try {
        const Notifications = await import('expo-notifications');
        await Notifications.setBadgeCountAsync(0);
        logger.debug('🔔 Cleared app badge');
      } catch (error) {
        logger.error('Error clearing badge:', error);
      }
    };
    clearAppBadge();

    // Request notification permissions after user is authenticated
    const requestPermissions = async () => {
      logger.debug('📱 Requesting notification permissions after auth...');
      const granted = await requestNotificationPermissions();
      if (granted) {
        logger.debug('✅ Notification permissions granted');
      } else {
        logger.debug('❌ Notification permissions denied');
      }
    };
    requestPermissions();

    // Subscribe to friend requests to show badge
    let unsubscribeFriendRequests = () => {};
    subscribeToFriendRequests(currentUser.uid, (requests) => {
      logger.debug(`🔔 Badge update: ${requests.length} pending friend requests`);
      if (requests.length > 0) {
        logger.debug('📋 Pending requests:', requests.map(r => ({
          id: r.id,
          from: r.fromUserName,
          status: r.status,
          toUserId: r.toUserId,
          toPhone: r.toPhoneNumber
        })));
      }
      setPendingRequestsCount(requests.length);
    }).then(unsub => {
      unsubscribeFriendRequests = unsub;
    });

    // Subscribe to friend location changes for notifications
    logger.debug('📡 Initializing friend location notifications...');
    const unsubscribeFriendLocations = subscribeFriendLocationNotifications(currentUser.uid);

    return () => {
      unsubscribeFriendRequests();
      unsubscribeFriendLocations();
    };
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        tabBarIcon: ({focused}) => {
          let iconName: any;
          switch (route.name) {
            case 'Zones':
              iconName = focused ? 'location' : 'location-outline';
              break;
            case 'Map':
              iconName = focused ? 'map' : 'map-outline';
              break;
            case 'Broadcast':
              iconName = focused ? 'radio' : 'radio-outline';
              break;
            case 'Friends':
              iconName = focused ? 'people' : 'people-outline';
              break;
            case 'Profile':
              iconName = focused ? 'person' : 'person-outline';
              break;
            default:
              iconName = 'help-outline';
          }
          
          return (
            <View style={styles.tabIcon}>
              <Ionicons 
                name={iconName}
                size={24}
                color={focused ? '#FF5A5F' : '#767676'}
              />
              {route.name === 'Friends' && pendingRequestsCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {pendingRequestsCount > 99 ? '99+' : String(pendingRequestsCount)}
                  </Text>
                </View>
              )}
            </View>
          );
        },
        tabBarActiveTintColor: '#FF5A5F',
        tabBarInactiveTintColor: '#767676',
        tabBarStyle: styles.tabBar,
        headerShown: false,
        tabBarLabelStyle: styles.tabBarLabel,
      })}>
      <Tab.Screen name="Zones" component={HomesScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      {/* TEMPORARILY DISABLED - Broadcast feature not ready for production */}
      {/* <Tab.Screen name="Broadcast" component={BroadcastScreen} /> */}
      <Tab.Screen name="Friends" component={FriendsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
    paddingTop: 8,
    paddingBottom: 8,
    height: 80,
  },
  tabIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 30,
    height: 30,
  },
  tabBarLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#FF5A5F',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});