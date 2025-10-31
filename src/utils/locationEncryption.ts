/**
 * Location Data Encryption Utility
 * Encrypts GPS coordinates before storing in Firestore
 * Protects user privacy if database is compromised
 */

import * as Crypto from 'expo-crypto';

// Encryption key - In production, this should be stored securely
// Options: 
// 1. Environment variable
// 2. Secure storage (expo-secure-store)
// 3. Derived from user's auth token
const ENCRYPTION_KEY = 'HOMER_LOCATION_ENCRYPTION_KEY_2025'; // 32 chars for AES-256

/**
 * Simple encryption using XOR cipher with hashed key
 * Note: For production, consider using expo-crypto's stronger encryption
 */
async function simpleEncrypt(text: string, key: string): Promise<string> {
  // Hash the key to get consistent length
  const hashedKey = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    key
  );
  
  // Convert text to bytes
  const textBytes = new TextEncoder().encode(text);
  const keyBytes = new TextEncoder().encode(hashedKey);
  
  // XOR encryption
  const encrypted = new Uint8Array(textBytes.length);
  for (let i = 0; i < textBytes.length; i++) {
    encrypted[i] = textBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // Convert to base64
  return btoa(String.fromCharCode(...encrypted));
}

/**
 * Simple decryption using XOR cipher with hashed key
 */
async function simpleDecrypt(encryptedText: string, key: string): Promise<string> {
  try {
    // Hash the key to get consistent length
    const hashedKey = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key
    );
    
    // Convert from base64
    const encrypted = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
    const keyBytes = new TextEncoder().encode(hashedKey);
    
    // XOR decryption (same as encryption)
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }
    
    // Convert back to string
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt location data');
  }
}

/**
 * Encrypt GPS coordinates
 */
export async function encryptLocation(latitude: number, longitude: number): Promise<string> {
  const locationString = `${latitude},${longitude}`;
  return await simpleEncrypt(locationString, ENCRYPTION_KEY);
}

/**
 * Decrypt GPS coordinates
 */
export async function decryptLocation(encryptedLocation: string): Promise<{ latitude: number; longitude: number }> {
  const decrypted = await simpleDecrypt(encryptedLocation, ENCRYPTION_KEY);
  const [latStr, lonStr] = decrypted.split(',');
  
  return {
    latitude: parseFloat(latStr),
    longitude: parseFloat(lonStr)
  };
}

/**
 * Encrypt location object (with address)
 */
export async function encryptLocationObject(location: {
  latitude: number;
  longitude: number;
  address?: string;
}): Promise<{
  encryptedCoordinates: string;
  address?: string; // Address is less sensitive, can remain unencrypted
}> {
  const encryptedCoordinates = await encryptLocation(location.latitude, location.longitude);
  
  return {
    encryptedCoordinates,
    address: location.address
  };
}

/**
 * Decrypt location object
 */
export async function decryptLocationObject(encryptedLocation: {
  encryptedCoordinates: string;
  address?: string;
}): Promise<{
  latitude: number;
  longitude: number;
  address?: string;
}> {
  const { latitude, longitude } = await decryptLocation(encryptedLocation.encryptedCoordinates);
  
  return {
    latitude,
    longitude,
    address: encryptedLocation.address
  };
}

/**
 * Check if location data is encrypted
 */
export function isLocationEncrypted(location: any): boolean {
  return location && typeof location.encryptedCoordinates === 'string';
}

/**
 * Migrate unencrypted location to encrypted format
 */
export async function migrateLocationToEncrypted(location: {
  latitude?: number;
  longitude?: number;
  address?: string;
}): Promise<{
  encryptedCoordinates: string;
  address?: string;
} | null> {
  if (!location.latitude || !location.longitude) {
    return null;
  }
  
  return await encryptLocationObject({
    latitude: location.latitude,
    longitude: location.longitude,
    address: location.address
  });
}

/**
 * Example usage:
 * 
 * // Encrypt before storing
 * const encrypted = await encryptLocation(42.3506, -71.0740);
 * await updateDoc(userRef, { lastLocation: encrypted });
 * 
 * // Decrypt when reading
 * const location = await decryptLocation(userData.lastLocation);
 * console.log(location.latitude, location.longitude);
 */
