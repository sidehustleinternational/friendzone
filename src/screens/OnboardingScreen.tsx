import React from 'react';
import { View, Text, StyleSheet, Dimensions, Alert } from 'react-native';
import AppIntroSlider from 'react-native-app-intro-slider';
import { Ionicons } from '@expo/vector-icons';
import { SvgXml } from 'react-native-svg';
import * as Location from 'expo-location';
import { logger } from '../utils/logger';

const { width } = Dimensions.get('window');

interface Slide {
  key: string;
  title: string;
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
  useLogo?: boolean;
  backgroundColor: string;
}

const logoSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- Blue donut ring (zone) at cy = 380 -->
  <path d="M256 340c-55 0-100 18-100 40s45 40 100 40 100-18 100-40-45-40-100-40zm0 20c38 0 70 9 70 20s-32 20-70 20-70-9-70-20 32-20 70-20z" fill="#1E90FF"/>

  <!-- Red location pin (20% smaller, centered) -->
  <g transform="translate(256, 236) scale(0.8) translate(-256, -160)">
    <path d="M256 100c-50 0-90 40-90 90 0 60 90 160 90 160s90-100 90-160c0-50-40-90-90-90z" fill="#FF4F4F"/>
  </g>

  <!-- White person silhouette -->
  <g transform="translate(256, 256)">
    <circle cx="0" cy="-20" r="20" fill="#FFFFFF"/>
    <path d="M-25 20c0-14 11-25 25-25s25 11 25 25v30h-50z" fill="#FFFFFF"/>
  </g>
</svg>`;

const slides: Slide[] = [
  {
    key: '0',
    title: 'FriendZone',
    text: 'The safe, secure way to know when you are near your friends.',
    useLogo: true,
    backgroundColor: '#FFFFFF',
  },
  {
    key: '1',
    title: 'Create Your Zones',
    text: 'Create zones for places you visit frequently. Your exact location will not be shared, just that you are in the zone.',
    icon: 'location',
    backgroundColor: '#FF5A5F',
  },
  {
    key: '2',
    title: 'Invite Friends to Zones',
    text: 'Connect with friends zone-by-zone. Each friend is invited to specific zones where you want to share location.',
    icon: 'people',
    backgroundColor: '#4285F4',
  },
  {
    key: '3',
    title: 'Stay Connected',
    text: 'Get notified when friends arrive at your shared zones',
    icon: 'notifications',
    backgroundColor: '#34A853',
  },
  {
    key: '3a',
    title: 'See Who\'s Around',
    text: 'See which of your friends are in the same zone you are',
    icon: 'eye',
    backgroundColor: '#FF9800',
  },
  {
    key: '4',
    title: 'Broadcast Your Location',
    text: 'Share a new location with a few friends or all of them.',
    icon: 'radio',
    backgroundColor: '#9C27B0',
  },
];

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const renderSlide = ({ item }: { item: Slide }) => (
    <View style={[styles.slide, { backgroundColor: item.backgroundColor }]}>
      <View style={styles.iconContainer}>
        {item.useLogo ? (
          <SvgXml xml={logoSvg} width={200} height={200} />
        ) : (
          <Ionicons name={item.icon!} size={120} color="#FFFFFF" />
        )}
      </View>
      <Text style={[styles.title, item.useLogo && { color: '#222222' }]}>{item.title}</Text>
      <Text style={[styles.text, item.useLogo && { color: '#666666' }]}>{item.text}</Text>
    </View>
  );

  const [currentIndex, setCurrentIndex] = React.useState(0);
  
  const handleDone = async () => {
    logger.debug('📍 Onboarding complete - requesting location permissions...');
    
    // Request foreground permissions first
    const foreground = await Location.requestForegroundPermissionsAsync();
    
    if (foreground.status !== 'granted') {
      Alert.alert(
        '⚠️ Location Access Required',
        'IMPORTANT: FriendZone needs your location to notify you when friends arrive at your shared zones.\n\nPlease enable location access in your iPhone Settings to use the app.',
        [{ text: 'OK', onPress: onDone }]
      );
      return;
    }
    
    logger.debug('✅ Foreground location granted');
    
    // Request background permissions
    const background = await Location.requestBackgroundPermissionsAsync();
    
    if (background.status !== 'granted') {
      // User chose "While Using" - that's okay, just continue
      logger.debug('⚠️ User chose "While Using App" - limited functionality');
      onDone();
      return;
    }
    
    logger.debug('✅ Background location granted - full functionality enabled');
    onDone();
  };
  
  return (
    <AppIntroSlider
      renderItem={renderSlide}
      data={slides}
      onDone={handleDone}
      onSkip={handleDone}
      showSkipButton
      skipLabel="Get Started"
      doneLabel="Get Started"
      nextLabel="Next"
      onSlideChange={(index) => setCurrentIndex(index)}
      activeDotStyle={currentIndex === 0 ? styles.activeDotDark : styles.activeDot}
      dotStyle={currentIndex === 0 ? styles.dotDark : styles.dot}
      renderNextButton={() => (
        <View style={[styles.button, currentIndex === 0 && styles.buttonDark]}>
          <Text style={[styles.buttonText, currentIndex === 0 && styles.buttonTextDark]}>Next</Text>
        </View>
      )}
      renderDoneButton={() => (
        <View style={[styles.button, currentIndex === 0 && styles.buttonDark]}>
          <Text style={[styles.buttonText, currentIndex === 0 && styles.buttonTextDark]}>Get Started</Text>
        </View>
      )}
      renderSkipButton={() => (
        <View style={[styles.button, currentIndex === 0 && styles.buttonDark]}>
          <Text style={[styles.buttonText, currentIndex === 0 && styles.buttonTextDark]}>Get Started</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  text: {
    fontSize: 16,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.9,
  },
  activeDot: {
    backgroundColor: '#FFFFFF',
    width: 10,
    height: 10,
  },
  dot: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    width: 8,
    height: 8,
  },
  activeDotDark: {
    backgroundColor: '#007AFF',
    width: 10,
    height: 10,
  },
  dotDark: {
    backgroundColor: 'rgba(0, 122, 255, 0.4)',
    width: 8,
    height: 8,
  },
  button: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  buttonDark: {
    backgroundColor: 'transparent',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDark: {
    color: '#007AFF',
  },
});
