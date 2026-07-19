import { auth } from '../../services/firebase';
import { sendPasswordResetEmail } from '@firebase/auth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppTextInput } from '../../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getUserFriendlyError } from '../../utils/errorHandler';

const AUTH = {
  bg: '#000000',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  inputBg: '#1C2030',
  inputBorder: 'rgba(255,255,255,0.08)',
  placeholder: '#7D8493',
  primary: '#A855F7',
  success: '#22C55E',
  danger: '#EF4444',
} as const;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(
    typeof emailParam === 'string' ? emailParam.trim().toLowerCase() : '',
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleReset = async () => {
    const trimmed = email.trim();
    setError('');
    setMessage('');
    if (!trimmed) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setMessage('Check your email to reset your password.');
    } catch (err: unknown) {
      setError(getUserFriendlyError(err, 'passwordReset'));
    } finally {
      setLoading(false);
    }
  };

  const busy = loading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            {"Enter your email and we'll send you a link to reset your password."}
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <AppTextInput
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={AUTH.placeholder}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
                setMessage('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.messageText}>{message}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={() => void handleReset()}
              disabled={busy}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Send Reset Email</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              disabled={busy}
            >
              <Text style={styles.backBtnText}>Back to login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },
  keyboard: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AUTH.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: AUTH.textMuted,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  form: { gap: 16, width: '100%', maxWidth: 400 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: AUTH.text,
  },
  input: {
    borderWidth: 1,
    borderColor: AUTH.inputBorder,
    padding: 14,
    borderRadius: 12,
    color: AUTH.text,
    backgroundColor: AUTH.inputBg,
    fontSize: 16,
  },
  errorText: {
    fontSize: 14,
    color: AUTH.danger,
    marginTop: 4,
    textAlign: 'center',
  },
  messageText: {
    fontSize: 14,
    color: AUTH.success,
    marginTop: 4,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: AUTH.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  backBtnText: {
    fontSize: 15,
    color: AUTH.primary,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.7 },
});
