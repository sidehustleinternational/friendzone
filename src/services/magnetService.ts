import { Friend } from '../types';

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in miles
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
}

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Check if a friend is within proximity alert radius
 * @param friend Friend object with proximity settings
 * @param userLocation Current user's location
 * @returns Object with isNearby flag and distance
 */
export function checkFriendProximity(
  friend: Friend,
  userLocation: { latitude: number; longitude: number }
): { isNearby: boolean; distance: number | null } {
  // Check if proximity alerts are enabled for this friend
  if (!friend.proximityAlertEnabled) {
    return { isNearby: false, distance: null };
  }

  // Check if friend has a known location
  if (!friend.lastKnownLocation) {
    return { isNearby: false, distance: null };
  }

  // Calculate distance
  const distance = calculateDistance(
    userLocation.latitude,
    userLocation.longitude,
    friend.lastKnownLocation.latitude,
    friend.lastKnownLocation.longitude
  );

  // Check if within radius
  const radius = friend.proximityAlertRadius || 0.5;
  const isNearby = distance <= radius;

  return { isNearby, distance };
}

/**
 * Get all nearby friends based on current location
 * @param friends Array of friends
 * @param userLocation Current user's location
 * @returns Array of nearby friends with distances
 */
export function getNearbyFriends(
  friends: Friend[],
  userLocation: { latitude: number; longitude: number }
): Array<Friend & { distance: number }> {
  const nearbyFriends: Array<Friend & { distance: number }> = [];

  for (const friend of friends) {
    const { isNearby, distance } = checkFriendProximity(friend, userLocation);
    
    if (isNearby && distance !== null) {
      nearbyFriends.push({
        ...friend,
        distance,
      });
    }
  }

  // Sort by distance (closest first)
  nearbyFriends.sort((a, b) => a.distance - b.distance);

  return nearbyFriends;
}

/**
 * Format distance for display
 * @param distance Distance in miles
 * @returns Formatted string (without "away" - caller adds context)
 */
export function formatDistance(distance: number): string {
  if (distance < 0.1) {
    return 'within 0.1 mi';
  } else if (distance < 1) {
    return `within ${distance.toFixed(2)} mi`;
  } else {
    return `within ${distance.toFixed(1)} mi`;
  }
}
