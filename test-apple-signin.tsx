/**
 * Minimal Apple Sign-In Test App
 * Run this to test ONLY Apple Sign-In without the rest of the app
 * 
 * To use:
 * 1. Replace App.tsx content with this file temporarily
 * 2. Build and run on device
 * 3. Check console for detailed logs
 */

import React, { useState } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './firebaseConfig';

export default function TestAppleSignIn() {
  const [status, setStatus] = useState('Ready to test');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    console.log(message);
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testAppleSignIn = async () => {
    try {
      setStatus('Testing...');
      setLogs([]);
      
      addLog('🍎 Step 1: Checking if Apple Sign-In is available...');
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      addLog(`✅ Apple Sign-In available: ${isAvailable}`);
      
      if (!isAvailable) {
        setStatus('❌ Apple Sign-In not available on this device');
        return;
      }

      addLog('🍎 Step 2: Requesting Apple credentials...');
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      
      addLog('✅ Apple Sign-In successful!');
      addLog(`📱 User ID: ${credential.user}`);
      addLog(`📧 Email: ${credential.email || 'null'}`);
      addLog(`👤 Full Name: ${credential.fullName?.givenName || 'null'} ${credential.fullName?.familyName || 'null'}`);
      addLog(`🔑 Identity Token length: ${credential.identityToken?.length || 0}`);
      addLog(`🎫 Authorization Code length: ${credential.authorizationCode?.length || 0}`);

      addLog('🔐 Step 3: Creating Firebase credential...');
      const provider = new OAuthProvider('apple.com');
      const firebaseCredential = provider.credential({
        idToken: credential.identityToken!,
        rawNonce: credential.identityToken || undefined,
      });
      addLog('✅ Firebase credential created');

      addLog('🔥 Step 4: Signing in to Firebase...');
      addLog(`🌐 Auth domain: ${auth.config.authDomain}`);
      addLog(`🔑 API key (first 20 chars): ${auth.config.apiKey?.substring(0, 20)}`);
      addLog(`📦 Project ID: ${auth.config.projectId}`);
      
      const userCredential = await signInWithCredential(auth, firebaseCredential);
      
      addLog('✅✅✅ SUCCESS! Firebase authentication complete!');
      addLog(`👤 Firebase User ID: ${userCredential.user.uid}`);
      addLog(`📧 Firebase Email: ${userCredential.user.email}`);
      
      setStatus('✅ SUCCESS! Apple Sign-In works!');
      
      Alert.alert(
        'Success! 🎉',
        `Signed in as: ${userCredential.user.email}\nUID: ${userCredential.user.uid}`,
        [{ text: 'OK' }]
      );

    } catch (error: any) {
      addLog('❌❌❌ ERROR OCCURRED!');
      addLog(`Error code: ${error.code || 'unknown'}`);
      addLog(`Error message: ${error.message || 'unknown'}`);
      addLog(`Full error: ${JSON.stringify(error, null, 2)}`);
      
      setStatus(`❌ Error: ${error.code || error.message}`);
      
      Alert.alert(
        'Error',
        `Code: ${error.code}\nMessage: ${error.message}`,
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Apple Sign-In Test</Text>
      <Text style={styles.status}>{status}</Text>
      
      <Button title="Test Apple Sign-In" onPress={testAppleSignIn} />
      
      <View style={styles.logsContainer}>
        <Text style={styles.logsTitle}>Logs:</Text>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>{log}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  logsContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    maxHeight: 400,
  },
  logsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});
