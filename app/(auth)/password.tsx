import { KeyboardToolbar, KEYBOARD_TOOLBAR_NATIVE_ID } from '../../components/KeyboardToolbar';
import { navigateForRole } from '../../lib/navigation';
import { getUserRole } from '@/services/userService';
import { useAuth } from '../../services/AuthContext';
import { auth } from '../../services/firebase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
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
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { errorHaptic, successHaptic } from '../../utils/haptics';
import { showError, showFriendlyError, showSuccess } from '../../utils/toast';

const AUTH = {
  bg: '#000000',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  inputBg: '#1C2030',
  inputBorder: 'rgba(255,255,255,0.08)',
  placeholder: '#7D8493',
  primary: '#A855F7',
} as const;

export default function PasswordScreen() {
  const router = useRouter();
  const { email: emailParam, redirectTo } = useLocalSearchParams<{
    email?: string;
    redirectTo?: string;
  }>();
  const { signInWithEmail } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const email = useMemo(() => {
    const raw = typeof emailParam === 'string' ? emailParam : '';
    return raw.trim().toLowerCase();
  }, [emailParam]);

  const handleLogin = async () => {
    if (!email) {
      showError('Missing email. Go back and enter your email.');
      return;
    }
    if (!password) {
      showError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(email, password);
      successHaptic();
      showSuccess('Welcome back 👋');
      const signedIn = auth.currentUser;
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
      <KeyboardToolbar focusedIndex={focusedIndex} totalInputs={1} />
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
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={12}
            disabled={loading}
            accessibilityLabel="Go back"
          >
            <MaterialIcons name="arrow-back" size={24} color={AUTH.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Enter your password to continue</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyText} numberOfLines={1}>
                {email || '—'}
              </Text>
            </View>

            <Text style={styles.label}>Password</Text>
            <AppTextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={AUTH.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              editable={!loading}
              returnKeyType="go"
              onSubmitEditing={() => void handleLogin()}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? KEYBOARD_TOOLBAR_NATIVE_ID : undefined
              }
              onFocus={() => setFocusedIndex(0)}
              autoFocus
            />

            <View style={styles.forgotRow}>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/(auth)/reset-password',
                    params: email ? { email } : undefined,
                  } as never)
                }
                disabled={loading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotLink}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnLoading]}
              onPress={() => void handleLogin()}
              disabled={loading}
              activeOpacity={0.9}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Log In</Text>
              )}
            </TouchableOpacity>
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
    paddingTop: 12,
    paddingBottom: 120,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AUTH.text,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    color: AUTH.textMuted,
    marginTop: 8,
    marginBottom: 28,
  },
  form: { width: '100%', maxWidth: 400 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: AUTH.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: AUTH.inputBorder,
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    backgroundColor: '#171923',
  },
  readOnlyText: {
    fontSize: 16,
    fontWeight: '600',
    color: AUTH.text,
  },
  input: {
    borderWidth: 1,
    borderColor: AUTH.inputBorder,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: AUTH.text,
    backgroundColor: AUTH.inputBg,
    marginBottom: 8,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  forgotLink: {
    fontSize: 14,
    color: AUTH.primary,
    fontWeight: '600',
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
});
