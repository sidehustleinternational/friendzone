import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {Ionicons} from '@expo/vector-icons';
import {auth} from '../../firebaseConfig';

export default function HelpSupportScreen() {
  const navigation = useNavigation();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const faqs = [
    {
      question: 'How do I create a zone?',
      answer: 'Tap the "+" button on the Zones screen, enter a name and address, and set the detection radius. Your zone will be saved and you can start sharing it with friends.',
    },
    {
      question: 'How do I invite friends to zones?',
      answer: 'Tap "Invite" on any zone or go to the Friends screen and tap "Invite". Select friends from contacts or enter manually, then choose which zones to share. Friends are connected zone-by-zone, not globally.',
    },
    {
      question: 'Why isn\'t my location updating?',
      answer: 'Make sure you\'ve granted FriendZone "Always" location permission in your device settings. Go to Settings > FriendZone > Location > Always. Also ensure you have a good GPS signal.',
    },
    {
      question: 'How do I stop sharing a zone with a friend?',
      answer: 'On the Friends screen, tap the zones chip below a friend\'s name. Uncheck the zones you want to stop sharing and tap Save.',
    },
    {
      question: 'Can I share different zones with different friends?',
      answer: 'Yes! Each friend connection is zone-specific. You might share your "Home" zone with family but your "Office" zone with coworkers. You have complete control over who sees which zones.',
    },
    {
      question: 'How accurate is zone detection?',
      answer: 'Zone detection accuracy depends on GPS signal strength, which can be affected by buildings, weather, and device capabilities. Typically accurate within 30-50 feet.',
    },
    {
      question: 'Does FriendZone drain my battery?',
      answer: 'FriendZone is optimized for battery efficiency. It uses geofencing technology that only checks your location when you enter or exit zones, not continuously.',
    },
    {
      question: 'How do I delete my account?',
      answer: 'Go to Profile > Clear My Data. This will permanently delete your account, zones, and all associated data. This action cannot be undone.',
    },
    {
      question: 'Who can see my location?',
      answer: 'Only friends you explicitly connect with can see when you\'re in shared zones. Your location is never shared publicly or with anyone you haven\'t approved.',
    },
    {
      question: 'Can I use FriendZone without location permissions?',
      answer: 'No, location permissions are required for FriendZone to function. The app is designed specifically for location-based friend notifications.',
    },
  ];

  const handleSendEmail = () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Missing Information', 'Please enter both a subject and message.');
      return;
    }

    const user = auth.currentUser;
    const userEmail = user?.email || 'Not provided';
    const userId = user?.uid || 'Not logged in';

    const emailBody = `
Subject: ${subject}

Message:
${message}

---
User Information:
Email: ${userEmail}
User ID: ${userId}
App Version: 1.0.0
    `.trim();

    const mailtoUrl = `mailto:jamiegoldstein44@gmail.com?subject=${encodeURIComponent('FriendZone Support: ' + subject)}&body=${encodeURIComponent(emailBody)}`;

    Linking.canOpenURL(mailtoUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(mailtoUrl);
        } else {
          Alert.alert(
            'Email Not Available',
            'Please email us directly at: support@friendzone.app',
            [
              {
                text: 'Copy Email',
                onPress: () => {
                  // In a real app, you'd use Clipboard API here
                  Alert.alert('Email', 'support@friendzone.app');
                },
              },
              {text: 'OK'},
            ]
          );
        }
      })
      .then(() => {
        Alert.alert(
          'Email Sent',
          'Your support request has been sent. We\'ll get back to you as soon as possible!',
          [
            {
              text: 'OK',
              onPress: () => {
                setSubject('');
                setMessage('');
              },
            },
          ]
        );
      })
      .catch((error) => {
        logger.error('Error opening email:', error);
        Alert.alert('Error', 'Could not open email app. Please try again.');
      });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#222222" />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* FAQ Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          
          {faqs.map((faq, index) => (
            <TouchableOpacity
              key={index}
              style={styles.faqItem}
              onPress={() => setExpandedFaq(expandedFaq === index ? null : index)}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <Ionicons
                  name={expandedFaq === index ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#717171"
                />
              </View>
              {expandedFaq === index && (
                <Text style={styles.faqAnswer}>{faq.answer}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Support</Text>
          <Text style={styles.sectionDescription}>
            Can't find what you're looking for? Send us a message and we'll get back to you as soon as possible.
          </Text>

          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>Subject</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="Brief description of your issue"
              placeholderTextColor="#999999"
            />

            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Please describe your issue in detail..."
              placeholderTextColor="#999999"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={styles.sendButton}
              onPress={handleSendEmail}
            >
              <Text style={styles.sendButtonText}>Send Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Tips Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Tips</Text>
          
          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Ionicons name="location" size={24} color="#FF5A5F" />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Enable "Always" Location</Text>
              <Text style={styles.tipText}>
                For best results, set location permission to "Always" in your device settings.
              </Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Ionicons name="notifications" size={24} color="#FF5A5F" />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Enable Notifications</Text>
              <Text style={styles.tipText}>
                Get notified when friends enter or leave your shared zones.
              </Text>
            </View>
          </View>

          <View style={styles.tipCard}>
            <View style={styles.tipIcon}>
              <Ionicons name="battery-charging" size={24} color="#FF5A5F" />
            </View>
            <View style={styles.tipContent}>
              <Text style={styles.tipTitle}>Battery Optimization</Text>
              <Text style={styles.tipText}>
                FriendZone uses geofencing to minimize battery usage while tracking zones.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>FriendZone v1.0.0</Text>
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
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 15,
    color: '#717171',
    lineHeight: 22,
    marginBottom: 16,
  },
  faqItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  faqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    flex: 1,
    marginRight: 8,
  },
  faqAnswer: {
    fontSize: 15,
    color: '#717171',
    lineHeight: 22,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F7F7F7',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F7F7F7',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#222222',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
  },
  textArea: {
    height: 120,
    paddingTop: 12,
  },
  sendButton: {
    backgroundColor: '#FF5A5F',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  tipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222222',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 14,
    color: '#717171',
    lineHeight: 20,
  },
  footer: {
    padding: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#717171',
  },
});
