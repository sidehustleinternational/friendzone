/**
 * Location Decryption Service
 * Helper functions for decrypting location data when reading from Firebase
 */

import { decryptLocation } from '../utils/encryption';
import { logger } from '../utils/logger';

/**
 * Decrypt location from Firebase document
 */
export const decryptFirebaseLocation = async (
  locationDoc: any
): Promise<{ latitude: number; longitude: number; accuracy: number; timestamp: number } | null> => {
  try {
    if (!locationDoc || !locationDoc.encryptedLocation) {
      logger.warn('No encrypted location data found');
      return null;
    }
    
    const decrypted = await decryptLocation(locationDoc.encryptedLocation);
    
    return {
      latitude: decrypted.lat,
      longitude: decrypted.lon,
      accuracy: locationDoc.accuracy || 0,
      timestamp: locationDoc.timestamp || decrypted.timestamp
    };
  } catch (error) {
    logger.error('Error decrypting Firebase location:', error);
    return null;
  }
};

/**
 * Decrypt multiple locations (for history/batch operations)
 */
export const decryptMultipleLocations = async (
  locationDocs: any[]
): Promise<Array<{ latitude: number; longitude: number; accuracy: number; timestamp: number }>> => {
  const decrypted = await Promise.all(
    locationDocs.map(doc => decryptFirebaseLocation(doc))
  );
  
  return decrypted.filter(loc => loc !== null) as Array<{ 
    latitude: number; 
    longitude: number; 
    accuracy: number; 
    timestamp: number 
  }>;
};
