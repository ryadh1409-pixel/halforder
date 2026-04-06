import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { auth } from '@/services/firebase';
import { logError } from '@/utils/errorLogger';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '@/constants/theme';

const c = theme.colors;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, loading, reloadAuthUser, signOutUser } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/(auth)/login' as Parameters<typeof router.replace>[0]);
      return;
    }
    if (!userNeedsEmailVerification(user)) {
      router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
    }
  }, [loading, user, router]);

  const onVerified = async () => {
    setBusy(true);
    try {
      await reloadAuthUser();
      const u = auth.currentUser;
      if (u?.emailVerified) {
        router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
      } else {
        Alert.alert(
          'Please verify your email',
          'Open the link we sent, then tap I verified again.',
        );
      }
    } catch (e) {
      logError(e, { alert: false });
      Alert.alert('Error', 'Could not refresh your account. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.banner}>
        <MaterialIcons name="mark-email-unread" size={20} color="#FBBF24" style={styles.bannerIcon} />
        <Text style={styles.bannerText}>Email not verified</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.bodyText}>
          Check your email to verify your account. We sent a link to your email.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={() => void onVerified()}
          disabled={busy}
          activeOpacity={0.9}
        >
          {busy ? (
            <ActivityIndicator color={c.textOnPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>I verified</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => void signOutUser()}
          disabled={busy}
          hitSlop={12}
        >
          <Text style={styles.secondaryText}>Use a different account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.sheetDark,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.14)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(251, 191, 36, 0.35)',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  bannerIcon: {
    marginRight: 8,
  },
  bannerText: {
    color: '#FDE68A',
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: c.white,
    letterSpacing: -0.4,
    marginBottom: 14,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    color: c.textSecondary,
    marginBottom: 32,
  },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.65 },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
  secondaryBtn: {
    marginTop: 24,
    alignSelf: 'center',
    paddingVertical: 8,
  },
  secondaryText: {
    fontSize: 15,
    color: c.textSecondary,
    fontWeight: '600',
  },
});
