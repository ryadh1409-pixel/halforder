import { LOCATION_PALETTE_DARK } from '@/components/location/locationPalette';
import { feeOrFreeLabel, formatHstLabel, moneyLabel } from '@/lib/orderPricing';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { useAuth } from '@/services/AuthContext';
import { useAccountSavedLocation } from '@/hooks/useAccountSavedLocation';
import { AccountLocationPicker } from '@/components/location/AccountLocationPicker';
import { IWantRestaurantStep } from '@/components/iWant/IWantRestaurantStep';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import {
  createIWantOrder,
  quoteIWantPricing,
} from '@/services/iWant/createIWantOrder';
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
import React, { useCallback, useMemo, useState } from 'react';
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

const LOCATION_PALETTE = {
  ...LOCATION_PALETTE_DARK,
  primary: EMO_AI_PURPLE,
};

export default function IWantWizardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const uid = isRegisteredAuthUser(user) ? user!.uid : null;
  const { saved } = useAccountSavedLocation('users', uid);
  const { userCoords } = useHomeMarketplaceLocation();

  const [step, setStep] = useState<Step>(1);
  const [restaurant, setRestaurant] = useState<IWantRestaurantDraft | null>(null);

  const [mealName, setMealName] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);

  const address: IWantAddressDraft | null = useMemo(() => {
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
  }, [saved]);

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

  const continueFromAddress = useCallback(() => {
    if (!address) {
      showError('Set a delivery address to continue.');
      return;
    }
    setStep(4);
  }, [address]);

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
        >
          <Animated.View
            key={step}
            entering={FadeInRight.duration(280)}
            exiting={FadeOutLeft.duration(180)}
          >
            {step === 1 ? (
              <IWantRestaurantStep
                origin={searchOrigin}
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
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Delivery address</Text>
                <Text style={styles.sectionSub}>
                  Uses your HalfOrder delivery address.
                </Text>
                {address ? (
                  <View style={styles.addressCard}>
                    <Ionicons name="location" size={18} color={EMO_AI_PURPLE} />
                    <Text style={styles.addressTxt}>{address.address}</Text>
                  </View>
                ) : (
                  <Text style={styles.sectionSub}>
                    Save an address below to continue.
                  </Text>
                )}
                <AccountLocationPicker
                  role="user"
                  accountId={uid}
                  palette={LOCATION_PALETTE}
                  title="Update delivery address"
                  hint="Search or use GPS — same address system as checkout."
                />
                <Pressable
                  style={[styles.primaryBtn, !address && styles.btnDisabled]}
                  disabled={!address}
                  onPress={continueFromAddress}
                >
                  <Text style={styles.primaryBtnTxt}>Continue</Text>
                </Pressable>
              </View>
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
  sectionSub: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B7BDC9',
    marginBottom: 16,
    lineHeight: 20,
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
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.28)',
    marginBottom: 14,
  },
  addressTxt: {
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
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
