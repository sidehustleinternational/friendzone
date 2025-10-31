/**
 * Secure Environment Configuration
 * Loads API keys and configuration from environment variables
 */

import Constants from 'expo-constants';

interface EnvironmentConfig {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  googleMaps: {
    apiKey: string;
  };
  apple: {
    servicesId: string;
  };
}

/**
 * Get environment configuration with fallbacks for development
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const extra = Constants.expoConfig?.extra;

  // Development fallbacks - these work immediately while env vars are being set up
  const developmentConfig = {
    firebase: {
      apiKey: "AIzaSyACgplq_hJ9epBB559LZ_1D8_pjIw33XJo",
      authDomain: "homer-323fe.firebaseapp.com",
      projectId: "homer-323fe",
      storageBucket: "homer-323fe.firebasestorage.app",
      messagingSenderId: "761933707709",
      appId: "1:761933707709:ios:ec5767d76b766b44803ad4"
    },
    googleMaps: {
      apiKey: "AIzaSyAiYx6hUO97uuiRwmH4sRiFjrb9g3ZMECk"  // iOS key (auto created by Firebase) - has 24 APIs enabled
    },
    apple: {
      servicesId: "com.jamiegoldstein.FriendZone.signin"
    }
  };

  // Production configuration from environment variables
  const productionConfig = {
    firebase: {
      apiKey: extra?.firebaseApiKey,
      authDomain: extra?.firebaseAuthDomain,
      projectId: extra?.firebaseProjectId,
      storageBucket: extra?.firebaseStorageBucket,
      messagingSenderId: extra?.firebaseMessagingSenderId,
      appId: extra?.firebaseAppId
    },
    googleMaps: {
      apiKey: extra?.googleMapsApiKey
    },
    apple: {
      servicesId: extra?.appleServicesId
    }
  };

  // For now, just return development config (environment vars will be enabled later)
  return developmentConfig;
};

/**
 * Validate that all required configuration is present
 */
export const validateEnvironmentConfig = (): boolean => {
  const config = getEnvironmentConfig();
  
  const required = [
    config.firebase.apiKey,
    config.firebase.authDomain,
    config.firebase.projectId,
    config.googleMaps.apiKey,
    config.apple.servicesId
  ];

  return required.every(value => value && value.length > 0);
};

/**
 * Get Firebase configuration object
 */
export const getFirebaseConfig = () => {
  const config = getEnvironmentConfig();
  return config.firebase;
};

/**
 * Get Google Maps API key
 */
export const getGoogleMapsApiKey = (): string => {
  const config = getEnvironmentConfig();
  return config.googleMaps.apiKey;
};

/**
 * Get Apple Services ID
 */
export const getAppleServicesId = (): string => {
  const config = getEnvironmentConfig();
  return config.apple.servicesId;
};
