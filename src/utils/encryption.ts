/**
 * Location Data Encryption Utilities
 * Provides AES-256 encryption for sensitive location coordinates
 */

import CryptoJS from 'crypto-js';
import * as SecureStore from 'expo-secure-store';

// Encryption key storage key
const ENCRYPTION_KEY_STORAGE = 'location_encryption_key';

/**
 * Generate or retrieve encryption key
 * Stored securely in device keychain/keystore
 */
const getEncryptionKey = async (): Promise<string> => {
  try {
    // Try to get existing key
    let key = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORAGE);
    
    if (!key) {
      // Generate new 256-bit key
      key = CryptoJS.lib.WordArray.random(32).toString();
      await SecureStore.setItemAsync(ENCRYPTION_KEY_STORAGE, key);
      console.log('🔐 Generated new encryption key');
    }
    
    return key;
  } catch (error) {
    console.error('Error managing encryption key:', error);
    // Fallback to a session key (not persisted)
    return CryptoJS.lib.WordArray.random(32).toString();
  }
};

/**
 * Encrypt location coordinates
 */
export const encryptLocation = async (
  latitude: number,
  longitude: number
): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    
    const data = JSON.stringify({
      lat: latitude,
      lon: longitude,
      timestamp: Date.now() // Add timestamp for freshness
    });
    
    const encrypted = CryptoJS.AES.encrypt(data, key).toString();
    return encrypted;
  } catch (error) {
    console.error('Error encrypting location:', error);
    throw new Error('Failed to encrypt location data');
  }
};

/**
 * Decrypt location coordinates
 */
export const decryptLocation = async (
  encrypted: string
): Promise<{ lat: number; lon: number; timestamp: number }> => {
  try {
    const key = await getEncryptionKey();
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, key);
    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedStr) {
      throw new Error('Decryption failed - invalid data');
    }
    
    const data = JSON.parse(decryptedStr);
    
    return {
      lat: Number(data.lat),
      lon: Number(data.lon),
      timestamp: Number(data.timestamp)
    };
  } catch (error) {
    console.error('Error decrypting location:', error);
    throw new Error('Failed to decrypt location data');
  }
};

/**
 * Encrypt location object with all fields
 */
export const encryptLocationObject = async (location: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
  speed?: number;
}): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    
    const data = JSON.stringify({
      ...location,
      timestamp: Date.now()
    });
    
    const encrypted = CryptoJS.AES.encrypt(data, key).toString();
    return encrypted;
  } catch (error) {
    console.error('Error encrypting location object:', error);
    throw new Error('Failed to encrypt location data');
  }
};

/**
 * Decrypt location object
 */
export const decryptLocationObject = async (
  encrypted: string
): Promise<any> => {
  try {
    const key = await getEncryptionKey();
    
    const decrypted = CryptoJS.AES.decrypt(encrypted, key);
    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedStr) {
      throw new Error('Decryption failed - invalid data');
    }
    
    return JSON.parse(decryptedStr);
  } catch (error) {
    console.error('Error decrypting location object:', error);
    throw new Error('Failed to decrypt location data');
  }
};

/**
 * Hash location for comparison without decryption
 * Useful for checking if location changed without exposing coordinates
 */
export const hashLocation = (latitude: number, longitude: number): string => {
  const data = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  return CryptoJS.SHA256(data).toString();
};

/**
 * Clear encryption key (for logout/security)
 */
export const clearEncryptionKey = async (): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(ENCRYPTION_KEY_STORAGE);
    console.log('🔐 Encryption key cleared');
  } catch (error) {
    console.error('Error clearing encryption key:', error);
  }
};

/**
 * Encrypt sensitive string data
 */
export const encryptString = async (data: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    return CryptoJS.AES.encrypt(data, key).toString();
  } catch (error) {
    console.error('Error encrypting string:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt sensitive string data
 */
export const decryptString = async (encrypted: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    const decrypted = CryptoJS.AES.decrypt(encrypted, key);
    const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedStr) {
      throw new Error('Decryption failed');
    }
    
    return decryptedStr;
  } catch (error) {
    console.error('Error decrypting string:', error);
    throw new Error('Failed to decrypt data');
  }
};
