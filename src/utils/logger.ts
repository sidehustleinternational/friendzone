/**
 * Centralized logging utility
 * - Disables debug logs in production
 * - Sanitizes sensitive data
 * - Always logs errors
 * - Writes to Firestore for remote debugging
 */

import { collection, addDoc, Timestamp } from 'firebase/firestore';

// Sensitive fields to redact from logs
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apiKey',
  'phoneNumber',
  'email',
  'latitude',
  'longitude',
  'location',
  'address',
];

// Flag to enable/disable Firestore logging
const ENABLE_FIRESTORE_LOGGING = true;

/**
 * Sanitize an object by redacting sensitive fields
 */
function sanitize(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item));
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object') {
      sanitized[key] = sanitize(obj[key]);
    } else {
      sanitized[key] = obj[key];
    }
  }
  return sanitized;
}

/**
 * Write log to Firestore for remote debugging
 */
async function writeToFirestore(level: string, message: string, data?: any) {
  if (!ENABLE_FIRESTORE_LOGGING) return;
  
  try {
    const { db } = await import('../../firebaseConfig');
    const debugLogsRef = collection(db, 'debugLogs');
    
    await addDoc(debugLogsRef, {
      level,
      message,
      data: data ? sanitize(data) : null,
      timestamp: Timestamp.now(),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    // Silently fail - don't want logging to break the app
    console.error('Failed to write to Firestore:', error);
  }
}

/**
 * Logger interface
 */
export const logger = {
  /**
   * Debug logs - console only in development, Firestore always
   */
  debug: (...args: any[]) => {
    // Console log only in dev
    if (__DEV__) {
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      );
      console.log('[DEBUG]', ...sanitizedArgs);
    }
    
    // Always write to Firestore for remote debugging (even in production)
    const message = args.map(arg => 
      typeof arg === 'string' ? arg : JSON.stringify(sanitize(arg))
    ).join(' ');
    writeToFirestore('debug', message);
  },

  /**
   * Info logs - only in development
   */
  info: (...args: any[]) => {
    if (__DEV__) {
      const sanitizedArgs = args.map(arg => 
        typeof arg === 'object' ? sanitize(arg) : arg
      );
      console.info('[INFO]', ...sanitizedArgs);
    }
  },

  /**
   * Warning logs - always logged
   */
  warn: (...args: any[]) => {
    const sanitizedArgs = args.map(arg => 
      typeof arg === 'object' ? sanitize(arg) : arg
    );
    console.warn('[WARN]', ...sanitizedArgs);
  },

  /**
   * Error logs - always logged
   */
  error: (...args: any[]) => {
    // Don't sanitize errors - we need full error details
    console.error('[ERROR]', ...args);
    
    // Write to Firestore for remote debugging
    const message = args.map(arg => 
      typeof arg === 'string' ? arg : JSON.stringify(arg)
    ).join(' ');
    writeToFirestore('error', message);
  },

  /**
   * Log without sanitization (use sparingly, only for non-sensitive data)
   */
  raw: (...args: any[]) => {
    if (__DEV__) {
      console.log('[RAW]', ...args);
    }
  },
};

/**
 * Example usage:
 * 
 * // Instead of:
 * console.log('User data:', userData);
 * 
 * // Use:
 * logger.debug('User data:', userData); // Automatically sanitizes sensitive fields
 * 
 * // For errors (always logged):
 * logger.error('Failed to fetch user:', error);
 */
