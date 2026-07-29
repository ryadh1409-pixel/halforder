import { goBackFromProfileScreen } from '@/lib/profileBack';
import { navigateForRole } from '@/lib/navigation';
import { applySignupRole } from '@/services/authRoleAssignment';
import { ensureAuthRoleClaim } from '@/services/authRoleClaims';
import { getUserFriendlyError } from '@/services/errors';
import { db } from '@/services/firebase';
import { useActiveWorkspaceStore } from '@/store/activeWorkspaceStore';
import { useAuth } from '@/services/AuthContext';
import { logError } from '@/utils/errorLogger';
import { showError } from '@/utils/toast';
import { doc, getDoc } from 'firebase/firestore';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
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
 * Driver onboarding — confirms before applying existing driver signup logic.
 */
export default function DriverOnboardingScreen() {
  const router = useRouter();
  const { user, firestoreUserRole, reloadAuthUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const runDriverSignup = useCallback(async () => {
    console.log('[driver-activation] confirmation pressed', {
      uid: user?.uid ?? null,
      roleBeforeRefresh: firestoreUserRole ?? null,
    });

    if (!user?.uid) {
      router.push('/(auth)/register?intent=driver' as never);
      return;
    }
    if (submittingRef.current) {
      console.log('[driver-activation] ignored duplicate submit');
      return;
    }

    const uid = user.uid;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const driverRef = doc(db, 'drivers', uid);
      let existedBefore = false;
      try {
        existedBefore = (await getDoc(driverRef)).exists();
      } catch (checkError) {
        console.error('[driver-activation] driver profile check failed', {
          documentId: uid,
          error: checkError,
        });
      }
      console.log('[driver-activation] driver profile exists check', {
        documentId: uid,
        existedBefore,
      });

      // `setDoc(..., { merge: true })` inside `applySignupRole` — never duplicates.
      const role = await applySignupRole(uid, 'driver', {
        displayName: user.displayName,
      });
      const writtenSnap = await getDoc(driverRef);
      console.log('[driver-activation] firestore write result', {
        documentId: uid,
        driverDocExists: writtenSnap.exists(),
        assignedRole: role,
      });

      // Token claims gate driver marketplace reads — refresh before routing.
      await ensureAuthRoleClaim('driver');
      await reloadAuthUser().catch((reloadError) => {
        console.error('[driver-activation] auth reload failed', reloadError);
      });

      await useActiveWorkspaceStore
        .getState()
        .activateWorkspace(uid, 'driver', 'driver');
      const workspaceState = useActiveWorkspaceStore.getState();
      console.log('[driver-activation] context refresh completed', {
        roleAfterRefresh: role,
        activeWorkspace: workspaceState.activeWorkspace,
        availableWorkspaces: workspaceState.availableWorkspaces,
        workspaceReady: workspaceState.ready,
      });

      console.log('[driver-activation] navigating to driver dashboard');
      navigateForRole(role);
    } catch (e) {
      logError(e);
      console.error('[driver-activation] activation failed', e);
      showError(getUserFriendlyError(e));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    firestoreUserRole,
    reloadAuthUser,
    router,
    user?.displayName,
    user?.uid,
  ]);

  const onBecomeDriver = useCallback(() => {
    if (submitting) return;
    Alert.alert(
      'Become a Driver?',
      'Are you sure you want to create a Driver account? You can switch between User and Driver at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            void runDriverSignup();
          },
        },
      ],
    );
  }, [runDriverSignup, submitting]);

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
          account and switch to Driver mode whenever you are ready to earn.
        </Text>

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
        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
          onPress={onBecomeDriver}
          activeOpacity={0.85}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Become a Driver"
        >
          {submitting ? (
            <ActivityIndicator color={pal.onPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>Become a Driver</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => goBackFromProfileScreen(router)}
          activeOpacity={0.75}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
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
