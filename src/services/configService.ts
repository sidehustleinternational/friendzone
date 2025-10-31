/**
 * App Configuration Service
 * Manages externalized config values stored in Firestore
 * Allows updating URLs and settings without app rebuilds
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { logger } from '../utils/logger';

interface AppConfig {
  app_store_url: string;
  sms_invite_enabled: boolean;
  updated_at: number;
}

const DEFAULT_CONFIG: AppConfig = {
  app_store_url: 'https://jamiegoldstein.github.io/homer',
  sms_invite_enabled: true,
  updated_at: Date.now()
};

// Cache config for 5 minutes to avoid excessive Firestore reads
let configCache: { config: AppConfig; timestamp: number } | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get app configuration from Firestore with caching
 */
export async function getAppConfig(): Promise<AppConfig> {
  try {
    // Check cache first
    if (configCache && (Date.now() - configCache.timestamp) < CACHE_DURATION) {
      logger.debug('📋 Using cached app config');
      return configCache.config;
    }

    logger.debug('📋 Fetching app config from Firestore...');
    
    const configDoc = await getDoc(doc(db, 'config', 'app_settings'));
    
    if (configDoc.exists()) {
      const config = configDoc.data() as AppConfig;
      logger.debug('✅ App config loaded:', config);
      
      // Update cache
      configCache = {
        config,
        timestamp: Date.now()
      };
      
      return config;
    } else {
      logger.debug('⚠️ No config found, creating default config...');
      await createDefaultConfig();
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    logger.error('❌ Error fetching app config:', error);
    logger.debug('🔄 Falling back to default config');
    return DEFAULT_CONFIG;
  }
}

/**
 * Get specific config value
 */
export async function getConfigValue<K extends keyof AppConfig>(key: K): Promise<AppConfig[K]> {
  const config = await getAppConfig();
  return config[key];
}

/**
 * Update app configuration (admin function)
 */
export async function updateAppConfig(updates: Partial<AppConfig>): Promise<void> {
  try {
    const currentConfig = await getAppConfig();
    const newConfig: AppConfig = {
      ...currentConfig,
      ...updates,
      updated_at: Date.now()
    };

    await setDoc(doc(db, 'config', 'app_settings'), newConfig);
    
    // Clear cache to force refresh
    configCache = null;
    
    logger.debug('✅ App config updated:', newConfig);
  } catch (error) {
    logger.error('❌ Error updating app config:', error);
    throw error;
  }
}

/**
 * Create default configuration document
 */
async function createDefaultConfig(): Promise<void> {
  try {
    await setDoc(doc(db, 'config', 'app_settings'), DEFAULT_CONFIG);
    logger.debug('✅ Default app config created');
  } catch (error) {
    logger.error('❌ Error creating default config:', error);
  }
}

/**
 * Get App Store URL for SMS invitations
 */
export async function getAppStoreUrl(): Promise<string> {
  return await getConfigValue('app_store_url');
}

/**
 * Check if SMS invites are enabled
 */
export async function isSMSInviteEnabled(): Promise<boolean> {
  return await getConfigValue('sms_invite_enabled');
}
