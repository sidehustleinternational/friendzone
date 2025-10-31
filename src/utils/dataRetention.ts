/**
 * Data Retention Policy Utilities
 * Manages automatic cleanup of old location data for privacy and compliance
 */

import { db, auth } from '../../firebaseConfig';
import { collection, query, where, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore';

// Retention periods (in days)
export const RETENTION_PERIODS = {
  LOCATION_HISTORY: 30,      // Keep location history for 30 days
  FRIEND_REQUESTS: 90,        // Keep old friend requests for 90 days
  SECURITY_LOGS: 180,         // Keep security logs for 6 months
};

/**
 * Calculate cutoff timestamp for data retention
 */
const getCutoffTimestamp = (daysAgo: number): number => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
  return cutoffDate.getTime();
};

/**
 * Clean up old location data for current user
 * Called periodically or on app startup
 */
export const cleanupOldLocations = async (): Promise<{
  deleted: number;
  error?: string;
}> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { deleted: 0, error: 'No authenticated user' };
    }

    const cutoffTime = getCutoffTimestamp(RETENTION_PERIODS.LOCATION_HISTORY);
    
    console.log(`🗑️ Cleaning up locations older than ${RETENTION_PERIODS.LOCATION_HISTORY} days`);
    console.log(`🗑️ Cutoff timestamp: ${new Date(cutoffTime).toISOString()}`);

    // Query old location records
    // Note: This is a simplified version. In production, you'd want to use
    // Firebase Cloud Functions for more efficient batch deletion
    const locationsRef = collection(db, 'locations');
    const oldLocationsQuery = query(
      locationsRef,
      where('timestamp', '<', cutoffTime)
    );

    const snapshot = await getDocs(oldLocationsQuery);
    
    if (snapshot.empty) {
      console.log('✅ No old locations to clean up');
      return { deleted: 0 };
    }

    // Delete old records
    const deletePromises = snapshot.docs.map(docSnapshot => 
      deleteDoc(doc(db, 'locations', docSnapshot.id))
    );

    await Promise.all(deletePromises);
    
    console.log(`✅ Deleted ${snapshot.size} old location records`);
    return { deleted: snapshot.size };
    
  } catch (error) {
    console.error('Error cleaning up old locations:', error);
    return { deleted: 0, error: String(error) };
  }
};

/**
 * Clean up rejected/expired friend requests
 */
export const cleanupOldFriendRequests = async (): Promise<{
  deleted: number;
  error?: string;
}> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { deleted: 0, error: 'No authenticated user' };
    }

    const cutoffTime = getCutoffTimestamp(RETENTION_PERIODS.FRIEND_REQUESTS);
    
    console.log(`🗑️ Cleaning up friend requests older than ${RETENTION_PERIODS.FRIEND_REQUESTS} days`);

    // Query old rejected/expired requests
    const requestsRef = collection(db, 'friendRequests');
    const oldRequestsQuery = query(
      requestsRef,
      where('status', 'in', ['rejected', 'expired']),
      where('createdAt', '<', cutoffTime)
    );

    const snapshot = await getDocs(oldRequestsQuery);
    
    if (snapshot.empty) {
      console.log('✅ No old friend requests to clean up');
      return { deleted: 0 };
    }

    const deletePromises = snapshot.docs.map(docSnapshot => 
      deleteDoc(doc(db, 'friendRequests', docSnapshot.id))
    );

    await Promise.all(deletePromises);
    
    console.log(`✅ Deleted ${snapshot.size} old friend requests`);
    return { deleted: snapshot.size };
    
  } catch (error) {
    console.error('Error cleaning up old friend requests:', error);
    return { deleted: 0, error: String(error) };
  }
};

/**
 * Run all cleanup tasks
 * Should be called periodically (e.g., on app startup, daily)
 */
export const runDataRetentionCleanup = async (): Promise<{
  locationsDeleted: number;
  requestsDeleted: number;
  errors: string[];
}> => {
  console.log('🗑️ Starting data retention cleanup...');
  
  const results = {
    locationsDeleted: 0,
    requestsDeleted: 0,
    errors: [] as string[]
  };

  // Clean up locations
  const locationResult = await cleanupOldLocations();
  results.locationsDeleted = locationResult.deleted;
  if (locationResult.error) {
    results.errors.push(`Locations: ${locationResult.error}`);
  }

  // Clean up friend requests
  const requestsResult = await cleanupOldFriendRequests();
  results.requestsDeleted = requestsResult.deleted;
  if (requestsResult.error) {
    results.errors.push(`Friend Requests: ${requestsResult.error}`);
  }

  console.log('✅ Data retention cleanup complete:', results);
  return results;
};

/**
 * Check if cleanup is needed (run once per day)
 */
export const shouldRunCleanup = (): boolean => {
  const lastCleanup = localStorage.getItem('lastDataCleanup');
  if (!lastCleanup) return true;

  const lastCleanupTime = parseInt(lastCleanup);
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  
  return lastCleanupTime < oneDayAgo;
};

/**
 * Mark cleanup as completed
 */
export const markCleanupCompleted = (): void => {
  localStorage.setItem('lastDataCleanup', Date.now().toString());
};

/**
 * Get data retention statistics
 */
export const getRetentionStats = async (): Promise<{
  totalLocations: number;
  oldLocations: number;
  retentionDays: number;
}> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { totalLocations: 0, oldLocations: 0, retentionDays: RETENTION_PERIODS.LOCATION_HISTORY };
    }

    const cutoffTime = getCutoffTimestamp(RETENTION_PERIODS.LOCATION_HISTORY);
    
    // Count total locations
    const locationsRef = collection(db, 'locations');
    const allLocations = await getDocs(locationsRef);
    
    // Count old locations
    const oldLocationsQuery = query(
      locationsRef,
      where('timestamp', '<', cutoffTime)
    );
    const oldLocations = await getDocs(oldLocationsQuery);

    return {
      totalLocations: allLocations.size,
      oldLocations: oldLocations.size,
      retentionDays: RETENTION_PERIODS.LOCATION_HISTORY
    };
    
  } catch (error) {
    console.error('Error getting retention stats:', error);
    return { totalLocations: 0, oldLocations: 0, retentionDays: RETENTION_PERIODS.LOCATION_HISTORY };
  }
};

/**
 * Delete all user data (for account deletion / GDPR right to be forgotten)
 */
export const deleteAllUserData = async (): Promise<{
  success: boolean;
  error?: string;
}> => {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      return { success: false, error: 'No authenticated user' };
    }

    console.log('🗑️ Deleting all user data...');

    // Delete user document
    await deleteDoc(doc(db, 'users', currentUser.uid));
    
    // Delete all locations
    const locationsRef = collection(db, 'locations');
    const locationsQuery = query(locationsRef, where('userId', '==', currentUser.uid));
    const locations = await getDocs(locationsQuery);
    await Promise.all(locations.docs.map(d => deleteDoc(d.ref)));

    // Delete all friend relationships
    const friendsRef = collection(db, 'friends');
    const friendsQuery = query(friendsRef, where('userId', '==', currentUser.uid));
    const friends = await getDocs(friendsQuery);
    await Promise.all(friends.docs.map(d => deleteDoc(d.ref)));

    // Delete all friend requests
    const requestsRef = collection(db, 'friendRequests');
    const requestsQuery = query(requestsRef, where('fromUserId', '==', currentUser.uid));
    const requests = await getDocs(requestsQuery);
    await Promise.all(requests.docs.map(d => deleteDoc(d.ref)));

    console.log('✅ All user data deleted');
    return { success: true };
    
  } catch (error) {
    console.error('Error deleting user data:', error);
    return { success: false, error: String(error) };
  }
};
