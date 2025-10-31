/**
 * Debug configuration
 * Can be overridden by Firestore config/debug document
 */

// Default settings (used if Firestore config doesn't exist)
let DEBUG_CONFIG = {
  ENABLE_FIRESTORE_LOGGING: true,
  ENABLE_CONSOLE_LOGGING: true,
  LOG_LOCATION_SERVICE: true,
  LOG_UI_RENDERING: true,
};

// Load config from Firestore on app start
let configLoaded = false;

export const loadDebugConfig = async () => {
  if (configLoaded) return DEBUG_CONFIG;
  
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../../firebaseConfig');
    
    const configDoc = await getDoc(doc(db, 'config', 'debug'));
    if (configDoc.exists()) {
      const data = configDoc.data();
      DEBUG_CONFIG = {
        ENABLE_FIRESTORE_LOGGING: data.enableFirestoreLogging ?? true,
        ENABLE_CONSOLE_LOGGING: data.enableConsoleLogging ?? true,
        LOG_LOCATION_SERVICE: data.logLocationService ?? true,
        LOG_UI_RENDERING: data.logUIRendering ?? true,
      };
      console.log('📋 Debug config loaded from Firestore:', DEBUG_CONFIG);
    }
    configLoaded = true;
  } catch (error) {
    console.log('⚠️  Using default debug config');
  }
  
  return DEBUG_CONFIG;
};

export { DEBUG_CONFIG };

// Helper function to check if debug logging is enabled
export const isDebugEnabled = () => {
  return __DEV__ || DEBUG_CONFIG.ENABLE_FIRESTORE_LOGGING;
};

// Helper to log to Firestore if enabled
export const debugLog = async (
  type: string,
  data: Record<string, any>,
  userId?: string
) => {
  if (!DEBUG_CONFIG.ENABLE_FIRESTORE_LOGGING) {
    return;
  }

  try {
    const { addDoc, collection } = await import('firebase/firestore');
    const { db } = await import('../../firebaseConfig');
    
    await addDoc(collection(db, 'debugLogs'), {
      timestamp: Date.now(),
      userId: userId || 'unknown',
      type,
      ...data,
    });
  } catch (error) {
    if (DEBUG_CONFIG.ENABLE_CONSOLE_LOGGING) {
      console.error('Failed to write debug log:', error);
    }
  }
};
