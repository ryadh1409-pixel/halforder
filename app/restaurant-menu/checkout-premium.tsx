/**
 * Marketplace checkout — Uber Eats–tier layout composed from `components/checkout/*`.
 * Firebase: cart via `CartContext`, restaurant/menu via hooks, orders via `createOrder`,
 * payouts readiness via `resolveRestaurantPaymentsReady`.
 */
import {
  AddressRow,
  CheckoutHeader,
  CheckoutOrderSummary,
  CheckoutPriceBreakdown,
  CheckoutSkeleton,
  DeliveryMapCard,
  DeliverySegment,
  DeliveryTimingStrip,
  GiftToggleRow,
  PaymentMethodCard,
  PromoCodeRow,
  SavingsRibbon,
  StickyCheckoutButton,
} from '@/components/checkout';
import { CK } from '@/constants/checkoutUi';
import type { CheckoutDeliveryTiming, CheckoutFulfillmentMode, CheckoutPriceLine } from '@/types/checkoutFlow';
import { CHECKOUT_MOCK_DEFAULT_PAYMENT } from '@/types/checkoutFlow';
import { useMenu } from '@/hooks/useMenu';
import { useRestaurantProfile } from '@/hooks/useRestaurantProfile';
import { auth, ensureAuthReady } from '@/services/firebase';
import { useAuth } from '@/services/AuthContext';
import { useCart } from '@/services/CartContext';
import { useCheckoutStore } from '@/store/checkoutStore';
import { createOrder } from '@/services/orderService';
import { isOwnerHost } from '@/services/roles';
import { checkStripeStatus, resolveRestaurantPaymentsReady } from '@/services/stripeConnect';
import { getHostStripeOnboardingUrl } from '@/services/stripeOnboarding';
import {
  calculateDeliveryFee,
  calculateServiceFee,
  distanceKmBetween,
} from '@/lib/restaurantStoreMetrics';
import { alertFriendly } from '@/utils/friendlyAlert';
import { showError, showFriendlyError } from '@/utils/toast';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const DROP = { lat: 43.6532, lng: -79.3832 };

export default function CheckoutPremiumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId: string }>();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';

  const { user, role, loading: authLoading } = useAuth();
  const isOwnerOfThisRestaurant =
    !authLoading && isOwnerHost(user, role, restaurantId);

  const { items: cart, clearCartForRestaurant } = useCart();
  const { profile } = useRestaurantProfile(restaurantId || null);
  const { items: menuItems, loading: menuLoading } = useMenu(restaurantId || null);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const fulfillmentMode = useCheckoutStore((s) => s.fulfillmentMode);
  const setFulfillmentMode = useCheckoutStore((s) => s.setFulfillmentMode);
  const timing = useCheckoutStore((s) => s.timing);
  const setTiming = useCheckoutStore((s) => s.setTiming);
  const promo = useCheckoutStore((s) => s.promoCode);
  const setPromo = useCheckoutStore((s) => s.setPromoCode);
  const gift = useCheckoutStore((s) => s.gift);
  const setGift = useCheckoutStore((s) => s.setGift);
  const [placing, setPlacing] = useState(false);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [checkingStripe, setCheckingStripe] = useState(false);

  const cartItems = useMemo(
    () =>
      cart
        .filter((item) => item.restaurantId === restaurantId)
        .map((item) => ({
          id: item.cartLineId,
          name:
            item.optionsSummary && item.optionsSummary.length > 0
              ? `${item.name} (${item.optionsSummary})`
              : item.name,
          price: item.price,
          qty: item.qty,
          image: item.image,
        })),
    [cart, restaurantId],
  );

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cartItems],
  );

  const distanceKm = useMemo(
    () => distanceKmBetween(DROP, profile?.coords ?? null),
    [profile?.coords],
  );

  const deliveryFeeEstimate = useMemo(
    () =>
      calculateDeliveryFee({
        mode: fulfillmentMode === 'pickup' ? 'pickup' : 'delivery',
        distanceKm,
        firestoreFee: profile?.deliveryFee ?? null,
      }),
    [distanceKm, fulfillmentMode, profile?.deliveryFee],
  );

  const deliveryFee =
    fulfillmentMode === 'pickup' ? 0 : (deliveryFeeEstimate.amount ?? 0);

  const priorityFee =
    fulfillmentMode === 'pickup' ? 0 : timing === 'priority' ? 2.49 : 0;
  const promoDiscount =
    promo.trim().toUpperCase() === 'HALF20' ? Math.min(subtotal * 0.2, 12) : 0;

  const serviceFee = useMemo(
    () =>
      calculateServiceFee({
        subtotal,
        firestoreFee: profile?.serviceFee ?? null,
      }).amount ?? 0,
    [subtotal, profile?.serviceFee],
  );
  const preTax = Math.max(0, subtotal - promoDiscount + deliveryFee + priorityFee + serviceFee);
  const taxes = preTax * 0.13;
  const total = preTax + taxes;
  const strikeSubtotal = subtotal + deliveryFee + serviceFee + priorityFee;

  const totalFmt = `$${total.toFixed(2)}`;
  const walletSummary = `${CHECKOUT_MOCK_DEFAULT_PAYMENT.brand.toUpperCase()} ···· ${CHECKOUT_MOCK_DEFAULT_PAYMENT.last4}`;

  const savingsRibbonAmount = useMemo(() => {
    return promoDiscount > 0 ? promoDiscount : 0;
  }, [promoDiscount]);

  const refreshStripeReadiness = useCallback(async () => {
    if (!restaurantId) {
      setStripeReady(null);
      setCheckingStripe(false);
      return;
    }
    if (!user?.uid) {
      setStripeReady(null);
      setCheckingStripe(false);
      return;
    }
    setCheckingStripe(true);
    try {
      await ensureAuthReady();
      if (user?.uid && isOwnerHost(user, role, restaurantId)) {
        try {
          await checkStripeStatus(restaurantId);
        } catch {
          /* ignore */
        }
      }
      const ready = await resolveRestaurantPaymentsReady(restaurantId);
      setStripeReady(ready);
    } catch {
      setStripeReady(false);
    } finally {
      setCheckingStripe(false);
    }
  }, [restaurantId, user, role]);

  useEffect(() => {
    void refreshStripeReadiness();
  }, [refreshStripeReadiness]);

  useFocusEffect(
    useCallback(() => {
      void refreshStripeReadiness();
    }, [refreshStripeReadiness]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshStripeReadiness();
    });
    return () => sub.remove();
  }, [refreshStripeReadiness]);

  async function handleConnectSetup() {
    try {
      await ensureAuthReady();
      if (!auth.currentUser?.uid) return;
      const url = await getHostStripeOnboardingUrl(restaurantId);
      await Linking.openURL(url);
      void refreshStripeReadiness();
    } catch (e) {
      alertFriendly('Checkout', e, 'payment');
    }
  }

  const addressPrimary = profile?.address ?? '123 Queen Street West, Toronto, ON';
  const addressSecondary = fulfillmentMode === 'pickup' ? 'Pickup parking — side entrance' : 'Leave at concierge · Knock twice';
  const phoneDisplay = '+1 (416) 555-0199';

  async function submitOrder() {
    if (!user?.uid) {
      showError('Please sign in first.');
      return;
    }
    if (!restaurantId || cartItems.length === 0 || menuItems.length === 0) {
      showError('Cart is empty.');
      return;
    }
    try {
      await ensureAuthReady();
    } catch {
      showError('Could not verify sign-in. Try again.');
      return;
    }
    if (!auth.currentUser) {
      showError('Please sign in first.');
      return;
    }
    const ready = await resolveRestaurantPaymentsReady(restaurantId);
    if (!ready) {
      setStripeReady(false);
      if (isOwnerOfThisRestaurant) {
        showError('Complete Stripe setup to receive payments');
      } else {
        showError('Payments are temporarily unavailable for this restaurant');
      }
      return;
    }

    Alert.alert(
      'Confirm checkout',
      `Charge ${walletSummary} securely via Stripe (${totalFmt}) and continue to confirmation?`,
      [
        { text: 'Review', style: 'cancel' },
        {
          text: 'Continue',
          style: 'default',
          onPress: () => void placeOrder(),
        },
      ],
    );
  }

  async function placeOrder() {
    setPlacing(true);
    try {
      const orderId = await createOrder({
        userId: user!.uid,
        restaurantId,
        items: cartItems,
        totalPrice: total,
        deliveryType: fulfillmentMode === 'pickup' ? 'pickup' : 'delivery',
        deliveryLocation: {
          lat: DROP.lat,
          lng: DROP.lng,
          address: addressPrimary,
        },
      });
      clearCartForRestaurant(restaurantId);
      router.replace({
        pathname: '/checkout',
        params: { orderId },
      } as never);
    } catch (error) {
      showFriendlyError(error, 'order');
    } finally {
      setPlacing(false);
    }
  }

  const restaurantName = profile?.name ?? 'Restaurant';
  const restaurantImage = profile?.image ?? null;

  const priceLines: CheckoutPriceLine[] = useMemo(() => {
    const rows: CheckoutPriceLine[] = [
      { key: 'subtotal', label: 'Item subtotal', value: `$${subtotal.toFixed(2)}` },
    ];
    if (promoDiscount > 0) {
      rows.push({
        key: 'promo',
        label: 'Promotions',
        value: `-$${promoDiscount.toFixed(2)}`,
        emphasizeDiscount: true,
        badge: 'Promo',
      });
    }
    rows.push({
      key: 'delivery',
      label: 'Delivery fee',
      value: fulfillmentMode === 'pickup' ? '$0.00' : `$${deliveryFee.toFixed(2)}`,
      emphasizeSave: fulfillmentMode === 'delivery' && subtotal >= 25,
    });
    if (priorityFee > 0) {
      rows.push({
        key: 'priority',
        label: 'Priority delivery',
        value: `$${priorityFee.toFixed(2)}`,
      });
    }
    rows.push({
      key: 'service',
      label: 'Fees & marketplace service',
      value: `$${serviceFee.toFixed(2)}`,
    });
    rows.push({
      key: 'tax',
      label: 'Taxes & charges (estimate)',
      value: `$${taxes.toFixed(2)}`,
    });
    rows.push({
      key: 'total',
      label: 'Total',
      value: totalFmt,
    });
    rows.push({
      key: 'beforeSave',
      label: 'Pricing before promotions',
      value: `$${(strikeSubtotal + taxes).toFixed(2)}`,
      strikethrough: true,
    });
    return rows;
  }, [
    deliveryFee,
    fulfillmentMode,
    priorityFee,
    promoDiscount,
    serviceFee,
    strikeSubtotal,
    subtotal,
    taxes,
    totalFmt,
  ]);

  const handleTimingChange = useCallback((v: CheckoutDeliveryTiming) => {
    if (v === 'scheduled') {
      Alert.alert(
        'Scheduled delivery',
        'Pick-your-window deliveries are shipping soon. We dropped you on Standard for now.',
      );
      setTiming('standard');
      return;
    }
    setTiming(v);
  }, []);

  if (menuLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <CheckoutHeader scrollY={scrollY} onBack={() => router.back()} />
        <CheckoutSkeleton />
      </SafeAreaView>
    );
  }

  const blocked =
    placing ||
    cartItems.length === 0 ||
    checkingStripe ||
    authLoading ||
    stripeReady === false;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <CheckoutHeader scrollY={scrollY} onBack={() => router.back()} />

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <DeliverySegment mode={fulfillmentMode} onChange={setFulfillmentMode} />

        {fulfillmentMode === 'delivery' ? (
          <DeliveryMapCard
            center={{ latitude: DROP.lat, longitude: DROP.lng }}
            markers={[{ id: 'drop', latitude: DROP.lat, longitude: DROP.lng }]}
            addressPrimary={addressPrimary}
            addressSecondary={addressSecondary}
            onEditPin={() => Alert.alert('Edit pin', 'Map-based address edits sync with Firebase in a future cut.')}
          />
        ) : null}

        <View style={{ height: 6 }} />

        <AddressRow
          icon="location-outline"
          title={addressPrimary}
          subtitle={fulfillmentMode === 'delivery' ? 'Apartment buzzer 402' : restaurantName}
          onPress={() => Alert.alert('Address', 'Address book syncing with Firestore — coming shortly.')}
        />
        <AddressRow
          icon="chatbubble-ellipses-outline"
          title="Delivery instructions"
          subtitle="Meet at my door • Add instructions & photo drop-off guides"
          subtitlePlaceholder
          onPress={() =>
            Alert.alert(
              'Delivery instructions',
              'Photo references + gate codes persist on `orders.notes` in the next Firebase schema rev.',
            )
          }
        />
        <AddressRow
          icon="call-outline"
          title={phoneDisplay}
          subtitle="Driver can call when nearby"
          onPress={() => Alert.alert('Phone', 'Wire this row to `users/{uid}.phoneNumber`.')}
        />

        {fulfillmentMode === 'delivery' ? (
          <DeliveryTimingStrip value={timing} onChange={handleTimingChange} />
        ) : (
          <View style={styles.pickupNote}>
            <Text style={styles.pickupTitle}>Pickup timing</Text>
            <Text style={styles.pickupBody}>
              We will send a push when your order is bagged — usually 12–18 minutes.
            </Text>
          </View>
        )}

        <CheckoutOrderSummary
          restaurantName={restaurantName}
          imageUri={restaurantImage}
          itemCount={cartItems.reduce((s, i) => s + i.qty, 0)}
        >
          {cartItems.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text style={styles.lineLeft} numberOfLines={3}>
                {line.qty}× {line.name}
              </Text>
              <Text style={styles.lineRight}>${(line.price * line.qty).toFixed(2)}</Text>
            </View>
          ))}
        </CheckoutOrderSummary>

        <GiftToggleRow checked={gift} onToggle={setGift} />

        <PromoCodeRow
          value={promo}
          onChange={setPromo}
          appliedLabel={promoDiscount > 0 ? 'HALF20' : null}
          hint="Unlock HALF20 for 20% off (cap $12) — persists with Firestore `promotions`."
        />

        <View style={{ height: 6 }} />

        <Text style={[styles.payEyebrow, { marginHorizontal: 16 }]}>Payment</Text>
        <PaymentMethodCard
          method={CHECKOUT_MOCK_DEFAULT_PAYMENT}
          onPress={() => Alert.alert('Payment methods', 'Hook to Stripe PaymentSheet + saved instruments.')}
        />
        <Pressable
          accessibilityRole="button"
          style={styles.altPay}
          onPress={() => Alert.alert('Apple Pay', 'Enable via Stripe + ApplePayButton on native binaries.')}
        >
          <Text style={styles.altPayStrong}>Apple Pay</Text>
          <Text style={styles.altPayChev}>›</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert('Add card', 'Use Stripe Elements / PaymentSheet.')}
          style={styles.payLink}
        >
          <Text style={styles.payLinkTxt}>Add payment method</Text>
        </Pressable>

        <CheckoutPriceBreakdown lines={priceLines} />

        {stripeReady === false && cartItems.length > 0 && !authLoading ? (
          <View style={styles.setupCard}>
            <Text style={styles.stripeWarn}>
              {isOwnerOfThisRestaurant
                ? 'Complete Stripe setup to receive payments'
                : 'Payments are temporarily unavailable for this restaurant'}
            </Text>
            {isOwnerOfThisRestaurant ? (
              <Pressable style={styles.setupButton} onPress={() => void handleConnectSetup()}>
                <Text style={styles.setupButtonText}>Complete Setup</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Pressable
          onPress={() =>
            router.push(`/restaurant-menu/cart?restaurantId=${encodeURIComponent(restaurantId)}` as never)
          }
        >
          <Text style={styles.classicLink}>Open classic cart breakdown</Text>
        </Pressable>

        {/* Space for pinned footer */}
        <View style={{ height: 190 }} />
      </Animated.ScrollView>

      <View style={styles.footerDock} pointerEvents="box-none">
        <SavingsRibbon
          savingsAmount={savingsRibbonAmount}
          sublabel={savingsRibbonAmount > 0 ? 'HalfOrder+ perks stack with promos this order' : undefined}
        />
        <StickyCheckoutButton
          label="Next"
          sublabel={`Total ${totalFmt}`}
          onPress={() => void submitOrder()}
          disabled={blocked}
          loading={placing || checkingStripe}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CK.bg },
  scrollContent: { paddingBottom: 0 },
  footerDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 0,
    backgroundColor: CK.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CK.headerHairline,
    paddingTop: 4,
  },
  pickupNote: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    padding: 14,
    borderRadius: CK.mapRadius,
    backgroundColor: CK.surface,
    borderWidth: 1,
    borderColor: CK.border,
  },
  pickupTitle: { fontSize: 14, fontWeight: '900', color: CK.text },
  pickupBody: {
    marginTop: 8,
    fontSize: 13.5,
    fontWeight: '600',
    color: CK.textSecondary,
    lineHeight: 19,
  },
  payEyebrow: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: CK.textMuted,
    marginBottom: 8,
  },
  altPay: {
    marginHorizontal: 16,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: CK.surface,
    borderWidth: 1,
    borderColor: CK.border,
  },
  altPayStrong: { fontSize: 16, fontWeight: '900', color: CK.text },
  altPayChev: { fontSize: 22, color: CK.textMuted, fontWeight: '300' },
  payLink: { paddingVertical: 10, paddingHorizontal: 16 },
  payLinkTxt: { fontSize: 15, fontWeight: '800', color: CK.text, textDecorationLine: 'underline' },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  lineLeft: { flex: 1, fontSize: 14, fontWeight: '600', color: CK.textSecondary, lineHeight: 19 },
  lineRight: { fontSize: 14, fontWeight: '800', color: CK.text },
  setupCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    padding: 14,
  },
  stripeWarn: {
    color: '#B45309',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  setupButton: {
    marginTop: 10,
    alignSelf: 'center',
    backgroundColor: '#635BFF',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  setupButtonText: { color: '#FFFFFF', fontWeight: '800' },
  classicLink: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: CK.textMuted,
    textDecorationLine: 'underline',
    marginBottom: 8,
  },
});
