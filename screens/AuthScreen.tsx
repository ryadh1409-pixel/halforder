import { signInWithApple } from '../services/auth/appleSignIn';
import { useGoogleAuth } from '../services/googleAuth';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Provider = 'google' | 'apple' | null;

export default function AuthScreen() {
  const { signInWithGoogle, loading: googleLoading, error: googleError, requestReady } =
    useGoogleAuth();
  const [loadingProvider, setLoadingProvider] = useState<Provider>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handleGoogle() {
    setErrorText(null);
    setLoadingProvider('google');
    try {
      await signInWithGoogle();
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Google sign-in failed.');
    } finally {
      setLoadingProvider(null);
    }
  }

  async function handleApple() {
    setErrorText(null);
    setLoadingProvider('apple');
    try {
      await signInWithApple();
    } catch (e) {
      setErrorText(e instanceof Error ? e.message : 'Apple sign-in failed.');
    } finally {
      setLoadingProvider(null);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>Welcome to HalfOrder</Text>
        <Text style={styles.subtitle}>Sign in to join shared meals and track live orders.</Text>

        <Pressable
          style={[styles.button, styles.googleButton]}
          onPress={() => void handleGoogle()}
          disabled={loadingProvider !== null || !requestReady}
        >
          {loadingProvider === 'google' || googleLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Continue with Google</Text>
          )}
        </Pressable>

        {Platform.OS === 'ios' ? (
          <Pressable
            style={[styles.button, styles.appleButton]}
            onPress={() => void handleApple()}
            disabled={loadingProvider !== null}
          >
            {loadingProvider === 'apple' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>Continue with Apple</Text>
            )}
          </Pressable>
        ) : null}

        {errorText || googleError ? (
          <Text style={styles.errorText}>{errorText ?? googleError}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0F14' },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  subtitle: { color: '#9CA3AF', marginTop: 8, marginBottom: 20, fontSize: 15 },
  button: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  googleButton: { backgroundColor: '#2563EB' },
  appleButton: { backgroundColor: '#111827' },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  errorText: { color: '#FCA5A5', marginTop: 10, fontWeight: '600' },
});
