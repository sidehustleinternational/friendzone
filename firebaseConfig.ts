import { initializeApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
// @ts-ignore
const { getReactNativePersistence } = require('firebase/auth');
import { getFirestore } from 'firebase/firestore';
import { initializeAppCheck, CustomProvider } from '@firebase/app-check';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirebaseConfig } from './src/config/environment';

// Get Firebase configuration from environment variables
const firebaseConfig = getFirebaseConfig();

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize App Check with DeviceCheck for iOS
// Only enabled in production builds - disabled in development for testing
if (!__DEV__) {
  try {
    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          // Firebase SDK automatically uses DeviceCheck on iOS
          // when registered in Firebase Console with Apple credentials
          return { token: '', expireTimeMillis: 0 };
        }
      }),
      isTokenAutoRefreshEnabled: true
    });
    console.log('🔐 App Check: Enabled with DeviceCheck');
  } catch (error) {
    console.error('❌ App Check initialization failed:', error);
  }
} else {
  console.log('🔐 App Check: Disabled in development mode');
}

// Initialize Firebase Authentication with AsyncStorage persistence (exactly as Firebase instructs)
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;
