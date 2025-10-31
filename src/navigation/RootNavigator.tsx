import React, {useState, useEffect} from 'react';
import {Alert} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import {RootStackParamList} from '../types';
import AuthScreen from '../screens/AuthScreen';
import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import MainTabNavigator from './MainTabNavigator';
import AddFriendsScreen from '../screens/AddFriendsScreen';
import SelectFriendsScreen from '../screens/SelectFriendsScreen';
import SelectZonesScreen from '../screens/SelectZonesScreen';
import ProfileScreen from '../screens/ProfileScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import TermsOfServiceScreen from '../screens/TermsOfServiceScreen';
import {auth} from '../../firebaseConfig';
import {onAuthStateChanged} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

const Stack = createStackNavigator<RootStackParamList>();

type AppState = 'loading' | 'onboarding' | 'auth' | 'main';

export default function RootNavigator() {
  const [appState, setAppState] = useState<AppState>('loading');
  
  // Debug wrapper for setAppState
  const setAppStateWithDebug = (newState: AppState) => {
    setAppState(newState);
  };

  useEffect(() => {
    initializeApp();
    
    // Poll for profile completion flag (needed because it's set asynchronously)
    const intervalId = setInterval(async () => {
      try {
        const completed = await AsyncStorage.getItem('profileCompleted');
        if (completed === 'true') {
          logger.debug('✅ Profile completion flag detected!');
          await AsyncStorage.removeItem('profileCompleted');
          
          // Check if user has seen onboarding
          const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
          if (!hasSeenOnboarding) {
            logger.debug('👋 Navigating to onboarding...');
            setAppStateWithDebug('onboarding');
          } else {
            logger.debug('🏠 Navigating to main...');
            setAppStateWithDebug('main');
          }
        }
      } catch (error) {
        logger.error('❌ Error checking profile completion flag:', error);
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(intervalId);
  }, []);

  const initializeApp = async () => {
    // Set up auth listener
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      logger.debug('🔐 onAuthStateChanged fired');
      
      if (!user) {
        logger.debug('❌ No user - going to auth screen');
        setAppStateWithDebug('auth');
        return;
      }
      
      logger.debug('✅ User signed in:', user.uid);
      logger.debug('📧 Email:', user.email);
      
      // User is signed in - check if they have a complete profile
      const { db } = await import('../../firebaseConfig');
      const { doc, getDoc } = await import('firebase/firestore');
      
      try {
        logger.debug('📄 Fetching user document...');
        
        // Wait a moment for auth token to propagate to Firestore
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        
        if (!userDoc.exists()) {
          logger.debug('❌ User document does not exist - staying on auth');
          setAppStateWithDebug('auth');
          return;
        }
        
        const userData = userDoc.data();
        logger.debug('📋 User data:', JSON.stringify(userData, null, 2));
        
        if (!userData?.phoneNumber) {
          logger.debug('❌ Missing phone number - staying on auth');
          setAppStateWithDebug('auth');
          return;
        }
        
        logger.debug('✅ User has phone number:', userData.phoneNumber);
        
        // User has complete profile - register for push notifications
        try {
          const { registerForPushNotifications } = await import('../services/notificationService');
          const token = await registerForPushNotifications();
          if (token) {
            logger.debug('✅ Push notifications registered successfully');
          } else {
            logger.debug('⚠️ Push notification registration failed or denied');
          }
        } catch (notificationError) {
          logger.error('❌ Error registering for push notifications:', notificationError);
        }
        
        // Check if they've seen onboarding
        const hasSeenOnboarding = await AsyncStorage.getItem('hasSeenOnboarding');
        logger.debug('🎓 Has seen onboarding:', hasSeenOnboarding);
        
        // TEMPORARY: Skip onboarding in dev mode
        if (__DEV__) {
          logger.debug('🔧 Dev mode - skipping onboarding, going to main');
          setAppStateWithDebug('main');
        } else if (!hasSeenOnboarding) {
          logger.debug('🎓 First time user - showing onboarding');
          setAppStateWithDebug('onboarding');
        } else {
          logger.debug('🏠 Returning user - going to main');
          setAppStateWithDebug('main');
        }
        
        logger.debug('📍 Final appState will be:', __DEV__ ? 'main' : (!hasSeenOnboarding ? 'onboarding' : 'main'));
      } catch (error) {
        logger.error('❌ Error checking user document:', error);
        // On error, stay on auth to be safe
        setAppStateWithDebug('auth');
      }
    });
    
    return unsubscribe;
  };

  const handleOnboardingComplete = async () => {
    await AsyncStorage.setItem('hasSeenOnboarding', 'true');
    setAppStateWithDebug('main');
  };

  // Render based on app state
  if (appState === 'loading') {
    return null; // or <LoadingScreen />
  }

  if (appState === 'onboarding') {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Splash">
            {() => <OnboardingScreen onDone={handleOnboardingComplete} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Show auth screen explicitly when in auth state
  if (appState === 'auth') {
    return (
      <NavigationContainer key="auth-nav">
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Auth" component={AuthScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  // Main app (only when appState === 'main')
  return (
    <NavigationContainer key="main-nav">
      <Stack.Navigator
        initialRouteName="Main"
        screenOptions={{
          headerShown: false,
        }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen
          name="AddFriends"
          component={AddFriendsScreen}
          options={{
            headerShown: true,
            title: 'Invite Friends to Zone',
            headerStyle: {
              backgroundColor: '#FFFFFF',
            },
            headerTintColor: '#222222',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        />
        <Stack.Screen
          name="SelectFriends"
          component={SelectFriendsScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="SelectZones"
          component={SelectZonesScreen}
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="Profile"
          component={ProfileScreen}
          options={{
            headerShown: true,
            title: 'Profile',
            headerStyle: {
              backgroundColor: '#FFFFFF',
            },
            headerTintColor: '#222222',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        />
        <Stack.Screen
          name="PrivacyPolicy"
          component={PrivacyPolicyScreen}
          options={{
            headerShown: true,
            title: 'Privacy Policy',
            headerStyle: {
              backgroundColor: '#FFFFFF',
            },
            headerTintColor: '#222222',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        />
        <Stack.Screen
          name="TermsOfService"
          component={TermsOfServiceScreen}
          options={{
            headerShown: true,
            title: 'Terms of Service',
            headerStyle: {
              backgroundColor: '#FFFFFF',
            },
            headerTintColor: '#222222',
            headerTitleStyle: {
              fontWeight: '600',
            },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}