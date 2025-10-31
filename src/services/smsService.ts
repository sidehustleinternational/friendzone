// SMS Service for FriendZone
// Uses native device SMS app for friend invitations
// No external SMS service required (no Twilio, no costs)

import { Platform, Linking } from 'react-native';
import { logger } from '../utils/logger';

/**
 * Send SMS invitation to join FriendZone using native SMS app
 * Opens the user's SMS app with pre-filled message
 */
export const sendInvitationSMS = async (
  phoneNumber: string, 
  fromUserName: string, 
  homeNames: string[]
): Promise<{ success: boolean; messageId?: string }> => {
  try {
    // Get App Store URL from config (can be updated without rebuild)
    const { getAppStoreUrl, isSMSInviteEnabled } = await import('./configService');
    
    // Check if SMS invites are enabled
    const smsEnabled = await isSMSInviteEnabled();
    if (!smsEnabled) {
      logger.debug('📱 SMS invites are disabled in config');
      return { success: false };
    }
    
    const appStoreUrl = await getAppStoreUrl();
    const message = `Your friend ${fromUserName} is inviting you to join them on FriendZone. This will enable you to share your location with each other, but only in your favorite places. Click here to download the app: ${appStoreUrl}`;
    
    logger.debug(`📱 Opening SMS app to send invitation`);
    
    // Use native SMS linking - opens user's SMS app
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${phoneNumber}${separator}body=${encodeURIComponent(message)}`;
    
    const canOpen = await Linking.canOpenURL(smsUrl);
    if (canOpen) {
      await Linking.openURL(smsUrl);
      logger.debug('✅ SMS app opened successfully');
      return { success: true, messageId: 'native-sms-' + Date.now() };
    } else {
      logger.error('❌ Cannot open SMS app');
      return { success: false };
    }
    
  } catch (error) {
    logger.error('Error opening SMS app:', error);
    return { success: false };
  }
};

/**
 * Format phone number for SMS sending
 */
export const formatPhoneForSMS = (phoneNumber: string): string => {
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Add +1 if it's a 10-digit US number
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits[0] === '1') {
    return `+${digits}`;
  }
  
  // Return as-is for international numbers
  return `+${digits}`;
};
