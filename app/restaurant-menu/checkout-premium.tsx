/**
 * Marketplace checkout — Uber Eats–tier layout composed from `components/checkout/*`.
 * Firebase: cart via `CartContext`, restaurant/menu via hooks, orders via `createOrder`.
 * Payments: admin Stripe Customer + PaymentSheet (same account as Wallet / Swipe).
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
import { DeliveryEligibilityBanner } from '@/components/delivery/DeliveryEligibilityBanner';
import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import type {
  CheckoutDeliveryTiming,
  CheckoutPaymentMethodPreview,
  CheckoutPriceLine,
} from '@/types/checkoutFlow';
import { useMenu } from '@/hooks/useMenu';
import { useRestaurantProfile } from '@/hooks/useRestaurantProfile';
import { auth, ensureAuthReady } from '@/services/firebase';
import { useAuth } from '@/services/AuthContext';
import { useCart } from '@/services/CartContext';
import { useCheckoutStore } from '@/store/checkoutStore';
import { createOrder } from '@/services/orderService';
import { applyPromoCode } from '@/services/promoCodes';
import { resolveRestaurantTaxRate } from '@/services/platformFees';
import { computeOrderPricing } from '@/lib/orderPricing';
import {
  fetchRestaurantLocation,
  resolveDeliveryLocationForCheckout,
} from '@/services/location';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { useDeliveryEligibility } from '@/hooks/useDeliveryEligibility';
import { OUTSIDE_DELIVERY_AREA_MESSAGE } from '@/lib/delivery/deliveryEligibility';
import { presentWalletAddPaymentMethod } from '@/services/walletAddPaymentMethod';
import {
  formatCardBrand,
  formatCardExpiry,
  formatCardLabel,
  listWalletPaymentMethods,
  resolveApplePayAvailable,
  setWalletDefaultPaymentMethod,
  subscribeWalletDefaultPaymentMethodId,
  type WalletCardPaymentMethod,
} from '@/services/walletPaymentMethods';
import { calculateServiceFee } from '@/lib/restaurantStoreMetrics';
import { showError, showFriendlyError, showSuccess } from '@/utils/toast';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

function mapBrand(brand: string): CheckoutPaymentMethodPreview['brand'] {
  const b = brand.trim().toLowerCase();
  if (b === 'visa') return 'visa';
  if (b === 'mastercard' || b === 'master_card') return 'mastercard';
  if (b === 'amex' || b === 'american_express') return 'amex';
  return 'generic';
}

function toPaymentPreview(
  pm: WalletCardPaymentMethod,
  isDefault: boolean,
): CheckoutPaymentMethodPreview {
  const expiry = formatCardExpiry(pm);
  return {
    id: pm.id,
    brand: mapBrand(pm.brand),
    last4: pm.last4,
    cardholderName: formatCardBrand(pm.brand),
    expiryLabel: expiry ?? 'Saved card',
    isDefault,
  };
}

export default function CheckoutPremiumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId: string }>();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';

  const { user, loading: authLoading } = useAuth();

  const { items: cart, clearCartForRestaurant } = useCart();
  const { profile } = useRestaurantProfile(restaurantId || null);
  const { items: menuItems, loading: menuLoading } = useMenu(restaurantId || null);
  const {
    userCoords,
    addressLine: customerAddressLine,
    locationLoading,
    locationReady,
    refreshLocation: refreshCustomerLocation,
  } = useHomeMarketplaceLocation();

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
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [walletMethods, setWalletMethods] = useState<WalletCardPaymentMethod[]>([]);
  const [defaultPmId, setDefaultPmId] = useState<string | null>(null);
  const [selectedPmId, setSelectedPmId] = useState<string | null>(null);
  const [preferApplePay, setPreferApplePay] = useState(false);
  const [applePayAvailable, setApplePayAvailable] = useState(false);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [addingCard, setAddingCard] = useState(false);

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

  const { eligibility, distanceLoading: distanceCheckLoading } = useDeliveryEligibility({
    customerEntity: userCoords,
    restaurantEntity: profile?.raw,
    restaurantRaw: profile?.raw,
    mode: fulfillmentMode === 'pickup' ? 'pickup' : 'delivery',
    locationResolving: locationLoading && !userCoords,
    locationReady,
  });

  const deliveryFee =
    fulfillmentMode === 'pickup' ? 0 : (eligibility.deliveryFee.amount ?? 0);

  const priorityFee =
    fulfillmentMode === 'pickup' ? 0 : timing === 'priority' ? 2.49 : 0;

  const serviceFee = useMemo(
    () =>
      calculateServiceFee({
        subtotal,
        firestoreFee: profile?.serviceFee ?? null,
      }).amount ?? 0,
    [subtotal, profile?.serviceFee],
  );

  const taxRate = useMemo(
    () => resolveRestaurantTaxRate(profile?.raw, 0.13),
    [profile?.raw],
  );

  const pricing = useMemo(
    () =>
      computeOrderPricing({
        foodSubtotal: subtotal,
        deliveryFee: deliveryFee + priorityFee,
        serviceFee,
        promoDiscount,
        taxRate,
      }),
    [subtotal, deliveryFee, priorityFee, serviceFee, promoDiscount, taxRate],
  );

  const taxes = pricing.hst;
  const total = pricing.totalPaid;
  const strikeSubtotal = subtotal + deliveryFee + serviceFee + priorityFee;

  const totalFmt = `$${total.toFixed(2)}`;

  const selectedCard = useMemo(() => {
    if (!walletMethods.length) return null;
    const preferred =
      (selectedPmId && walletMethods.find((m) => m.id === selectedPmId)) ||
      (defaultPmId && walletMethods.find((m) => m.id === defaultPmId)) ||
      walletMethods[0];
    return preferred ?? null;
  }, [walletMethods, selectedPmId, defaultPmId]);

  const paymentPreview: CheckoutPaymentMethodPreview = useMemo(() => {
    if (preferApplePay && applePayAvailable) {
      return {
        id: 'apple_pay',
        brand: 'generic',
        last4: 'Pay',
        cardholderName: 'Apple Pay',
        expiryLabel: 'Pays via Stripe PaymentSheet',
        isDefault: true,
      };
    }
    if (selectedCard) {
      return toPaymentPreview(
        selectedCard,
        selectedCard.id === defaultPmId || selectedCard.id === selectedPmId,
      );
    }
    return {
      id: 'none',
      brand: 'generic',
      last4: '————',
      cardholderName: 'No card saved',
      expiryLabel: 'Add a payment method',
    };
  }, [
    preferApplePay,
    applePayAvailable,
    selectedCard,
    defaultPmId,
    selectedPmId,
  ]);

  const walletSummary = preferApplePay && applePayAvailable
    ? 'Apple Pay'
    : selectedCard
      ? formatCardLabel(selectedCard)
      : 'Stripe PaymentSheet';

  const savingsRibbonAmount = useMemo(() => {
    return promoDiscount > 0 ? promoDiscount : 0;
  }, [promoDiscount]);

  const onApplyPromo = useCallback(async () => {
    setPromoError(null);
    setPromoBusy(true);
    try {
      const applied = await applyPromoCode({
        code: promo,
        foodSubtotal: subtotal,
        restaurantId,
      });
      setPromoDiscount(applied.discountAmount);
      setAppliedPromoCode(applied.code);
      setPromo(applied.code);
      showSuccess(`Promo ${applied.code} applied`);
    } catch (e) {
      setPromoDiscount(0);
      setAppliedPromoCode(null);
      setPromoError(e instanceof Error ? e.message : 'Invalid promo code');
    } finally {
      setPromoBusy(false);
    }
  }, [promo, restaurantId, setPromo, subtotal]);

  const refreshWalletPayments = useCallback(async () => {
    if (!user?.uid || user.isAnonymous) {
      setWalletMethods([]);
      setLoadingPayments(false);
      return;
    }
    setLoadingPayments(true);
    try {
      await ensureAuthReady();
      const [methods, appleOk] = await Promise.all([
        listWalletPaymentMethods(),
        resolveApplePayAvailable(),
      ]);
      setWalletMethods(methods);
      setApplePayAvailable(appleOk);
      setSelectedPmId((prev) => {
        if (prev && methods.some((m) => m.id === prev)) return prev;
        return null;
      });
    } catch {
      setWalletMethods([]);
    } finally {
      setLoadingPayments(false);
    }
  }, [user?.uid, user?.isAnonymous]);

  useEffect(() => {
    void refreshWalletPayments();
  }, [refreshWalletPayments]);

  useEffect(() => {
    if (!user?.uid || user.isAnonymous) {
      setDefaultPmId(null);
      return;
    }
    return subscribeWalletDefaultPaymentMethodId(user.uid, setDefaultPmId);
  }, [user?.uid, user?.isAnonymous]);

  useFocusEffect(
    useCallback(() => {
      void refreshCustomerLocation();
      void refreshWalletPayments();
    }, [refreshCustomerLocation, refreshWalletPayments]),
  );

  const onAddPaymentMethod = useCallback(async () => {
    if (addingCard) return;
    setAddingCard(true);
    try {
      const result = await presentWalletAddPaymentMethod();
      if (result.status === 'success') {
        showSuccess('Payment method saved');
        setPreferApplePay(false);
        await refreshWalletPayments();
      } else if (result.status === 'failed' || result.status === 'unsupported') {
        showError(result.message);
      }
    } finally {
      setAddingCard(false);
    }
  }, [addingCard, refreshWalletPayments]);

  const onSelectPaymentMethod = useCallback(() => {
    if (!walletMethods.length) {
      void onAddPaymentMethod();
      return;
    }
    Alert.alert(
      'Payment methods',
      'Choose a saved card for this order.',
      [
        ...walletMethods.map((pm) => ({
          text: formatCardLabel(pm),
          onPress: () => {
            setPreferApplePay(false);
            setSelectedPmId(pm.id);
            void setWalletDefaultPaymentMethod(pm.id).catch(() => undefined);
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [walletMethods, onAddPaymentMethod]);

  const onApplePayPress = useCallback(() => {
    if (Platform.OS !== 'ios') {
      showError('Apple Pay is available on iOS.');
      return;
    }
    if (!applePayAvailable) {
      showError('Apple Pay is not available on this device.');
      return;
    }
    setPreferApplePay(true);
    showSuccess('Apple Pay will be offered in Stripe PaymentSheet');
  }, [applePayAvailable]);

  const addressPrimary =
    fulfillmentMode === 'pickup'
      ? (profile?.address ?? 'Restaurant pickup')
      : (customerAddressLine ?? 'Enable location access');
  const addressSecondary = fulfillmentMode === 'pickup' ? 'Pickup parking — side entrance' : 'Leave at door · Add delivery notes at checkout';
  const phoneDisplay = '+1 (416) 555-0199';

  async function submitOrder() {
    console.log('[CHECKOUT NEXT CLICKED]', {
      placing,
      cartCount: cartItems.length,
      blocked,
      payment: walletSummary,
    });
    if (!user?.uid) {
      showError('Please sign in first.');
      return;
    }
    if (!restaurantId || cartItems.length === 0 || menuItems.length === 0) {
      showError('Cart is empty.');
      return;
    }
    if (fulfillmentMode === 'delivery' && eligibility.blocked) {
      showError(eligibility.message ?? OUTSIDE_DELIVERY_AREA_MESSAGE);
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

    const confirmMessage = `Charge ${walletSummary} securely via Stripe (${totalFmt}) and continue to confirmation?`;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(confirmMessage)) {
        await placeOrder();
      }
      return;
    }
    Alert.alert('Confirm checkout', confirmMessage, [
      { text: 'Review', style: 'cancel' },
      {
        text: 'Continue',
        style: 'default',
        onPress: () => void placeOrder(),
      },
    ]);
  }

  async function placeOrder() {
    setPlacing(true);
    try {
      let deliveryLocation: { lat: number; lng: number; address: string };
      let customerLocation;

      if (fulfillmentMode === 'pickup') {
        const restaurantLoc = await fetchRestaurantLocation(restaurantId);
        deliveryLocation = {
          lat: restaurantLoc.latitude,
          lng: restaurantLoc.longitude,
          address: restaurantLoc.address ?? profile?.address ?? 'Restaurant pickup',
        };
        if (userCoords) {
          customerLocation = {
            latitude: userCoords.lat,
            longitude: userCoords.lng,
            timestamp: Date.now(),
          };
        }
      } else {
        const delivery = await resolveDeliveryLocationForCheckout({ required: true });
        deliveryLocation = {
          lat: delivery.lat,
          lng: delivery.lng,
          address: delivery.address,
        };
        customerLocation = delivery.customerLocation;
      }

      const orderId = await createOrder({
        userId: user!.uid,
        restaurantId,
        items: cartItems,
        totalPrice: total,
        foodSubtotal: subtotal,
        tax: taxes,
        taxRate,
        deliveryFee,
        serviceFee: serviceFee + priorityFee,
        promoDiscount,
        promoCode: appliedPromoCode,
        deliveryType: fulfillmentMode === 'pickup' ? 'pickup' : 'delivery',
        deliveryLocation,
        customerLocation,
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
      label: `HST (${Math.round(taxRate * 1000) / 10}%)`,
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
    taxRate,
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
    authLoading ||
    (fulfillmentMode === 'delivery' &&
      (distanceCheckLoading || !userCoords || eligibility.blocked));

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
          <DeliveryEligibilityBanner
            eligibility={eligibility}
            loading={distanceCheckLoading}
          />
        ) : null}

        {fulfillmentMode === 'delivery' && userCoords ? (
          <DeliveryMapCard
            center={{ latitude: userCoords.lat, longitude: userCoords.lng }}
            markers={[
              {
                id: 'drop',
                latitude: userCoords.lat,
                longitude: userCoords.lng,
              },
            ]}
            addressPrimary={addressPrimary}
            addressSecondary={addressSecondary}
            onEditPin={() => void refreshCustomerLocation()}
          />
        ) : fulfillmentMode === 'delivery' && distanceCheckLoading ? (
          <View style={styles.locationLoading}>
            <Text style={styles.locationLoadingText}>Getting your delivery location…</Text>
          </View>
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
          onChange={(next) => {
            setPromo(next);
            setPromoDiscount(0);
            setAppliedPromoCode(null);
            setPromoError(null);
          }}
          onApply={() => void onApplyPromo()}
          applying={promoBusy}
          appliedLabel={appliedPromoCode}
          error={promoError}
          hint="Enter a promo code from HalfOrder and tap Apply."
        />

        <View style={{ height: 6 }} />

        <Text style={[styles.payEyebrow, { marginHorizontal: 16 }]}>Payment</Text>
        <PaymentMethodCard
          method={paymentPreview}
          onPress={onSelectPaymentMethod}
        />
        {applePayAvailable ? (
          <Pressable
            {...checkoutPressableProps}
            style={[styles.altPay, preferApplePay && styles.altPaySelected]}
            onPress={onApplePayPress}
          >
            <Text style={styles.altPayStrong}>
              Apple Pay{preferApplePay ? ' · Selected' : ''}
            </Text>
            <Text style={styles.altPayChev}>›</Text>
          </Pressable>
        ) : null}
        <Pressable
          {...checkoutPressableProps}
          onPress={() => void onAddPaymentMethod()}
          style={styles.payLink}
          disabled={addingCard || loadingPayments}
        >
          <Text style={styles.payLinkTxt}>
            {addingCard ? 'Adding…' : 'Add payment method'}
          </Text>
        </Pressable>

        <CheckoutPriceBreakdown lines={priceLines} />

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
          loading={placing}
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
    zIndex: 40,
    paddingBottom: 0,
    backgroundColor: CK.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CK.headerHairline,
    paddingTop: 4,
    ...Platform.select({
      web: { boxShadow: '0 -4px 24px rgba(15, 23, 42, 0.08)' },
      default: {},
    }),
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
  altPaySelected: { borderColor: CK.text, backgroundColor: CK.bg },
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
  locationLoading: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    borderRadius: CK.mapRadius,
    backgroundColor: CK.surface,
    borderWidth: 1,
    borderColor: CK.border,
  },
  locationLoadingText: { color: CK.textMuted, fontWeight: '600', textAlign: 'center' },
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
