import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_VIEWED_KEY = '@friendzone_last_viewed_requests';

/**
 * Get the timestamp of when the user last viewed friend requests
 */
export const getLastViewedTimestamp = async (): Promise<number> => {
  try {
    const timestamp = await AsyncStorage.getItem(LAST_VIEWED_KEY);
    return timestamp ? parseInt(timestamp, 10) : 0;
  } catch (error) {
    console.error('Error getting last viewed timestamp:', error);
    return 0;
  }
};

/**
 * Update the timestamp of when the user last viewed friend requests
 */
export const updateLastViewedTimestamp = async (): Promise<void> => {
  try {
    const now = Date.now();
    await AsyncStorage.setItem(LAST_VIEWED_KEY, now.toString());
    console.log('✅ Updated last viewed timestamp:', new Date(now).toISOString());
  } catch (error) {
    console.error('Error updating last viewed timestamp:', error);
  }
};

/**
 * Check if a request is new (created after last viewed time)
 */
export const isNewRequest = (requestCreatedAt: Date, lastViewedTimestamp: number): boolean => {
  const requestTime = requestCreatedAt.getTime();
  return requestTime > lastViewedTimestamp;
};
