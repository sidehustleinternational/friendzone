/**
 * FriendZone App - Location sharing with friends at specific zones
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { runDataRetentionCleanup, shouldRunCleanup, markCleanupCompleted } from './src/utils/dataRetention';

// CRITICAL: Import locationServiceV3 at app startup to register geofencing task
// This must happen BEFORE the app terminates so iOS can wake the app for geofence events
import './src/services/locationServiceV3';
import { quickLocationCheck } from './src/services/locationServiceV3';
import { auth } from './firebaseConfig';

export default function App() {
  // Run cleanup on app startup (notifications will be requested after auth)
  useEffect(() => {
    const initializeApp = async () => {
      // Run data retention cleanup (once per day)
      if (shouldRunCleanup()) {
        console.log('🗑️ Running scheduled data retention cleanup...');
        const results = await runDataRetentionCleanup();
        console.log('✅ Cleanup complete:', results);
        markCleanupCompleted();
      } else {
        console.log('⏭️ Skipping cleanup - already ran today');
      }

      // Force location refresh on app startup if user is authenticated
      // This ensures location is updated even if geofences haven't fired
      const unsubscribe = auth.onAuthStateChanged(async (user) => {
        if (user) {
          console.log('📍 User authenticated - checking location...');
          try {
            await quickLocationCheck();
            console.log('✅ Location check complete');
          } catch (error) {
            console.error('❌ Failed to check location on startup:', error);
          }
        }
      });

      return unsubscribe;
    };

    // Run initialization after a short delay to not block app startup
    const timer = setTimeout(initializeApp, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
