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

export default function TermsOfServiceScreen() {
  const navigation = useNavigation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#222222" />
        </TouchableOpacity>
        <Text style={styles.title}>Terms of Service</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.lastUpdated}>Last Updated: October 6, 2025</Text>
          
          <Text style={styles.paragraph}>
            Welcome to FriendZone. By using our app, you agree to these Terms of Service. Please read them carefully.
          </Text>

          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>
            By accessing or using FriendZone, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree to these terms, do not use the app.
          </Text>

          <Text style={styles.sectionTitle}>2. Description of Service</Text>
          <Text style={styles.paragraph}>
            FriendZone is a location-sharing application that allows you to:
          </Text>
          <Text style={styles.bulletPoint}>• Create geographic zones (locations) with custom names and radius</Text>
          <Text style={styles.bulletPoint}>• Connect with friends via phone number or device contacts</Text>
          <Text style={styles.bulletPoint}>• Share your presence in zones with selected friends only</Text>
          <Text style={styles.bulletPoint}>• Receive real-time notifications when friends enter or leave shared zones</Text>
          <Text style={styles.bulletPoint}>• Control exactly which friends can see which zones</Text>

          <Text style={styles.sectionTitle}>3. Eligibility</Text>
          <Text style={styles.paragraph}>
            You must be at least 13 years old to use FriendZone. By using the app, you represent and warrant that you meet this age requirement.
          </Text>

          <Text style={styles.sectionTitle}>4. Account Registration</Text>
          <Text style={styles.paragraph}>
            To use FriendZone, you must:
          </Text>
          <Text style={styles.bulletPoint}>• Sign in using Apple Sign-In</Text>
          <Text style={styles.bulletPoint}>• Provide a valid phone number (required for friend connections)</Text>
          <Text style={styles.bulletPoint}>• Provide accurate and complete information</Text>
          <Text style={styles.bulletPoint}>• Maintain the security of your account credentials</Text>
          <Text style={styles.bulletPoint}>• Notify us immediately of any unauthorized access</Text>
          <Text style={styles.bulletPoint}>• Accept responsibility for all activities under your account</Text>

          <Text style={styles.sectionTitle}>5. User Responsibilities</Text>
          
          <Text style={styles.subSectionTitle}>You agree to:</Text>
          <Text style={styles.bulletPoint}>• Use the app only for lawful purposes</Text>
          <Text style={styles.bulletPoint}>• Respect the privacy of other users</Text>
          <Text style={styles.bulletPoint}>• Not harass, stalk, or harm others</Text>
          <Text style={styles.bulletPoint}>• Not share false or misleading information</Text>
          <Text style={styles.bulletPoint}>• Not attempt to access unauthorized areas of the app</Text>
          <Text style={styles.bulletPoint}>• Not use the app to violate any laws or regulations</Text>

          <Text style={styles.subSectionTitle}>You agree NOT to:</Text>
          <Text style={styles.bulletPoint}>• Use the app to stalk, harass, or threaten others</Text>
          <Text style={styles.bulletPoint}>• Share your account with others</Text>
          <Text style={styles.bulletPoint}>• Reverse engineer or attempt to extract source code</Text>
          <Text style={styles.bulletPoint}>• Use automated systems to access the app</Text>
          <Text style={styles.bulletPoint}>• Interfere with the app's operation or security</Text>
          <Text style={styles.bulletPoint}>• Collect information about other users without permission</Text>

          <Text style={styles.sectionTitle}>6. Location Sharing</Text>
          <Text style={styles.paragraph}>
            FriendZone's core functionality requires location permissions:
          </Text>
          <Text style={styles.bulletPoint}>• You control who can see your location</Text>
          <Text style={styles.bulletPoint}>• You control which zones to share</Text>
          <Text style={styles.bulletPoint}>• You can revoke sharing at any time</Text>
          <Text style={styles.bulletPoint}>• Location data is shared only with your approved friends</Text>
          <Text style={styles.bulletPoint}>• You are responsible for managing your privacy settings</Text>

          <Text style={styles.sectionTitle}>7. Content and Conduct</Text>
          <Text style={styles.paragraph}>
            You are responsible for all content you create in the app, including zone names and descriptions. We reserve the right to remove content that violates these terms or is otherwise objectionable.
          </Text>

          <Text style={styles.sectionTitle}>8. Intellectual Property</Text>
          <Text style={styles.paragraph}>
            FriendZone and its original content, features, and functionality are owned by FriendZone and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
          </Text>

          <Text style={styles.sectionTitle}>9. Privacy and Data Protection</Text>
          <Text style={styles.paragraph}>
            Your privacy is important to us. Please review our Privacy Policy to understand how we collect, use, and protect your information. By using FriendZone, you consent to our data practices as described in the Privacy Policy, including the use of Apple Sign-In and Firebase services.
          </Text>

          <Text style={styles.sectionTitle}>10. Disclaimers</Text>
          
          <Text style={styles.subSectionTitle}>Service Availability</Text>
          <Text style={styles.paragraph}>
            FriendZone is provided "as is" and "as available." We do not guarantee:
          </Text>
          <Text style={styles.bulletPoint}>• Uninterrupted or error-free service</Text>
          <Text style={styles.bulletPoint}>• Accuracy of location data</Text>
          <Text style={styles.bulletPoint}>• Availability of all features at all times</Text>
          <Text style={styles.bulletPoint}>• Compatibility with all devices</Text>

          <Text style={styles.subSectionTitle}>Location Accuracy</Text>
          <Text style={styles.paragraph}>
            Location data may not always be accurate due to:
          </Text>
          <Text style={styles.bulletPoint}>• GPS signal limitations</Text>
          <Text style={styles.bulletPoint}>• Device capabilities</Text>
          <Text style={styles.bulletPoint}>• Network connectivity</Text>
          <Text style={styles.bulletPoint}>• Environmental factors</Text>
          <Text style={styles.paragraph}>
            Do not rely on FriendZone for emergency services or critical safety applications.
          </Text>

          <Text style={styles.sectionTitle}>11. Limitation of Liability</Text>
          <Text style={styles.paragraph}>
            To the maximum extent permitted by law, FriendZone and its affiliates shall not be liable for:
          </Text>
          <Text style={styles.bulletPoint}>• Indirect, incidental, or consequential damages</Text>
          <Text style={styles.bulletPoint}>• Loss of data, profits, or business opportunities</Text>
          <Text style={styles.bulletPoint}>• Damages arising from unauthorized access to your account</Text>
          <Text style={styles.bulletPoint}>• Damages arising from third-party actions</Text>
          <Text style={styles.bulletPoint}>• Damages arising from service interruptions</Text>

          <Text style={styles.sectionTitle}>12. Indemnification</Text>
          <Text style={styles.paragraph}>
            You agree to indemnify and hold harmless FriendZone, its affiliates, and their respective officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including legal fees) arising from:
          </Text>
          <Text style={styles.bulletPoint}>• Your use of the app</Text>
          <Text style={styles.bulletPoint}>• Your violation of these terms</Text>
          <Text style={styles.bulletPoint}>• Your violation of any rights of another user</Text>
          <Text style={styles.bulletPoint}>• Your violation of any laws or regulations</Text>

          <Text style={styles.sectionTitle}>13. Termination</Text>
          <Text style={styles.paragraph}>
            We reserve the right to suspend or terminate your account at any time for:
          </Text>
          <Text style={styles.bulletPoint}>• Violation of these Terms of Service</Text>
          <Text style={styles.bulletPoint}>• Fraudulent or illegal activity</Text>
          <Text style={styles.bulletPoint}>• Abuse of the service or other users</Text>
          <Text style={styles.bulletPoint}>• Any other reason at our sole discretion</Text>
          <Text style={styles.paragraph}>
            You may delete your account at any time through the app settings.
          </Text>

          <Text style={styles.sectionTitle}>14. Changes to Terms</Text>
          <Text style={styles.paragraph}>
            We may modify these Terms of Service at any time. We will notify you of significant changes through the app or via email. Your continued use of FriendZone after changes constitutes acceptance of the updated terms.
          </Text>

          <Text style={styles.sectionTitle}>15. Governing Law</Text>
          <Text style={styles.paragraph}>
            These Terms of Service are governed by and construed in accordance with the laws of the United States, without regard to conflict of law principles.
          </Text>

          <Text style={styles.sectionTitle}>16. Dispute Resolution</Text>
          <Text style={styles.paragraph}>
            Any disputes arising from these terms or your use of FriendZone shall be resolved through:
          </Text>
          <Text style={styles.bulletPoint}>• Good faith negotiation</Text>
          <Text style={styles.bulletPoint}>• Binding arbitration if negotiation fails</Text>
          <Text style={styles.bulletPoint}>• Small claims court (if eligible)</Text>
          <Text style={styles.paragraph}>
            You waive your right to participate in class action lawsuits or class-wide arbitration.
          </Text>

          <Text style={styles.sectionTitle}>17. Severability</Text>
          <Text style={styles.paragraph}>
            If any provision of these Terms of Service is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
          </Text>

          <Text style={styles.sectionTitle}>18. Entire Agreement</Text>
          <Text style={styles.paragraph}>
            These Terms of Service, together with our Privacy Policy, constitute the entire agreement between you and FriendZone regarding the use of the app.
          </Text>

          <Text style={styles.sectionTitle}>19. Contact Information</Text>
          <Text style={styles.paragraph}>
            If you have questions about these Terms of Service, please contact us through the Help & Support section in the app.
          </Text>

          <Text style={styles.paragraph}>
            By using FriendZone, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.
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
