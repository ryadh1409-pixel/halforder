import { feeOrFreeLabel, formatHstLabel, moneyLabel } from '@/lib/orderPricing';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useAccountSavedLocation } from '@/hooks/useAccountSavedLocation';
import { IWantAddressStep } from '@/components/iWant/IWantAddressStep';
import { IWantRestaurantStep } from '@/components/iWant/IWantRestaurantStep';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import {
  createIWantOrder,
  quoteIWantPricing,
} from '@/services/iWant/createIWantOrder';
import { reverseGeocodeCoordinatesSafe } from '@/services/places/googlePlacesClient';
import {
  EMO_AI_BG,
  EMO_AI_PURPLE,
  EMO_AI_PURPLE_SOFT,
  EMO_AI_SURFACE,
} from '@/types/emoAi';
import type {
  IWantAddressDraft,
  IWantMealDraft,
  IWantRestaurantDraft,
} from '@/types/iWant';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { showError, showSuccess } from '@/utils/toast';

type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; title: string }[] = [
  { id: 1, title: 'Restaurant' },
  { id: 2, title: 'Meal' },
  { id: 3, title: 'Address' },
  { id: 4, title: 'Summary' },
];

function cityFromAddressLine(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // "Street, City, Province …" or "Street, City Province Postal, Country"
  const candidate = parts.length >= 3 ? parts[1]! : parts[parts.length - 1]!;
  const cleaned = candidate
    .replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi, '')
    .replace(/\b[A-Z]{2}\b/g, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

export default function IWantWizardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const { saved } = useAccountSavedLocation('users', uid);
  const { userCoords } = useHomeMarketplaceLocation();

  const [step, setStep] = useState<Step>(1);
  const [restaurant, setRestaurant] = useState<IWantRestaurantDraft | null>(null);
  const [searchCity, setSearchCity] = useState<string | null>(null);

  const [mealName, setMealName] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [confirmedAddress, setConfirmedAddress] =
    useState<IWantAddressDraft | null>(null);

  const address: IWantAddressDraft | null = useMemo(() => {
    if (confirmedAddress) return confirmedAddress;
    if (
      saved &&
      typeof saved.latitude === 'number' &&
      typeof saved.longitude === 'number' &&
      saved.address?.trim()
    ) {
      return {
        address: saved.address.trim(),
        lat: saved.latitude,
        lng: saved.longitude,
      };
    }
    return null;
  }, [confirmedAddress, saved]);

  const meal: IWantMealDraft | null = useMemo(() => {
    const price = Number.parseFloat(estimatedPrice);
    const qty = Number.parseInt(quantity, 10);
    if (!mealName.trim() || !Number.isFinite(price) || price <= 0) return null;
    return {
      mealName: mealName.trim(),
      estimatedPrice: price,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      notes: notes.trim(),
    };
  }, [estimatedPrice, mealName, notes, quantity]);

  const pricing = useMemo(
    () =>
      meal
        ? quoteIWantPricing({
            estimatedPrice: meal.estimatedPrice,
            quantity: meal.quantity,
          })
        : null,
    [meal],
  );

  const searchOrigin = useMemo(() => {
    if (
      address &&
      Number.isFinite(address.lat) &&
      Number.isFinite(address.lng)
    ) {
      return { latitude: address.lat, longitude: address.lng };
    }
    if (
      userCoords &&
      Number.isFinite(userCoords.lat) &&
      Number.isFinite(userCoords.lng)
    ) {
      return { latitude: userCoords.lat, longitude: userCoords.lng };
    }
    return null;
  }, [address, userCoords]);

  const fallbackMapCoords = useMemo(() => {
    if (searchOrigin) return searchOrigin;
    return null;
  }, [searchOrigin]);

  useEffect(() => {
    const fromSaved = saved?.city?.trim() || cityFromAddressLine(saved?.address);
    if (fromSaved) {
      setSearchCity(fromSaved);
      return;
    }

    if (!searchOrigin) {
      setSearchCity(null);
      return;
    }

    let cancelled = false;
    void reverseGeocodeCoordinatesSafe(
      searchOrigin.latitude,
      searchOrigin.longitude,
    ).then((result) => {
      if (cancelled || !result.ok) return;
      const city =
        result.city?.trim() || cityFromAddressLine(result.address);
      if (city) setSearchCity(city);
    });

    return () => {
      cancelled = true;
    };
  }, [saved?.address, saved?.city, searchOrigin]);

  const goBack = useCallback(() => {
    if (step === 1) {
      router.back();
      return;
    }
    setStep((s) => (s - 1) as Step);
  }, [router, step]);

  const selectRestaurant = useCallback((row: IWantRestaurantDraft) => {
    setRestaurant(row);
    setStep(2);
  }, []);

  const continueFromMeal = useCallback(() => {
    if (!meal) {
      showError('Enter a meal name and estimated price.');
      return;
    }
    setStep(3);
  }, [meal]);

  const continueFromAddress = useCallback((draft: IWantAddressDraft) => {
    setConfirmedAddress(draft);
    setStep(4);
  }, []);

  const placeOrder = useCallback(async () => {
    if (!uid) {
      router.push('/(auth)/login?redirectTo=/i-want' as never);
      return;
    }
    if (!restaurant || !meal || !address) {
      showError('Complete each step before paying.');
      return;
    }
    setSubmitting(true);
    try {
      const { orderId } = await createIWantOrder({
        restaurant,
        meal,
        address,
      });
      showSuccess('Order created — continue to secure payment');
      router.replace({
        pathname: '/checkout',
        params: { orderId },
      } as never);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not create order.');
    } finally {
      setSubmitting(false);
    }
  }, [address, meal, restaurant, router, uid]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={goBack} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Order with Emo</Text>
            <Text style={styles.headerTitle}>
              {STEPS.find((s) => s.id === step)?.title}
            </Text>
          </View>
          <View style={styles.backBtnSpacer} />
        </View>

        <View style={styles.progressRow}>
          {STEPS.map((s) => (
            <View
              key={s.id}
              style={[
                styles.progressDot,
                step >= s.id && styles.progressDotOn,
                step === s.id && styles.progressDotCurrent,
              ]}
            />
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={step !== 3}
        >
          <Animated.View
            key={step}
            entering={FadeInRight.duration(280)}
            exiting={FadeOutLeft.duration(180)}
          >
            {step === 1 ? (
              <IWantRestaurantStep
                origin={searchOrigin}
                city={searchCity}
                onSelect={selectRestaurant}
              />
            ) : null}

            {step === 2 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Meal details</Text>
                {restaurant ? (
                  <Text style={styles.restaurantChip}>{restaurant.name}</Text>
                ) : null}

                <Text style={styles.label}>Meal name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Spicy chicken bowl"
                  placeholderTextColor="#64748B"
                  value={mealName}
                  onChangeText={setMealName}
                />

                <Text style={styles.label}>Estimated meal price (CAD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="18.00"
                  placeholderTextColor="#64748B"
                  keyboardType="decimal-pad"
                  value={estimatedPrice}
                  onChangeText={setEstimatedPrice}
                />

                <Text style={styles.label}>Quantity</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor="#64748B"
                  keyboardType="number-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                />

                <Text style={styles.label}>Optional notes</Text>
                <TextInput
                  style={[styles.input, styles.notes]}
                  placeholder="No onions, extra cheese, medium spicy…"
                  placeholderTextColor="#64748B"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                <Pressable style={styles.primaryBtn} onPress={continueFromMeal}>
                  <Text style={styles.primaryBtnTxt}>Continue</Text>
                </Pressable>
              </View>
            ) : null}

            {step === 3 ? (
              <IWantAddressStep
                uid={uid}
                saved={saved}
                fallbackCoords={fallbackMapCoords}
                onConfirmed={continueFromAddress}
              />
            ) : null}

            {step === 4 && restaurant && meal && address && pricing ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Order summary</Text>
                <View style={styles.summaryCard}>
                  <SummaryRow label="Restaurant" value={restaurant.name} />
                  <SummaryRow label="Meal" value={meal.mealName} />
                  <SummaryRow label="Quantity" value={String(meal.quantity)} />
                  {meal.notes ? (
                    <SummaryRow label="Notes" value={meal.notes} />
                  ) : null}
                  <SummaryRow
                    label="Estimated meal cost"
                    value={moneyLabel(pricing.foodSubtotal)}
                  />
                  <SummaryRow
                    label="Delivery fee"
                    value={feeOrFreeLabel(pricing.deliveryFee)}
                  />
                  <SummaryRow
                    label="Service fee"
                    value={feeOrFreeLabel(pricing.serviceFee)}
                  />
                  <SummaryRow
                    label={formatHstLabel(pricing.taxRate)}
                    value={moneyLabel(pricing.hst)}
                  />
                  <View style={styles.divider} />
                  <SummaryRow
                    label="Total"
                    value={moneyLabel(pricing.totalPaid)}
                    bold
                  />
                </View>

                <Text style={styles.payHint}>
                  You’ll pay securely before a driver accepts. Your driver purchases
                  the meal and delivers it to you.
                </Text>

                <Pressable
                  style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                  disabled={submitting}
                  onPress={() => void placeOrder()}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={16} color="#FFF" />
                      <Text style={styles.primaryBtnTxt}>
                        Pay {moneyLabel(pricing.totalPaid)}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, bold && styles.summaryBold]}>{label}</Text>
      <Text style={[styles.summaryValue, bold && styles.summaryBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: EMO_AI_BG },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backBtnSpacer: { width: 40 },
  headerCopy: { flex: 1, alignItems: 'center' },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C084FC',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 12,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  progressDotOn: { backgroundColor: 'rgba(168,85,247,0.45)' },
  progressDotCurrent: {
    width: 22,
    borderRadius: 4,
    backgroundColor: EMO_AI_PURPLE,
  },
  body: { paddingHorizontal: 20, paddingBottom: 40 },
  section: { gap: 4 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '800',
    color: '#B7BDC9',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    backgroundColor: EMO_AI_SURFACE,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  notes: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: EMO_AI_PURPLE,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnDisabled: { opacity: 0.55 },
  primaryBtnTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  restaurantChip: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: EMO_AI_PURPLE_SOFT,
    color: '#E9D5FF',
    fontWeight: '800',
    overflow: 'hidden',
  },
  summaryCard: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  summaryLabel: { flex: 1, color: '#B7BDC9', fontWeight: '600', fontSize: 14 },
  summaryValue: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  summaryBold: { color: '#C084FC', fontWeight: '900', fontSize: 16 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 8,
  },
  payHint: {
    marginTop: 14,
    color: '#B7BDC9',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
    textAlign: 'center',
  },
});
