import { goBackFromProfileScreen } from '@/lib/profileBack';
import {
  getPendingApplicationForUser,
  submitPartnerApplication,
} from '@/services/partnerApplications';
import { useAuth } from '@/services/AuthContext';
import { logError } from '@/utils/errorLogger';
import { showError } from '@/utils/toast';
import { AppTextInput } from '@/components/AppTextInput';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
  placeholder: '#6B7280',
} as const;

const BENEFITS = [
  { icon: 'receipt-long' as const, label: 'Receive online orders' },
  { icon: 'groups' as const, label: 'Reach new customers' },
  { icon: 'restaurant-menu' as const, label: 'Manage your menu' },
  { icon: 'insights' as const, label: 'Track earnings' },
];

/**
 * Restaurant partner onboarding — submits a pending application (admin must approve).
 * Separate from Stripe `restaurant-onboarding` Connect flow.
 */
export default function RestaurantAccountOnboardingScreen() {
  const router = useRouter();
  const { user, firestoreUserRole } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [checkingPending, setCheckingPending] = useState(true);
  const [hasPending, setHasPending] = useState(false);
  const [restaurantName, setRestaurantName] = useState('');
  const [address, setAddress] = useState('');
  const [cuisine, setCuisine] = useState('');

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
      if (
        firestoreUserRole === 'restaurant' ||
        firestoreUserRole === 'host' ||
        firestoreUserRole === 'admin'
      ) {
        if (!cancelled) {
          setHasPending(false);
          setCheckingPending(false);
        }
        return;
      }
      try {
        const pending = await getPendingApplicationForUser(
          user.uid,
          'restaurant',
        );
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

  useEffect(() => {
    if (user?.displayName && !restaurantName) {
      setRestaurantName(user.displayName);
    }
  }, [restaurantName, user?.displayName]);

  const runRestaurantApplication = useCallback(async () => {
    if (!user?.uid) {
      router.push('/(auth)/register?intent=restaurant' as never);
      return;
    }
    const name = restaurantName.trim();
    if (!name) {
      showError('Please enter your restaurant name.');
      return;
    }
    setSubmitting(true);
    try {
      await submitPartnerApplication({
        type: 'restaurant',
        restaurantName: name,
        address: address.trim() || null,
        cuisine: cuisine.trim() || null,
        onboardingData: {
          restaurantName: name,
          address: address.trim() || null,
          cuisine: cuisine.trim() || null,
        },
      });
      router.replace(
        '/partner-application-submitted?type=restaurant' as never,
      );
    } catch (e) {
      logError(e);
      showError('Could not submit restaurant application. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [address, cuisine, restaurantName, router, user?.uid]);

  const onCreateRestaurant = useCallback(() => {
    if (submitting || hasPending) return;
    Alert.alert(
      'Submit Restaurant Application?',
      'Your restaurant will become active only after admin approval.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit application',
          onPress: () => {
            void runRestaurantApplication();
          },
        },
      ],
    );
  }, [hasPending, runRestaurantApplication, submitting]);

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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
          keyboardShouldPersistTaps="handled"
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

          {hasPending ? (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingLabel}>Application Status</Text>
              <Text style={styles.pendingValue}>Pending Review</Text>
              <Text style={styles.pendingHint}>
                Our team is reviewing your application. Estimated review: 1–2
                business days. Restaurant tools stay locked until approval.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Restaurant details</Text>
              <View style={styles.formCard}>
                <Text style={styles.inputLabel}>Restaurant name</Text>
                <AppTextInput
                  style={styles.input}
                  value={restaurantName}
                  onChangeText={setRestaurantName}
                  placeholder="e.g. Green Bowl Kitchen"
                  placeholderTextColor={pal.placeholder}
                  editable={!submitting}
                />
                <Text style={styles.inputLabel}>Address</Text>
                <AppTextInput
                  style={[styles.input, styles.inputMulti]}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Service address"
                  placeholderTextColor={pal.placeholder}
                  multiline
                  editable={!submitting}
                />
                <Text style={styles.inputLabel}>Cuisine</Text>
                <AppTextInput
                  style={styles.input}
                  value={cuisine}
                  onChangeText={setCuisine}
                  placeholder="e.g. Mediterranean"
                  placeholderTextColor={pal.placeholder}
                  editable={!submitting}
                />
              </View>
            </>
          )}

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
                  <MaterialIcons
                    name={item.icon}
                    size={20}
                    color={pal.primary}
                  />
                </View>
                <Text style={styles.rowLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {!hasPending ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                submitting && styles.primaryBtnDisabled,
              ]}
              onPress={onCreateRestaurant}
              activeOpacity={0.85}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Submit restaurant application"
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: pal.bg,
  },
  flex: { flex: 1 },
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
  formCard: {
    backgroundColor: pal.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: pal.border,
    padding: 14,
    marginBottom: 20,
    gap: 8,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: pal.textTertiary,
    marginTop: 4,
  },
  input: {
    backgroundColor: '#0F1117',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: pal.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: pal.text,
    fontSize: 15,
    fontWeight: '600',
  },
  inputMulti: {
    minHeight: 72,
    textAlignVertical: 'top',
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
