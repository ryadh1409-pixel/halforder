import { userNeedsEmailVerification } from '@/lib/authEmailVerification';
import { useAuth } from '@/services/AuthContext';
import { auth } from '@/services/firebase';
import { logError } from '@/utils/errorLogger';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { sendEmailVerification } from 'firebase/auth';
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
const COOLDOWN_SEC = 30;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { user, loading: authLoading, reloadAuthUser, signOutUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  const [messageIsSuccess, setMessageIsSuccess] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/(auth)/login' as Parameters<typeof router.replace>[0]);
      return;
    }
    if (!userNeedsEmailVerification(user)) {
      router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onVerified = async () => {
    setLoading(true);
    setMessage('');
    try {
      await reloadAuthUser();
      const u = auth.currentUser;
      if (u?.emailVerified) {
        router.replace('/(tabs)' as Parameters<typeof router.replace>[0]);
      } else {
        Alert.alert('Please verify your email first', 'Open the link we sent, then try again.');
      }
    } catch (e) {
      logError(e, { alert: false });
      Alert.alert('Error', 'Could not refresh your account. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;

    const u = auth.currentUser;
    if (!u?.email) {
      setMessageIsSuccess(false);
      setMessage('Something went wrong. Try again.');
      return;
    }

    try {
      setResendLoading(true);
      setMessage('');
      await sendEmailVerification(u);
      setMessageIsSuccess(true);
      setMessage('Verification email sent again 📩');
      setCooldown(COOLDOWN_SEC);
    } catch (error) {
      logError(error, { alert: false });
      setMessageIsSuccess(false);
      setMessage('Something went wrong. Try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const resendDisabled = resendLoading || cooldown > 0 || loading;
  const resendLabel = resendLoading
    ? 'Sending...'
    : cooldown > 0
      ? `Resend in ${cooldown}s`
      : 'Resend Email';

  const anyBusy = loading || resendLoading;

  if (authLoading || !user) {
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
          We sent a verification link to your email. Open it to confirm your account, then tap I
          verified.
        </Text>

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.btnBusy]}
          onPress={() => void onVerified()}
          disabled={anyBusy}
          activeOpacity={0.9}
        >
          {loading ? (
            <ActivityIndicator color={c.textOnPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>I verified</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryBtn,
            resendDisabled && styles.secondaryBtnDisabled,
          ]}
          onPress={() => void handleResend()}
          disabled={resendDisabled}
          activeOpacity={0.85}
        >
          {resendLoading ? (
            <View style={styles.resendRow}>
              <ActivityIndicator color={c.primary} size="small" style={styles.resendSpinner} />
              <Text style={[styles.secondaryBtnText, styles.secondaryBtnTextMuted]}>
                Sending...
              </Text>
            </View>
          ) : (
            <View style={styles.resendRow}>
              <MaterialIcons
                name="refresh"
                size={20}
                color={cooldown > 0 ? c.iconInactive : c.primary}
                style={styles.resendIcon}
              />
              <Text
                style={[
                  styles.secondaryBtnText,
                  cooldown > 0 && styles.secondaryBtnTextMuted,
                ]}
              >
                {resendLabel}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {message !== '' ? (
          <Text
            style={[
              styles.feedbackText,
              messageIsSuccess ? styles.feedbackSuccess : styles.feedbackError,
            ]}
            accessibilityLiveRegion="polite"
          >
            {message}
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.footerLinkWrap}
          onPress={() => void signOutUser()}
          disabled={anyBusy}
          hitSlop={12}
        >
          <Text style={styles.footerLink}>Use a different account</Text>
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
    paddingTop: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: c.white,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  bodyText: {
    fontSize: 16,
    lineHeight: 24,
    color: c.textSecondary,
    marginBottom: 36,
  },
  primaryBtn: {
    backgroundColor: c.primary,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBusy: {
    opacity: 0.85,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: c.textOnPrimary,
  },
  secondaryBtn: {
    marginTop: 16,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
  },
  secondaryBtnDisabled: {
    opacity: 0.55,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendIcon: {
    marginRight: 8,
  },
  resendSpinner: {
    marginRight: 10,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: c.primary,
  },
  secondaryBtnTextMuted: {
    color: c.textSecondary,
  },
  feedbackText: {
    marginTop: 14,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textAlign: 'center',
  },
  feedbackSuccess: {
    color: c.success,
  },
  feedbackError: {
    color: c.danger,
  },
  footerLinkWrap: {
    marginTop: 28,
    alignSelf: 'center',
    paddingVertical: 8,
  },
  footerLink: {
    fontSize: 15,
    color: c.textSecondary,
    fontWeight: '600',
  },
});
