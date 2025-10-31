import React, {useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../types';

const logoSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <!-- Blue donut ring (zone) at cy = 380 -->
  <path d="M256 340c-55 0-100 18-100 40s45 40 100 40 100-18 100-40-45-40-100-40zm0 20c38 0 70 9 70 20s-32 20-70 20-70-9-70-20 32-20 70-20z" fill="#1E90FF"/>

  <!-- Red location pin (20% smaller, centered) -->
  <g transform="translate(256, 236) scale(0.8) translate(-256, -160)">
    <path d="M256 100c-50 0-90 40-90 90 0 60 90 160 90 160s90-100 90-160c0-50-40-90-90-90z" fill="#FF4F4F"/>
  </g>

  <!-- White person silhouette -->
  <!-- Head (moved down to cy = 236) -->
  <circle cx="256" cy="236" r="26" fill="white"/>

  <!-- Wedge body (moved down to y = 292) -->
  <path d="M220 292c0-12 18-22 36-22s36 10 36 22l-36 60-36-60z" fill="white"/>

  <!-- FriendZone text -->
  <text x="105" y="470"
        font-family="'Manrope', 'Arial Rounded MT Bold', sans-serif"
        font-size="64"
        fill="#1A1A1A"
        font-weight="700"
        letter-spacing="0.5"
  >FriendZone</text>
</svg>`;

type SplashScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Splash'
>;

interface Props {
  navigation: SplashScreenNavigationProp;
}

export default function SplashScreen({navigation}: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    // Start fade in and scale animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Show splash screen for 500ms, then navigate to main app
    const timer = setTimeout(() => {
      try {
        navigation.replace('Main');
      } catch (error) {
        logger.debug('Navigation error, trying reset:', error);
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main' }],
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [navigation, fadeAnim, scaleAnim]);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View 
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.logoContainer}>
          <SvgXml xml={logoSvg} width={300} height={300} />
        </View>
        <Text style={styles.subtitle}>Share Your Zone</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    marginBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#717171',
    textAlign: 'center',
    fontWeight: '500',
  },
});
