import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '@/components/KeyboardToolbar';
import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { auth } from '@/services/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';
import { logError } from '@/utils/errorLogger';

const LOGIN_INPUTS = 2;
const ERROR_AUTO_CLEAR_MS = 4500;

export default function LoginScreen() {
  const router = useRouter();
  const { redirectTo } = useLocalSearchParams<{ redirectTo?: string }>();
  const { signInWithEmail } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const shakeX = useRef(new Animated.Value(0)).current;
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!formError) return;
    const t = setTimeout(() => setFormError(null), ERROR_AUTO_CLEAR_MS);
    return () => clearTimeout(t);
  }, [formError]);

  const runShake = () => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, {
        toValue: 8,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: -8,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 6,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: -6,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeX, {
        toValue: 0,
        duration: 45,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const focusPrev = () => {
    if (focusedIndex !== null && focusedIndex > 0) {
      emailRef.current?.focus();
      setFocusedIndex(0);
    }
  };
  const focusNext = () => {
    if (focusedIndex !== null && focusedIndex < LOGIN_INPUTS - 1) {
      passwordRef.current?.focus();
      setFocusedIndex(1);
    }
  };

  const handleLogin = async () => {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setFormError('Please enter email and password.');
      runShake();
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      await signInWithEmail(trimmed, password);
      const signedIn = auth.currentUser;
      if (userNeedsEmailVerification(signedIn)) {
        router.replace('/verify-email' as Parameters<typeof router.replace>[0]);
        return;
      }
      if (redirectTo) {
        router.replace(redirectTo as Parameters<typeof router.replace>[0]);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: unknown) {
      logError(err, { alert: false });
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Something went wrong';
      setFormError(message);
      runShake();
    } finally {
      setLoading(false);
    }
  };

  const busy = loading;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardToolbar
        onFocusPrevious={focusPrev}
        onFocusNext={focusNext}
        focusedIndex={focusedIndex}
        totalInputs={LOGIN_INPUTS}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.content}>
          <Text style={styles.title}>HalfOrder</Text>
          <Text style={styles.subtitle}>Split meals. Pay half.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="you@example.com"
              placeholderTextColor={theme.colors.iconInactive}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setFormError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(0)}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={theme.colors.iconInactive}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setFormError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(1)}
            />
            <View style={styles.forgotRow}>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/reset-password')}
                disabled={busy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotLink}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <Animated.View
              style={[
                styles.actionBlock,
                { transform: [{ translateX: shakeX }] },
              ]}
            >
              {formError ? (
                <View style={styles.errorRow}>
                  <Text style={styles.errorIcon} accessibilityLabel="Warning">
                    ⚠️
                  </Text>
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryBtn, busy && styles.btnDisabled]}
                onPress={() => void handleLogin()}
                disabled={busy}
              >
                {loading ? (
                  <ActivityIndicator color={theme.colors.textOnPrimary} />
                ) : (
                  <Text style={styles.primaryBtnText}>Log in</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{'Don\'t have an account? '}</Text>
            <TouchableOpacity
              onPress={() => router.push('/register')}
              disabled={busy}
            >
              <Text style={styles.link}>Sign up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  keyboard: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.screen,
    paddingTop: 48,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  form: { gap: 16, width: '100%', maxWidth: 400 },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textSlateDark,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    padding: 12,
    borderRadius: 8,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -4,
    marginBottom: 0,
  },
  forgotLink: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
  },
  actionBlock: {
    width: '100%',
    marginTop: 8,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  errorIcon: {
    fontSize: 15,
    lineHeight: 20,
    marginTop: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.danger,
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: theme.colors.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.7 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: { color: theme.colors.textMuted, fontSize: 15 },
  link: { color: theme.colors.primary, fontSize: 15, fontWeight: '600' },
});
