import {Platform} from 'react-native';
import { logger } from '../utils/logger';

// Geocoding service using Google Maps Geocoding API
// Expects an API key provided at runtime (e.g., from an .env via react-native-config later).
// For now, allow passing the API key as an argument to avoid build-time env needs.

export type GeocodeQuery = {
  // e.g., "05672" or "Stowe, VT"
  address: string;
};

export type LatLng = { latitude: number; longitude: number };

// Helper function to parse coordinate strings like "44.4654, -72.6874"
function parseCoordinates(address: string): LatLng | null {
  const coordPattern = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;
  const match = address.trim().match(coordPattern);
  
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    // Basic validation
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { latitude: lat, longitude: lng };
    }
  }
  
  return null;
}

async function geocodeWithRetry(url: string, maxRetries: number = 2): Promise<any> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
      logger.debug(`🔄 Geocoding attempt ${attempt + 1}/${maxRetries + 1}`);
      
      const resp = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      logger.debug('📡 Response status:', resp.status);
      
      if (!resp.ok) {
        throw new Error(`Geocoding failed with status ${resp.status}`);
      }
      
      const data = await resp.json();
      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;
      
      // Don't retry on timeout or if it's the last attempt
      if (error.name === 'AbortError' || attempt === maxRetries) {
        break;
      }
      
      // Wait before retrying (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt), 3000);
      logger.debug(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw lastError;
}

export async function geocodeAddress(query: GeocodeQuery, apiKey: string): Promise<LatLng> {
  // First, try to parse as coordinates
  const coords = parseCoordinates(query.address);
  if (coords) {
    logger.debug('📍 Parsed as coordinates:', coords);
    return coords;
  }

  if (!apiKey) {
    throw new Error('Google Maps API key is required for geocoding');
  }

  const encoded = encodeURIComponent(query.address.trim());
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;

  logger.debug('🗺️ Geocoding URL:', url);
  logger.debug('🔑 API Key length:', apiKey.length);
  logger.debug('🔑 API Key preview:', apiKey.substring(0, 20) + '...');

  try {
    const data = await geocodeWithRetry(url);
    logger.debug('📊 Response data:', JSON.stringify(data, null, 2));
    
    if (data.status !== 'OK' || !data.results?.length) {
      const reason = data.error_message || data.status || 'UNKNOWN_ERROR';
      
      // If it's a permissions issue, provide helpful fallback
      if (data.status === 'REQUEST_DENIED' || reason.includes('permission')) {
        throw new Error(`Geocoding API access denied. Try entering coordinates directly (e.g., "44.4654, -72.6874") or check API key permissions.`);
      }
      
      throw new Error(`Geocoding returned no results: ${reason}`);
    }
    const loc = data.results[0].geometry.location;
    return { latitude: loc.lat, longitude: loc.lng };
  } catch (error: any) {
    // Handle timeout
    if (error.name === 'AbortError') {
      logger.error('⏱️ Geocoding request timed out after 15 seconds');
      throw new Error('Geocoding request timed out. Please check your internet connection and try again.');
    }
    
    // Handle network errors
    if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
      logger.error('🌐 Network error during geocoding:', error);
      throw new Error('Network error. Please check your internet connection and try again.');
    }
    
    // Re-throw other errors
    throw error;
  }
}

// Reverse geocoding convenience (optional)
export async function reverseGeocode(coords: LatLng, apiKey: string): Promise<string> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Reverse geocoding failed with status ${resp.status}`);
  }
  const data = await resp.json();
  if (data.status !== 'OK' || !data.results?.length) {
    return `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`;
  }
  return data.results[0].formatted_address as string;
}
