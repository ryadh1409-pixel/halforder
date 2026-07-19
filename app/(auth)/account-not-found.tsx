import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AUTH = {
  bg: '#000000',
  text: '#FFFFFF',
  textMuted: '#B7BDC9',
  primary: '#A855F7',
  surface: '#171923',
  border: 'rgba(255,255,255,0.1)',
} as const;

export default function AccountNotFoundScreen() {
  const router = useRouter();
  const { email: emailParam, redirectTo, intent } = useLocalSearchParams<{
    email?: string;
    redirectTo?: string;
    intent?: string;
  }>();

  const email = useMemo(() => {
    const raw = typeof emailParam === 'string' ? emailParam : '';
    return raw.trim().toLowerCase();
  }, [emailParam]);

  const openCreateAccount = () => {
    const params: Record<string, string> = {};
    if (email) params.email = email;
    if (redirectTo) params.redirectTo = String(redirectTo);
    if (intent) params.intent = String(intent);
    router.push({
      pathname: '/(auth)/register',
      params,
    } as never);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>No account found</Text>
        <Text style={styles.subtitle}>We couldn't find an account with:</Text>
        <View style={styles.emailCard}>
          <Text style={styles.emailText} numberOfLines={2}>
            {email || '—'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={openCreateAccount}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.back()}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AUTH.text,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
    color: AUTH.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  emailCard: {
    marginTop: 20,
    marginBottom: 32,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: AUTH.surface,
    borderWidth: 1,
    borderColor: AUTH.border,
  },
  emailText: {
    fontSize: 16,
    fontWeight: '700',
    color: AUTH.text,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: AUTH.primary,
    borderRadius: 14,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 14,
    height: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AUTH.border,
    backgroundColor: AUTH.surface,
  },
  secondaryBtnText: {
    color: AUTH.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
