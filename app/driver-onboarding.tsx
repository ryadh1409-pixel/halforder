import { goBackFromProfileScreen } from '@/lib/profileBack';
import {
  formatPartnerApplicationError,
  getPendingApplicationForUser,
  submitPartnerApplication,
} from '@/services/partnerApplications';
import { useAuth } from '@/services/AuthContext';
import { logError } from '@/utils/errorLogger';
import { showError } from '@/utils/toast';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const pal = {
  bg: '#000000',
  surface: '#171923',
  border: 'rgba(168, 85, 247, 0.22)',
  text: '#FFFFFF',
  textSecondary: '#B7BDC9',
  textTertiary: '#8B93A7',
  primary: '#A855F7',
  onPrimary: '#FFFFFF',
  accent: '#FF9E40',
  warning: '#F59E0B',
} as const;

const BENEFITS = [
  { icon: 'schedule' as const, label: 'Flexible schedule' },
  { icon: 'payments' as const, label: 'Earn money' },
  { icon: 'near-me' as const, label: 'Deliver nearby' },
  { icon: 'account-balance-wallet' as const, label: 'Weekly payouts' },
];

const REQUIREMENTS = [
  { icon: 'badge' as const, label: "Valid driver's license" },
  { icon: 'directions-car' as const, label: 'Eligible vehicle if required' },
  { icon: 'smartphone' as const, label: 'Smartphone' },
];

/**
 * Driver onboarding — submits a pending application (admin must approve).
 */
export default function DriverOnboardingScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [checkingPending, setCheckingPending] = useState(true);
  const [hasPending, setHasPending] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user?.uid) {
        if (!cancelled) {
          setHasPending(false);
          setCheckingPending(false);
        }
        return;
      }
      if (firestoreUserRole === 'driver' || firestoreUserRole === 'admin') {
        if (!cancelled) {
          setHasPending(false);
          setCheckingPending(false);
        }
        return;
      }
      try {
        const pending = await getPendingApplicationForUser(user.uid, 'driver');
        if (!cancelled) setHasPending(Boolean(pending));
      } catch {
        if (!cancelled) setHasPending(false);
      } finally {
        if (!cancelled) setCheckingPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firestoreUserRole, user?.uid]);

  const runDriverApplication = useCallback(async () => {
    console.log('[driver-onboarding] Submit pressed');
    if (!user?.uid) {
      console.log('[driver-onboarding] no uid — redirect register');
      router.push('/(auth)/register?intent=driver' as never);
      return;
    }
    if (submittingRef.current) {
      console.log('[driver-onboarding] ignored duplicate submit');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      console.log('[driver-onboarding] validation passed', { uid: user.uid });
      const created = await submitPartnerApplication({ type: 'driver' });
      console.log('[driver-onboarding] submitPartnerApplication success', {
        id: created.id,
        status: created.status,
      });
      router.replace(
        '/partner-application-submitted?type=driver' as never,
      );
      console.log('[driver-onboarding] Navigation success');
    } catch (e) {
      const err = e as { code?: unknown; message?: unknown; stack?: unknown };
      console.error('[driver-onboarding] Submit failed', {
        code: err?.code,
        message: err?.message,
        stack: err?.stack,
        fullError: e,
      });
      logError(e);
      // Surface the real Firebase error while diagnosing (do not hide with generic copy).
      showError(formatPartnerApplicationError(e));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [router, user?.uid]);

  const onBecomeDriver = useCallback(() => {
    if (submitting || hasPending) return;
    Alert.alert(
      'Apply as a Driver?',
      'Submit your driver application for review. You will gain Driver access after admin approval.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit application',
          onPress: () => {
            void runDriverApplication();
          },
        },
      ],
    );
  }, [hasPending, runDriverApplication, submitting]);

  if (checkingPending) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator color={pal.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => goBackFromProfileScreen(router)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          disabled={submitting}
        >
          <Text style={styles.backLink}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Driver</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroIconWrap}>
          <MaterialCommunityIcons name="bike" size={48} color={pal.accent} />
        </View>

        <Text style={styles.title}>Become a HalfOrder Driver</Text>
        <Text style={styles.description}>
          Deliver meals in your area on your own schedule. Keep your customer
          account and switch to Driver mode after your application is approved.
        </Text>

        {hasPending ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingLabel}>Application Status</Text>
            <Text style={styles.pendingValue}>Pending Review</Text>
            <Text style={styles.pendingHint}>
              Our team is reviewing your application. Estimated review: 1–2
              business days. Driver tools stay locked until approval.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Benefits</Text>
        <View style={styles.card}>
          {BENEFITS.map((item, index) => (
            <View
              key={item.label}
              style={[
                styles.row,
                index < BENEFITS.length - 1 && styles.rowBorder,
              ]}
            >
              <View style={styles.iconWrap}>
                <MaterialIcons name={item.icon} size={20} color={pal.primary} />
              </View>
              <Text style={styles.rowLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Requirements</Text>
        <View style={styles.card}>
          {REQUIREMENTS.map((item, index) => (
            <View
              key={item.label}
              style={[
                styles.row,
                index < REQUIREMENTS.length - 1 && styles.rowBorder,
              ]}
            >
              <View style={styles.iconWrap}>
                <MaterialIcons name={item.icon} size={20} color={pal.primary} />
              </View>
              <Text style={styles.rowLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!hasPending ? (
          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={onBecomeDriver}
            activeOpacity={0.85}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Submit driver application"
          >
            {submitting ? (
              <ActivityIndicator color={pal.onPrimary} />
            ) : (
              <Text style={styles.primaryBtnText}>Submit Application</Text>
            )}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => goBackFromProfileScreen(router)}
          activeOpacity={0.75}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelBtnText}>
            {hasPending ? 'Done' : 'Cancel'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: pal.bg,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backLink: {
    fontSize: 16,
    fontWeight: '600',
    color: pal.primary,
  },
  topTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: pal.text,
    letterSpacing: -0.3,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  heroIconWrap: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 158, 64, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 158, 64, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: pal.text,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
    color: pal.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  pendingCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    padding: 16,
    marginBottom: 20,
  },
  pendingLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: pal.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pendingValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800',
    color: pal.warning,
  },
  pendingHint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: pal.textSecondary,
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: pal.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  card: {
    backgroundColor: pal.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: pal.border,
    marginBottom: 20,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: pal.border,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(168, 85, 247, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: pal.text,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: pal.border,
  },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: pal.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: pal.onPrimary,
  },
  cancelBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: pal.textTertiary,
  },
});
