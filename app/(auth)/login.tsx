import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '../../components/KeyboardToolbar';
import { navigateForRole } from '../../lib/navigation';
import { getUserRole } from '@/services/userService';
import { auth } from '../../services/firebase';
import { signInWithApple } from '../../services/auth/appleSignIn';
import { resolveAuthEmailAccountStatus } from '../../services/auth/emailAccountStatus';
import { useGoogleAuth } from '../../services/googleAuth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Auth stack dark theme — aligned with onboarding / app chrome */
const AUTH = {
  bg: '#000000',
  card: '#171923',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  inputBg: '#1C2030',
  inputBorder: 'rgba(255,255,255,0.08)',
  placeholder: '#7D8493',
  primary: '#A855F7',
} as const;

export default function LoginScreen() {
  const router = useRouter();
  const { redirectTo, email: emailParam } = useLocalSearchParams<{
    redirectTo?: string;
    email?: string;
  }>();
  const { signInWithGoogle, loading: googleHookLoading, requestReady } =
    useGoogleAuth();
  const emailRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [email, setEmail] = useState(
    typeof emailParam === 'string' ? emailParam.trim().toLowerCase() : '',
  );
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(
    null,
  );

  const busy = loading || socialLoading !== null || googleHookLoading;

  const finishSignedIn = async () => {
    successHaptic();
    showSuccess('Welcome back 👋');
    const signedIn = auth.currentUser;
    if (redirectTo) {
      router.replace(redirectTo as Parameters<typeof router.replace>[0]);
      return;
    }
    const role = signedIn?.uid ? await getUserRole(signedIn.uid) : 'user';
    navigateForRole(role);
  };

  const handleContinue = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      showError('Please enter your email.');
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      showError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const status = await resolveAuthEmailAccountStatus(trimmed);
      const params: Record<string, string> = { email: trimmed };
      if (redirectTo) params.redirectTo = String(redirectTo);

      if (status === 'exists') {
        router.push({
          pathname: '/(auth)/password',
          params,
        } as never);
      } else {
        router.push({
          pathname: '/(auth)/account-not-found',
          params,
        } as never);
      }
    } catch (err: unknown) {
      errorHaptic();
      showFriendlyError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setSocialLoading('google');
    try {
      await signInWithGoogle();
      await finishSignedIn();
    } catch (err: unknown) {
      errorHaptic();
      showFriendlyError(err);
    } finally {
      setSocialLoading(null);
    }
  };

  const handleApple = async () => {
    setSocialLoading('apple');
    try {
      await signInWithApple();
      await finishSignedIn();
    } catch (err: unknown) {
      errorHaptic();
      showFriendlyError(err);
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardToolbar
        focusedIndex={focusedIndex}
        totalInputs={1}
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
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => void handleContinue()}
                inputAccessoryViewID={
                  Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
                }
                onFocus={() => setFocusedIndex(0)}
              />

              <TouchableOpacity
                style={[styles.primaryBtn, busy && styles.primaryBtnLoading]}
                onPress={() => void handleContinue()}
                disabled={busy}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>Continue</Text>
                )}
              </TouchableOpacity>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              <TouchableOpacity
                style={[styles.socialBtn, styles.googleBtn]}
                onPress={() => void handleGoogle()}
                disabled={busy || !requestReady}
                activeOpacity={0.9}
              >
                {socialLoading === 'google' || googleHookLoading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.socialBtnText}>Continue with Google</Text>
                )}
              </TouchableOpacity>

              {Platform.OS === 'ios' ? (
                <TouchableOpacity
                  style={[styles.socialBtn, styles.appleBtn]}
                  onPress={() => void handleApple()}
                  disabled={busy}
                  activeOpacity={0.9}
                >
                  {socialLoading === 'apple' ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.socialBtnText}>Continue with Apple</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>{"Don't have an account? "}</Text>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/register' as never)}
                disabled={busy}
              >
                <Text style={styles.link}>Sign Up</Text>
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
  keyboardAvoid: { flex: 1, backgroundColor: AUTH.bg },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: AUTH.text,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 16,
    color: AUTH.textMuted,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 36,
  },
  form: { width: '100%' },
  input: {
    borderWidth: 1,
    borderColor: AUTH.inputBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    fontSize: 16,
    color: AUTH.text,
    backgroundColor: AUTH.inputBg,
    textAlign: 'left',
    writingDirection: 'ltr',
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
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 22,
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  orText: {
    color: AUTH.textMuted,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  socialBtn: {
    borderRadius: 14,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
  },
  googleBtn: {
    backgroundColor: '#171923',
    borderColor: 'rgba(255,255,255,0.14)',
  },
  appleBtn: {
    backgroundColor: '#000000',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  socialBtnText: {
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
  link: { color: AUTH.primary, fontSize: 15, fontWeight: '700' },
});
