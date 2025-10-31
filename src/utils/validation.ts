/**
 * Input Validation and Sanitization Utilities
 * Protects against injection attacks and malformed data
 */

/**
 * Sanitize string input - removes potentially dangerous characters
 */
export const sanitizeString = (input: string, maxLength: number = 100): string => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ''); // Remove control characters, keep unicode
};

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validate phone number format
 */
export const validatePhoneNumber = (phone: string): boolean => {
  if (!phone || typeof phone !== 'string') return false;
  
  const digits = phone.replace(/\D/g, '');
  // US numbers: 10 digits or 11 with leading 1
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1');
};

/**
 * Validate coordinates are within valid ranges
 */
export const validateCoordinates = (lat: number, lon: number): boolean => {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (isNaN(lat) || isNaN(lon)) return false;
  
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
};

/**
 * Validate and sanitize user name
 */
export const validateUserName = (name: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!name || typeof name !== 'string') {
    return { valid: false, sanitized: '', error: 'Name is required' };
  }
  
  const sanitized = sanitizeString(name, 50);
  
  if (sanitized.length < 2) {
    return { valid: false, sanitized, error: 'Name must be at least 2 characters' };
  }
  
  if (sanitized.length > 50) {
    return { valid: false, sanitized, error: 'Name must be less than 50 characters' };
  }
  
  return { valid: true, sanitized };
};

/**
 * Validate and sanitize home/zone name
 */
export const validateHomeName = (name: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!name || typeof name !== 'string') {
    return { valid: false, sanitized: '', error: 'Zone name is required' };
  }
  
  const sanitized = sanitizeString(name, 100);
  
  if (sanitized.length < 1) {
    return { valid: false, sanitized, error: 'Zone name cannot be empty' };
  }
  
  if (sanitized.length > 100) {
    return { valid: false, sanitized, error: 'Zone name must be less than 100 characters' };
  }
  
  return { valid: true, sanitized };
};

/**
 * Validate and sanitize address
 */
export const validateAddress = (address: string): { valid: boolean; sanitized: string; error?: string } => {
  if (!address || typeof address !== 'string') {
    return { valid: false, sanitized: '', error: 'Address is required' };
  }
  
  const sanitized = sanitizeString(address, 200);
  
  if (sanitized.length < 5) {
    return { valid: false, sanitized, error: 'Address must be at least 5 characters' };
  }
  
  if (sanitized.length > 200) {
    return { valid: false, sanitized, error: 'Address must be less than 200 characters' };
  }
  
  return { valid: true, sanitized };
};

/**
 * Validate radius for proximity alerts
 */
export const validateProximityRadius = (radius: number): boolean => {
  if (typeof radius !== 'number' || isNaN(radius)) return false;
  
  // Valid radii: 0.25, 0.5, 1, 2, 5 miles
  const validRadii = [0.25, 0.5, 1, 2, 5];
  return validRadii.includes(radius);
};

/**
 * Validate home/zone radius
 */
export const validateZoneRadius = (radius: number): boolean => {
  if (typeof radius !== 'number' || isNaN(radius)) return false;
  
  // Radius must be between 0.01 and 10 miles
  return radius >= 0.01 && radius <= 10;
};

/**
 * Sanitize and validate location data
 */
export const validateLocationData = (data: any): { 
  valid: boolean; 
  sanitized?: { latitude: number; longitude: number; accuracy: number; timestamp: number };
  error?: string;
} => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid location data' };
  }
  
  const { latitude, longitude, accuracy, timestamp } = data;
  
  // Validate coordinates
  if (!validateCoordinates(latitude, longitude)) {
    return { valid: false, error: 'Invalid coordinates' };
  }
  
  // Validate accuracy (should be positive number)
  if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 10000) {
    return { valid: false, error: 'Invalid accuracy value' };
  }
  
  // Validate timestamp (should be recent)
  if (typeof timestamp !== 'number' || timestamp < 0) {
    return { valid: false, error: 'Invalid timestamp' };
  }
  
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  if (timestamp < oneHourAgo || timestamp > now + 60000) {
    return { valid: false, error: 'Timestamp out of valid range' };
  }
  
  return {
    valid: true,
    sanitized: {
      latitude: Number(latitude),
      longitude: Number(longitude),
      accuracy: Number(accuracy),
      timestamp: Number(timestamp)
    }
  };
};

/**
 * Validate friend request data
 */
export const validateFriendRequest = (data: any): { valid: boolean; error?: string } => {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request data' };
  }
  
  const { fromUserId, toPhoneNumber, fromUserName } = data;
  
  if (!fromUserId || typeof fromUserId !== 'string') {
    return { valid: false, error: 'Invalid sender ID' };
  }
  
  if (!toPhoneNumber || !validatePhoneNumber(toPhoneNumber)) {
    return { valid: false, error: 'Invalid phone number' };
  }
  
  if (!fromUserName || typeof fromUserName !== 'string' || fromUserName.trim().length < 2) {
    return { valid: false, error: 'Invalid sender name' };
  }
  
  return { valid: true };
};

/**
 * Rate limiting helper - check if action is allowed based on last action time
 */
export const checkRateLimit = (
  lastActionTime: number | undefined,
  minIntervalMs: number
): { allowed: boolean; waitTime?: number } => {
  if (!lastActionTime) {
    return { allowed: true };
  }
  
  const now = Date.now();
  const timeSinceLastAction = now - lastActionTime;
  
  if (timeSinceLastAction < minIntervalMs) {
    const waitTime = minIntervalMs - timeSinceLastAction;
    return { allowed: false, waitTime };
  }
  
  return { allowed: true };
};

/**
 * Sanitize object for Firebase storage - removes undefined and null values
 */
export const sanitizeForFirebase = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirebase);
  
  const sanitized: any = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== undefined && value !== null) {
      sanitized[key] = typeof value === 'object' ? sanitizeForFirebase(value) : value;
    }
  }
  return sanitized;
};
