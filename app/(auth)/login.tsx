import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '../../components/KeyboardToolbar';
import { userNeedsEmailVerification } from '../../lib/authEmailVerification';
import { navigateForRole } from '../../lib/navigation';
import { getUserRole } from '@/services/userService';
import { useAuth } from '../../services/AuthContext';
import { auth } from '../../services/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppTextInput } from '../../components/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorHaptic, successHaptic } from '../../utils/haptics';
import { showError, showFriendlyError, showSuccess } from '../../utils/toast';

const LOGIN_INPUTS = 2;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Auth stack dark theme — aligned with onboarding / app chrome */
const AUTH = {
  bg: '#09090B',
  card: '#171923',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  inputBg: '#1C2030',
  inputBorder: 'rgba(255,255,255,0.08)',
  placeholder: '#7D8493',
  primary: '#FF6B35',
} as const;

export default function LoginScreen() {
  const router = useRouter();
  const { redirectTo } = useLocalSearchParams<{ redirectTo?: string }>();
  const { signInWithEmail } = useAuth();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const scale = useRef(new Animated.Value(1)).current;
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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

  const validateFields = (): boolean => {
    const trimmed = email.trim();
    if (!trimmed) {
      showError('Please enter your email.');
      return false;
    }
    if (!EMAIL_RE.test(trimmed)) {
      showError('Please enter a valid email address.');
      return false;
    }
    if (!password) {
      showError('Please enter your password.');
      return false;
    }
    return true;
  };

  const animatePress = () => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleLogin = async () => {
    if (!validateFields()) {
      return;
    }

    const trimmed = email.trim();
    setLoading(true);
    try {
      await signInWithEmail(trimmed, password);
      successHaptic();
      showSuccess('Welcome back 👋');
      const signedIn = auth.currentUser;
      if (userNeedsEmailVerification(signedIn)) {
        router.replace('/verify-email' as Parameters<typeof router.replace>[0]);
        return;
      }
      if (redirectTo) {
        router.replace(redirectTo as Parameters<typeof router.replace>[0]);
      } else {
        const role = signedIn?.uid ? await getUserRole(signedIn.uid) : 'user';
        navigateForRole(role);
      }
    } catch (err: unknown) {
      errorHaptic();
      showFriendlyError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardToolbar
        onFocusPrevious={focusPrev}
        onFocusNext={focusNext}
        focusedIndex={focusedIndex}
        totalInputs={LOGIN_INPUTS}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.title}>HalfOrder</Text>
            <Text style={styles.subtitle}>Split meals. Pay half.</Text>

            <View style={styles.form}>
            <AppTextInput
              ref={emailRef}
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={AUTH.placeholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(0)}
            />
            <AppTextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor={AUTH.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              editable={!loading}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(1)}
            />
            <View style={styles.forgotRow}>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/reset-password')}
                disabled={loading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotLink}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <Animated.View
              style={[styles.primaryBtnAnimated, { transform: [{ scale }] }]}
            >
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
                onPress={() => {
                  animatePress();
                  void handleLogin();
                }}
                disabled={loading}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Log in</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{'Don\'t have an account? '}</Text>
            <TouchableOpacity
              onPress={() => router.push('/register')}
              disabled={loading}
            >
              <Text style={styles.link}>Sign up</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AUTH.bg },
  keyboardAvoid: { flex: 1, backgroundColor: '#09090B' },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 120,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: AUTH.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(55,65,81,0.6)',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: AUTH.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: AUTH.textMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  form: { width: '100%' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    color: '#FFFFFF',
    backgroundColor: '#1E2230',
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  passwordInput: {
    marginBottom: 4,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  forgotLink: {
    fontSize: 14,
    color: AUTH.primary,
    fontWeight: '600',
  },
  primaryBtnAnimated: {
    width: '100%',
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: AUTH.primary,
    borderRadius: 14,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnLoading: {
    backgroundColor: '#7D8493',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  footerText: { color: AUTH.textMuted, fontSize: 15 },
  link: { color: AUTH.primary, fontSize: 15, fontWeight: '600' },
});
