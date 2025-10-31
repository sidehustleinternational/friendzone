import React, {useState, useRef} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { logger } from '../utils/logger';
import {SafeAreaView} from 'react-native-safe-area-context';
import {StackNavigationProp} from '@react-navigation/stack';
import {RootStackParamList} from '../types';
import {auth, db} from '../../firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { SvgXml } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';

type AuthScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Auth'>;

interface Props {
  navigation: AuthScreenNavigationProp;
}

const logoSvg = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <path d="M256 340c-55 0-100 18-100 40s45 40 100 40 100-18 100-40-45-40-100-40zm0 20c38 0 70 9 70 20s-32 20-70 20-70-9-70-20 32-20 70-20z" fill="#1E90FF"/>
  <g transform="translate(256, 236) scale(0.8) translate(-256, -160)">
    <path d="M256 100c-50 0-90 40-90 90 0 60 90 160 90 160s90-100 90-160c0-50-40-90-90-90z" fill="#FF4F4F"/>
  </g>
  <circle cx="256" cy="236" r="26" fill="white"/>
  <path d="M220 292c0-12 18-22 36-22s36 10 36 22l-36 60-36-60z" fill="white"/>
  <text x="105" y="470"
        font-family="'Manrope', 'Arial Rounded MT Bold', sans-serif"
        font-size="64"
        fill="#1A1A1A"
        font-weight="700"
        letter-spacing="0.5"
  >FriendZone</text>
</svg>`;

export default function AuthScreen({navigation}: Props) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [step, setStep] = useState<'phone' | 'complete-profile' | 'verify-code'>('phone');
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  
  // Refs for input focus management
  const phoneInputRef = useRef<TextInput>(null);
  const codeInputRef = useRef<TextInput>(null);

  // Check Apple Sign In availability
  React.useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  // Resend timer countdown
  React.useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  // Format phone number as (XXX) XXX-XXXX
  const formatPhoneNumber = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/);
    if (!match) return text;

    let formatted = '';
    if (match[1]) formatted = `(${match[1]}`;
    if (match[2]) formatted += `) ${match[2]}`;
    if (match[3]) formatted += `-${match[3]}`;

    return formatted;
  };


  // Send SMS verification code (Reverse SMS - user texts us)
  const handleSendVerificationCode = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name.');
      return;
    }

    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter your phone number.');
      return;
    }

    // Validate phone number format
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length !== 10) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number.');
      return;
    }

    setLoading(true);

    try {
      // Format phone to E.164 (+1XXXXXXXXXX)
      const formattedPhone = `+1${digits}`;
      
      logger.debug('📱 Creating verification request for:', formattedPhone);

      // Create pending verification in Firestore
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const firebaseApp = (await import('../../firebaseConfig')).default;
      const functions = getFunctions(firebaseApp);
      const sendVerificationCode = httpsCallable(functions, 'sendVerificationCode');
      
      const result = await sendVerificationCode({ phoneNumber: formattedPhone });
      const data = result.data as any;
      
      if (data.success) {
        logger.debug('✅ Verification request created');
        logger.debug('Verification ID:', data.verificationId);
        
        setVerificationId(data.verificationId);
        setLoading(false);
        
        // Open SMS app with pre-filled message
        const twilioNumber = '+16065030588'; // Your Twilio number
        const message = 'JOIN';
        const separator = Platform.OS === 'ios' ? '&' : '?';
        const smsUrl = `sms:${twilioNumber}${separator}body=${encodeURIComponent(message)}`;
        
        logger.debug('📱 Opening SMS app with URL:', smsUrl);
        
        // Show instructions before opening SMS
        Alert.alert(
          'Verify Your Phone',
          `We'll open your messaging app with a pre-filled text message. Tap Send, then return to FriendZone to complete verification.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setLoading(false);
              }
            },
            {
              text: 'Open Messages',
              onPress: async () => {
                try {
                  const canOpen = await Linking.canOpenURL(smsUrl);
                  if (canOpen) {
                    await Linking.openURL(smsUrl);
                    // Move to verification waiting screen
                    setStep('verify-code');
                    setResendTimer(60);
                  } else {
                    Alert.alert('Error', 'Cannot open messaging app. Please text JOIN to +1 (606) 503-0588 manually.');
                  }
                } catch (error) {
                  logger.error('Error opening SMS app:', error);
                  Alert.alert('Error', 'Cannot open messaging app. Please text JOIN to +1 (606) 503-0588 manually.');
                }
              }
            }
          ]
        );
      } else {
        throw new Error('Failed to create verification request');
      }
    } catch (error: any) {
      setLoading(false);
      logger.error('❌ Verification request error:', error);
      logger.error('Error message:', error.message);
      logger.error('Full error object:', JSON.stringify(error, null, 2));
      
      let errorMessage = 'Failed to create verification request. Please try again.';
      
      // Provide more specific error messages
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check your account permissions.';
      } else if (error.code === 'network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      Alert.alert('Verification Failed', errorMessage);
    }
  };

  // Verify code and complete profile
  const handleVerifyCode = async () => {
    if (!verificationCode.trim()) {
      Alert.alert('Error', 'Please enter the verification code.');
      return;
    }

    if (verificationCode.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit code.');
      return;
    }

    setLoading(true);

    try {
      if (!verificationId) {
        Alert.alert('Error', 'Verification session expired. Please request a new code.');
        setLoading(false);
        return;
      }

      logger.debug('🔐 Verifying code:', verificationCode);
      
      // Call Cloud Function to verify code
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const firebaseApp = (await import('../../firebaseConfig')).default;
      const functions = getFunctions(firebaseApp);
      const verifyCodeFunction = httpsCallable(functions, 'verifyCode');
      
      const result = await verifyCodeFunction({
        verificationId: verificationId,
        code: verificationCode,
      });
      
      const data = result.data as any;
      
      if (!data.success) {
        throw new Error('Verification failed');
      }
      
      logger.debug('✅ Phone number verified:', data.phoneNumber);
      
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Error', 'Session expired. Please try again.');
        setLoading(false);
        return;
      }
      
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);

      // Format phone number as E.164
      const digits = phoneNumber.replace(/\D/g, '');
      const e164Phone = `+1${digits}`;
      
      const profileData = {
        name: name.trim(),
        phoneNumber: e164Phone,
        phoneVerified: true, // Mark as verified by Firebase
        email: user.email || '',
      };

      if (userDoc.exists()) {
        await updateDoc(userRef, {
          ...profileData,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(userRef, {
          ...profileData,
          createdAt: serverTimestamp(),
        });
      }
      
      // Verify the document was actually saved
      const verifyDoc = await getDoc(userRef);
      const verifyData = verifyDoc.data();
      
      if (!verifyData?.phoneNumber) {
        throw new Error('Profile save verification failed - phone number not found');
      }
      
      // Set flag to trigger RootNavigator state change
      await AsyncStorage.setItem('profileCompleted', 'true');
      
      setLoading(false);
      logger.debug('✅ Profile saved successfully with verified phone');
      
    } catch (error: any) {
      setLoading(false);
      logger.error('❌ Verification error:', error);
      
      let errorMessage = 'Failed to verify code. Please try again.';
      
      // Firebase Phone Auth specific errors
      if (error.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid verification code. Please check and try again.';
      } else if (error.code === 'auth/code-expired') {
        errorMessage = 'Verification code expired. Please request a new code.';
      } else if (error.code === 'auth/credential-already-in-use') {
        errorMessage = 'This phone number is already linked to another account.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Verification Failed', errorMessage);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);

    try {
      const { signInWithApple } = await import('../services/appleAuth');
      const result = await signInWithApple();

      if (result.success) {
        if (result.needsProfile) {
          // New user - go to profile completion
          setName(result.user?.displayName || '');
          setLoading(false);
          setStep('complete-profile');
        } else {
          // Existing user with complete profile
          await AsyncStorage.setItem('hasCompletedAuth', 'true');
          setLoading(false);
          // RootNavigator will handle navigation
        }
      } else {
        setLoading(false);
        if (result.error !== 'Sign-in cancelled') {
          Alert.alert('Error', result.error || 'Apple Sign-In failed');
        }
      }
    } catch (error: any) {
      setLoading(false);
      console.error('Apple Sign-In error:', error);
      Alert.alert('Error', error.message || 'Sign-in failed');
    }
  };

  const renderPhoneStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepContent}>
        <View style={styles.logoContainer}>
          <SvgXml xml={logoSvg} width={250} height={250} />
        </View>
        <Text style={styles.title}>Welcome to FriendZone</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={8}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        ) : (
          <Text style={styles.noAppleText}>Apple Sign In is not available on this device</Text>
        )}
        
        {/* 
          ⚠️ SECURITY: Development bypass for testing on simulators
          This button is ONLY visible when __DEV__ === true
          Automatically removed in production builds
          DO NOT modify the __DEV__ check
        */}
        {__DEV__ && (
          <TouchableOpacity
            style={styles.devBypassButton}
            onPress={async () => {
              try {
                // Create a test user with email/password
                const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
                const testEmail = `test${Date.now()}@friendzone.dev`;
                const testPassword = 'TestPassword123!';
                
                try {
                  // Try to create new user
                  await createUserWithEmailAndPassword(auth, testEmail, testPassword);
                } catch (error: any) {
                  // If user exists, sign in
                  if (error.code === 'auth/email-already-in-use') {
                    await signInWithEmailAndPassword(auth, testEmail, testPassword);
                  } else {
                    throw error;
                  }
                }
                
                setStep('complete-profile');
              } catch (error) {
                logger.error('Dev bypass error:', error);
                Alert.alert('Error', 'Failed to create test user');
              }
            }}
          >
            <Text style={styles.devBypassText}>Skip Auth (Dev Only)</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderCompleteProfileStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepContent}>
        <View style={styles.logoContainer}>
          <SvgXml xml={logoSvg} width={150} height={150} />
        </View>
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>We need a few details to get started</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => {
            phoneInputRef.current?.focus();
          }}
        />

        <TextInput
          ref={phoneInputRef}
          style={styles.input}
          placeholder="Phone Number"
          value={phoneNumber}
          onChangeText={(text) => setPhoneNumber(formatPhoneNumber(text))}
          keyboardType="phone-pad"
          maxLength={14}
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={handleSendVerificationCode}
        />
      </View>
      
      {/* Fixed Continue button at bottom */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSendVerificationCode}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Saving...' : 'Continue'}
          </Text>
        </TouchableOpacity>
        
        {/* 
          ⚠️ SECURITY: Development bypass for phone verification on simulators
          This button is ONLY visible when __DEV__ === true
          Automatically removed in production builds
          WARNING: Allows saving unverified phone numbers in dev mode
          DO NOT modify the __DEV__ check
        */}
        {__DEV__ && (
          <TouchableOpacity
            style={styles.devBypassButton}
            onPress={async () => {
              if (!name.trim()) {
                Alert.alert('Error', 'Please enter your name first.');
                return;
              }
              
              if (!phoneNumber.trim()) {
                Alert.alert('Error', 'Please enter your phone number first.');
                return;
              }
              
              try {
                setLoading(true);
                const user = auth.currentUser;
                if (!user) {
                  Alert.alert('Error', 'No user logged in');
                  setLoading(false);
                  return;
                }
                
                const userRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userRef);
                
                // Format phone number as E.164
                const digits = phoneNumber.replace(/\D/g, '');
                const e164Phone = `+1${digits}`;
                
                const profileData = {
                  name: name.trim(),
                  phoneNumber: e164Phone,
                  phoneVerified: true,  // ⚠️ DEV ONLY: Skipping actual verification
                  email: user.email || '',
                };

                if (userDoc.exists()) {
                  await updateDoc(userRef, {
                    ...profileData,
                    updatedAt: serverTimestamp(),
                  });
                } else {
                  await setDoc(userRef, {
                    ...profileData,
                    createdAt: serverTimestamp(),
                  });
                }
                
                await AsyncStorage.setItem('profileCompleted', 'true');
                setLoading(false);
                logger.debug('✅ Profile saved with phone (dev mode):', e164Phone);
              } catch (error) {
                setLoading(false);
                logger.error('Dev bypass error:', error);
                Alert.alert('Error', 'Failed to save profile');
              }
            }}
          >
            <Text style={styles.devBypassText}>Skip Phone Verification (Dev Only)</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  // Poll for verification status
  React.useEffect(() => {
    if (step === 'verify-code' && verificationId) {
      const checkVerification = async () => {
        try {
          const { getFirestore, doc, getDoc } = await import('firebase/firestore');
          const firebaseApp = (await import('../../firebaseConfig')).default;
          const db = getFirestore(firebaseApp);
          
          const verificationRef = doc(db, 'phoneVerifications', verificationId);
          const verificationDoc = await getDoc(verificationRef);
          
          if (verificationDoc.exists()) {
            const data = verificationDoc.data();
            if (data.verified) {
              logger.debug('✅ Phone verified via reverse SMS!');
              
              // Complete profile with verified phone
              const user = auth.currentUser;
              if (!user) {
                logger.error('No user logged in');
                return;
              }
              
              const userRef = doc(db, 'users', user.uid);
              const userDoc = await getDoc(userRef);

              // Format phone number as E.164
              const digits = phoneNumber.replace(/\D/g, '');
              const e164Phone = `+1${digits}`;
              
              const profileData = {
                name: name.trim(),
                phoneNumber: e164Phone,
                phoneVerified: true,
                email: user.email || '',
              };

              if (userDoc.exists()) {
                await updateDoc(userRef, {
                  ...profileData,
                  updatedAt: serverTimestamp(),
                });
              } else {
                await setDoc(userRef, {
                  ...profileData,
                  createdAt: serverTimestamp(),
                });
              }
              
              // Set flag to trigger navigation
              await AsyncStorage.setItem('profileCompleted', 'true');
              
              logger.debug('✅ Profile saved with verified phone');
              Alert.alert('Success!', 'Your phone has been verified!');
            }
          }
        } catch (error) {
          logger.error('Error checking verification:', error);
        }
      };
      
      // Check immediately
      checkVerification();
      
      // Then poll every 3 seconds
      const interval = setInterval(checkVerification, 3000);
      
      return () => clearInterval(interval);
    }
  }, [step, verificationId, phoneNumber, name]);

  const renderVerifyCodeStep = () => (
    <View style={styles.stepContainer}>
      <View style={styles.stepContent}>
        <Text style={styles.title}>Waiting for Verification</Text>
        <Text style={styles.subtitle}>
          We're waiting for your text message...
        </Text>
        
        <View style={{marginVertical: 20, padding: 20, backgroundColor: '#f0f0f0', borderRadius: 10}}>
          <Text style={{fontSize: 16, marginBottom: 10, fontWeight: '600'}}>
            Did you send the text?
          </Text>
          <Text style={{fontSize: 14, color: '#666', marginBottom: 5}}>
            • Open your Messages app
          </Text>
          <Text style={{fontSize: 14, color: '#666', marginBottom: 5}}>
            • Send "JOIN" to +1 (606) 503-0588
          </Text>
          <Text style={{fontSize: 14, color: '#666'}}>
            • Come back here - we'll verify automatically!
          </Text>
        </View>

        <Text style={{fontSize: 14, color: '#999', textAlign: 'center', marginTop: 10}}>
          Checking for verification...
        </Text>

        {/* Resend button */}
        {resendTimer === 0 ? (
          <TouchableOpacity
            style={styles.resendButton}
            onPress={handleSendVerificationCode}
          >
            <Text style={styles.resendButtonText}>Open Messages Again</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.timerText}>
            Can resend in {resendTimer}s
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {step === 'phone' && renderPhoneStep()}
        {step === 'complete-profile' && renderCompleteProfileStep()}
        {step === 'verify-code' && renderVerifyCodeStep()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  stepContainer: {
    flex: 1,
  },
  stepContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContainer: {
    padding: 24,
    paddingTop: 0,
  },
  logoContainer: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#717171',
    marginBottom: 32,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#FF5A5F',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  appleButton: {
    width: '100%',
    height: 50,
  },
  noAppleText: {
    fontSize: 16,
    color: '#717171',
    textAlign: 'center',
    marginTop: 20,
  },
  devBypassButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#FFE066',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#B8860B',
  },
  devBypassText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8860B',
    textAlign: 'center',
  },
  inputGroup: {
    width: '100%',
    marginBottom: 16,
  },
  resendButton: {
    marginTop: 16,
    marginBottom: 8,
  },
  resendButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  timerText: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
});
