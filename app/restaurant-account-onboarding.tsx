import { goBackFromProfileScreen } from '@/lib/profileBack';
import { navigateForRole } from '@/lib/navigation';
import { applySignupRole } from '@/services/authRoleAssignment';
import { setActiveWorkspace } from '@/services/activeWorkspace';
import { useActiveWorkspaceStore } from '@/store/activeWorkspaceStore';
import { useAuth } from '@/services/AuthContext';
import { logError } from '@/utils/errorLogger';
import { showError } from '@/utils/toast';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
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
  { icon: 'receipt-long' as const, label: 'Receive online orders' },
  { icon: 'groups' as const, label: 'Reach new customers' },
  { icon: 'restaurant-menu' as const, label: 'Manage your menu' },
  { icon: 'insights' as const, label: 'Track earnings' },
];

/**
 * Restaurant partner onboarding — confirms before existing restaurant signup logic.
 * Separate from Stripe `restaurant-onboarding` Connect flow.
 */
export default function RestaurantAccountOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const runRestaurantSignup = useCallback(async () => {
    if (!user?.uid) {
      router.push('/(auth)/register?intent=restaurant' as never);
      return;
    }
    setSubmitting(true);
    try {
      const role = await applySignupRole(user.uid, 'restaurant', {
        displayName: user.displayName,
      });
      await setActiveWorkspace(user.uid, 'restaurant');
      await useActiveWorkspaceStore.getState().hydrate(user.uid, 'restaurant');
      navigateForRole(role);
    } catch (e) {
      logError(e);
      showError('Could not set up restaurant account. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [router, user?.displayName, user?.uid]);

  const onCreateRestaurant = useCallback(() => {
    if (submitting) return;
    Alert.alert(
      'Create Restaurant Account?',
      'Are you sure you want to create a Restaurant account? You can switch between User and Restaurant at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            void runRestaurantSignup();
          },
        },
      ],
    );
  }, [runRestaurantSignup, submitting]);

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
        <Text style={styles.topTitle}>Restaurant</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroIconWrap}>
          <MaterialCommunityIcons
            name="store-outline"
            size={48}
            color={pal.accent}
          />
        </View>

        <Text style={styles.title}>Partner with HalfOrder</Text>
        <Text style={styles.description}>
          Grow your restaurant by reaching more customers through HalfOrder.
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
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
          onPress={onCreateRestaurant}
          activeOpacity={0.85}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Create Restaurant Account"
        >
          {submitting ? (
            <ActivityIndicator color={pal.onPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>Create Restaurant Account</Text>
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
