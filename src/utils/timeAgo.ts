/**
 * Format a timestamp as "time ago" (SnapMap style)
 * Examples: "5m ago", "2h ago", "yesterday", "3d ago"
 */
export function formatTimeAgo(timestamp: number | Date | undefined | null | any): string {
  // Handle null/undefined
  if (!timestamp) {
    return 'unknown';
  }
  
  const now = Date.now();
  // Convert to timestamp number
  let ts: number;
  if (typeof timestamp === 'number') {
    ts = timestamp;
  } else if (timestamp instanceof Date) {
    ts = timestamp.getTime();
  } else if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    // Firestore Timestamp
    ts = timestamp.toDate().getTime();
  } else if (timestamp.seconds) {
    // Firestore Timestamp-like object
    ts = timestamp.seconds * 1000;
  } else {
    // Try to convert as Date
    ts = new Date(timestamp).getTime();
  }
  
  // Check if conversion resulted in NaN
  if (isNaN(ts)) {
    return 'unknown';
  }
  
  const diffMs = now - ts;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return `${Math.floor(diffDays / 7)}w ago`;
  }
}

/**
 * Check if location data is stale (older than 5 minutes)
 */
export function isLocationStale(timestamp: number | Date | undefined | null | any): boolean {
  if (!timestamp) return true;
  
  const now = Date.now();
  // Handle Firestore Timestamp objects
  let ts: number;
  if (typeof timestamp === 'number') {
    ts = timestamp;
  } else if (timestamp instanceof Date) {
    ts = timestamp.getTime();
  } else if (timestamp.toDate && typeof timestamp.toDate === 'function') {
    // Firestore Timestamp
    ts = timestamp.toDate().getTime();
  } else if (timestamp.seconds) {
    // Firestore Timestamp-like object
    ts = timestamp.seconds * 1000;
  } else {
    return true; // Unknown format, consider stale
  }
  
  if (isNaN(ts)) return true;
  
  const diffMinutes = Math.floor((now - ts) / (1000 * 60));
  return diffMinutes >= 5;
}

/**
 * Check if location is too stale to trust for zone presence (older than 30 minutes)
 */
export function isLocationTooStaleForZones(timestamp: number): boolean {
  const now = Date.now();
  const diffMinutes = Math.floor((now - timestamp) / (1000 * 60));
  return diffMinutes >= 30;
}

/**
 * Get location freshness level
 * - fresh: < 5 minutes
 * - recent: 5-60 minutes
 * - stale: 1-24 hours
 * - old: > 24 hours
 */
export function getLocationFreshness(timestamp: number): 'fresh' | 'recent' | 'stale' | 'old' {
  const now = Date.now();
  const diffMinutes = Math.floor((now - timestamp) / (1000 * 60));
  const diffHours = Math.floor((now - timestamp) / (1000 * 60 * 60));

  if (diffMinutes < 5) {
    return 'fresh';
  } else if (diffMinutes < 60) {
    return 'recent';
  } else if (diffHours < 24) {
    return 'stale';
  } else {
    return 'old';
  }
}
