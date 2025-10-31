import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {Ionicons} from '@expo/vector-icons';

export default function PrivacyPolicyScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#222222" />
        </TouchableOpacity>
        <Text style={styles.title}>Privacy Policy</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.lastUpdated}>Last Updated: October 6, 2025</Text>
          
          <Text style={styles.paragraph}>
            FriendZone ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
          </Text>

          <Text style={styles.sectionTitle}>1. Information We Collect</Text>
          
          <Text style={styles.subSectionTitle}>Personal Information</Text>
          <Text style={styles.paragraph}>
            When you create an account using Apple Sign-In, we collect:
          </Text>
          <Text style={styles.bulletPoint}>• Your name</Text>
          <Text style={styles.bulletPoint}>• Email address</Text>
          <Text style={styles.bulletPoint}>• Phone number (required for app functionality)</Text>

          <Text style={styles.subSectionTitle}>Location Information</Text>
          <Text style={styles.paragraph}>
            With your explicit permission, we collect:
          </Text>
          <Text style={styles.bulletPoint}>• Real-time location data (when the app is in use or in the background)</Text>
          <Text style={styles.bulletPoint}>• Zone entry and exit events</Text>
          <Text style={styles.bulletPoint}>• Location history for zones you create</Text>

          <Text style={styles.subSectionTitle}>Contact Information</Text>
          <Text style={styles.paragraph}>
            With your explicit permission, we access your device contacts to:
          </Text>
          <Text style={styles.bulletPoint}>• Help you find friends who are already using FriendZone</Text>
          <Text style={styles.bulletPoint}>• Match phone numbers to identify existing users</Text>
          <Text style={styles.bulletPoint}>• Display contact names for easier friend identification</Text>
          <Text style={styles.paragraph}>
            Contact access is optional - you can also add friends manually by phone number.
          </Text>

          <Text style={styles.subSectionTitle}>Usage Information</Text>
          <Text style={styles.paragraph}>
            We automatically collect:
          </Text>
          <Text style={styles.bulletPoint}>• Device information (model, operating system)</Text>
          <Text style={styles.bulletPoint}>• App usage statistics</Text>
          <Text style={styles.bulletPoint}>• Error logs and crash reports</Text>

          <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
          <Text style={styles.paragraph}>
            We use your information to:
          </Text>
          <Text style={styles.bulletPoint}>• Authenticate your account via Apple Sign-In</Text>
          <Text style={styles.bulletPoint}>• Provide location sharing services with your selected friends</Text>
          <Text style={styles.bulletPoint}>• Notify you and your friends when you enter or leave shared zones</Text>
          <Text style={styles.bulletPoint}>• Help you find friends through contact matching (phone numbers)</Text>
          <Text style={styles.bulletPoint}>• Maintain and improve the app's functionality</Text>
          <Text style={styles.bulletPoint}>• Send you important service updates</Text>
          <Text style={styles.bulletPoint}>• Respond to your support requests</Text>
          <Text style={styles.bulletPoint}>• Ensure the security of our services</Text>

          <Text style={styles.sectionTitle}>3. Information Sharing</Text>
          <Text style={styles.paragraph}>
            We share your information only in the following circumstances:
          </Text>
          
          <Text style={styles.subSectionTitle}>With Your Friends</Text>
          <Text style={styles.paragraph}>
            Your location is shared ONLY with friends you explicitly connect with and ONLY for zones you both share. You have complete control over:
          </Text>
          <Text style={styles.bulletPoint}>• Who can see your location</Text>
          <Text style={styles.bulletPoint}>• Which zones to share</Text>
          <Text style={styles.bulletPoint}>• When to stop sharing</Text>

          <Text style={styles.subSectionTitle}>Service Providers</Text>
          <Text style={styles.paragraph}>
            We use the following third-party services:
          </Text>
          <Text style={styles.bulletPoint}>• Apple Sign-In (iOS authentication)</Text>
          <Text style={styles.bulletPoint}>• Firebase (Google) for database storage and backend services</Text>
          <Text style={styles.bulletPoint}>• Google Maps API for location geocoding</Text>

          <Text style={styles.subSectionTitle}>Legal Requirements</Text>
          <Text style={styles.paragraph}>
            We may disclose your information if required by law or to protect the rights, property, or safety of FriendZone, our users, or others.
          </Text>

          <Text style={styles.sectionTitle}>4. Data Security</Text>
          <Text style={styles.paragraph}>
            We implement industry-standard security measures to protect your information:
          </Text>
          <Text style={styles.bulletPoint}>• Encrypted data transmission (SSL/TLS)</Text>
          <Text style={styles.bulletPoint}>• Secure cloud storage with Firebase</Text>
          <Text style={styles.bulletPoint}>• Regular security audits</Text>
          <Text style={styles.bulletPoint}>• Access controls and authentication</Text>

          <Text style={styles.sectionTitle}>5. Your Privacy Rights</Text>
          <Text style={styles.paragraph}>
            You have the right to:
          </Text>
          <Text style={styles.bulletPoint}>• Access your personal information</Text>
          <Text style={styles.bulletPoint}>• Update or correct your information</Text>
          <Text style={styles.bulletPoint}>• Delete your account and all associated data</Text>
          <Text style={styles.bulletPoint}>• Revoke location permissions at any time</Text>
          <Text style={styles.bulletPoint}>• Remove friends and stop sharing zones</Text>
          <Text style={styles.bulletPoint}>• Export your data</Text>

          <Text style={styles.sectionTitle}>6. Location Permissions</Text>
          <Text style={styles.paragraph}>
            FriendZone requires location permissions to function:
          </Text>
          <Text style={styles.bulletPoint}>• "Always" permission enables automatic zone detection</Text>
          <Text style={styles.bulletPoint}>• You can revoke permissions in your device settings</Text>
          <Text style={styles.bulletPoint}>• Revoking permissions will disable location sharing features</Text>

          <Text style={styles.sectionTitle}>7. Data Retention</Text>
          <Text style={styles.paragraph}>
            We retain your information only as long as necessary to provide our services. When you delete your account:
          </Text>
          <Text style={styles.bulletPoint}>• Your profile and location data are permanently deleted</Text>
          <Text style={styles.bulletPoint}>• Your zones are removed</Text>
          <Text style={styles.bulletPoint}>• Friend connections are severed</Text>
          <Text style={styles.bulletPoint}>• Some data may be retained for legal compliance (up to 90 days)</Text>

          <Text style={styles.sectionTitle}>8. Children's Privacy</Text>
          <Text style={styles.paragraph}>
            FriendZone is not intended for users under 13 years of age. We do not knowingly collect information from children under 13. If we discover that a child under 13 has provided us with personal information, we will delete it immediately.
          </Text>

          <Text style={styles.sectionTitle}>9. Changes to This Policy</Text>
          <Text style={styles.paragraph}>
            We may update this Privacy Policy from time to time. We will notify you of significant changes through the app or via email. Your continued use of FriendZone after changes constitutes acceptance of the updated policy.
          </Text>

          <Text style={styles.sectionTitle}>10. Contact Us</Text>
          <Text style={styles.paragraph}>
            If you have questions about this Privacy Policy or our privacy practices, please contact us through the Help & Support section in the app.
          </Text>

          <Text style={styles.sectionTitle}>11. California Privacy Rights</Text>
          <Text style={styles.paragraph}>
            California residents have additional rights under the California Consumer Privacy Act (CCPA):
          </Text>
          <Text style={styles.bulletPoint}>• Right to know what personal information is collected</Text>
          <Text style={styles.bulletPoint}>• Right to know if personal information is sold or disclosed</Text>
          <Text style={styles.bulletPoint}>• Right to opt-out of the sale of personal information</Text>
          <Text style={styles.bulletPoint}>• Right to deletion of personal information</Text>
          <Text style={styles.bulletPoint}>• Right to non-discrimination for exercising privacy rights</Text>
          <Text style={styles.paragraph}>
            Note: FriendZone does not sell your personal information.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EBEBEB',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
  },
  placeholder: {
    width: 36,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 24,
  },
  lastUpdated: {
    fontSize: 14,
    color: '#717171',
    fontStyle: 'italic',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#222222',
    marginTop: 24,
    marginBottom: 12,
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginTop: 16,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: '#222222',
    lineHeight: 24,
    marginBottom: 12,
  },
  bulletPoint: {
    fontSize: 15,
    color: '#222222',
    lineHeight: 24,
    marginLeft: 16,
    marginBottom: 4,
  },
});
