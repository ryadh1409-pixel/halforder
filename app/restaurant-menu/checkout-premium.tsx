import { CheckoutSummary } from '@/components/cart/CheckoutSummary';
import { DeliveryTimeSelector, type DeliveryTimeChoice } from '@/components/cart/DeliveryTimeSelector';
import { PriceBreakdown } from '@/components/cart/PriceBreakdown';
import { DeliveryOptions, type DeliveryMode } from '@/components/restaurant/DeliveryOptions';
import { RP } from '@/constants/restaurantPremiumTheme';
import { useMenu } from '@/hooks/useMenu';
import { useRestaurantProfile } from '@/hooks/useRestaurantProfile';
import AppHeader from '@/components/AppHeader';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/services/AuthContext';
import { useCart } from '@/services/CartContext';
import { auth, ensureAuthReady } from '@/services/firebase';
import { createOrder } from '@/services/orderService';
import { isOwnerHost } from '@/services/roles';
import { checkStripeStatus, resolveRestaurantPaymentsReady } from '@/services/stripeConnect';
import { getHostStripeOnboardingUrl } from '@/services/stripeOnboarding';
import { showError } from '@/utils/toast';

const TORONTO = { lat: 43.6532, lng: -79.3832 };

function MapPreviewCard({ onEdit }: { onEdit: () => void }) {
  const [MapMod, setMapMod] = useState<typeof import('react-native-maps') | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      setMapMod(require('react-native-maps') as typeof import('react-native-maps'));
    } catch {
      setMapMod(null);
    }
  }, []);

  if (!MapMod) {
    return (
      <View style={styles.mapPh}>
        <Text style={styles.mapPhTitle}>Dropoff area</Text>
        <Text style={styles.mapPhSub}>Toronto · map preview</Text>
        <Pressable style={styles.mapEdit} onPress={onEdit}>
          <Text style={styles.mapEditTxt}>Edit pin</Text>
        </Pressable>
      </View>
    );
  }

  const MapView = MapMod.default;
  const Marker = MapMod.Marker;

  return (
    <View style={styles.mapWrap}>
      <MapView
        style={styles.map}
        pointerEvents="none"
        initialRegion={{
          latitude: TORONTO.lat,
          longitude: TORONTO.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        <Marker coordinate={{ latitude: TORONTO.lat, longitude: TORONTO.lng }} />
      </MapView>
      <Pressable style={styles.mapEditFloating} onPress={onEdit}>
        <Text style={styles.mapEditTxt}>Edit pin</Text>
      </Pressable>
    </View>
  );
}

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

  const [mode, setMode] = useState<DeliveryMode>('delivery');
  const [timeChoice, setTimeChoice] = useState<DeliveryTimeChoice>('standard');
  const [promo, setPromo] = useState('');
  const [gift, setGift] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [checkingStripe, setCheckingStripe] = useState(false);

  const cartItems = useMemo(
    () =>
      cart
        .filter((item) => item.restaurantId === restaurantId)
        .map((item) => ({
          id: item.id,
          name: item.name,
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

  const deliveryFee = mode === 'pickup' ? 0 : 2.49;
  const priorityFee = mode === 'pickup' ? 0 : timeChoice === 'priority' ? 2.49 : 0;
  const promoDiscount = promo.trim().toUpperCase() === 'HALF20' ? Math.min(subtotal * 0.2, 12) : 0;
  const preTax = Math.max(0, subtotal - promoDiscount + deliveryFee + priorityFee + 0.99);
  const taxes = preTax * 0.13;
  const total = preTax + taxes;
  const strikeSubtotal = subtotal + deliveryFee + 0.99 + priorityFee;

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
          // ignore
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
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start onboarding');
    }
  }

  async function placeOrder() {
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
    setPlacing(true);
    try {
      const orderId = await createOrder({
        userId: user.uid,
        restaurantId,
        items: cartItems,
        totalPrice: subtotal,
        deliveryLocation: {
          lat: TORONTO.lat,
          lng: TORONTO.lng,
          address: profile?.address ?? 'Toronto, ON',
        },
      });
      clearCartForRestaurant(restaurantId);
      router.replace({
        pathname: '/checkout',
        params: { orderId },
      } as never);
    } catch (error) {
      console.log('[checkout-premium] place order', error);
      showError('Could not place order.');
    } finally {
      setPlacing(false);
    }
  }

  const restaurantName = profile?.name ?? 'Restaurant';
  const restaurantImage = profile?.image ?? null;

  if (menuLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <AppHeader title="Checkout" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={RP.text} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Checkout" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.h1}>Almost there</Text>
        <Text style={styles.subH}>Review details and place your order.</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery method</Text>
          <DeliveryOptions mode={mode} onChange={setMode} />
        </View>

        {mode === 'delivery' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Live map</Text>
            <MapPreviewCard onEdit={() => Alert.alert('Edit pin', 'Address editing coming soon.')} />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Address</Text>
          <View style={styles.card}>
            <Text style={styles.cardStrong}>{profile?.address ?? '123 Queen St W, Toronto'}</Text>
            <Text style={styles.cardLine}>Ring doorbell · Leave at door</Text>
            <Text style={styles.cardLine}>+1 (416) 555-0199</Text>
          </View>
        </View>

        {mode === 'delivery' ? (
          <View style={styles.section}>
            <DeliveryTimeSelector value={timeChoice} onChange={setTimeChoice} />
          </View>
        ) : null}

        <CheckoutSummary
          restaurantName={restaurantName}
          imageUri={restaurantImage}
          itemCount={cartItems.reduce((s, i) => s + i.qty, 0)}
        >
          {cartItems.map((line) => (
            <View key={line.id} style={styles.lineRow}>
              <Text style={styles.lineName} numberOfLines={2}>
                {line.qty}× {line.name}
              </Text>
              <Text style={styles.linePrice}>${(line.price * line.qty).toFixed(2)}</Text>
            </View>
          ))}
        </CheckoutSummary>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo & gifts</Text>
          <TextInput
            value={promo}
            onChangeText={setPromo}
            placeholder="Add promo code"
            placeholderTextColor={RP.textMuted}
            style={styles.input}
            autoCapitalize="characters"
          />
          <Text style={styles.hint}>Try HALF20 for 20% off (max $12).</Text>
          <View style={styles.giftRow}>
            <Text style={styles.giftLabel}>Send as a gift</Text>
            <Switch value={gift} onValueChange={setGift} trackColor={{ true: RP.accent }} />
          </View>
          {promoDiscount > 0 ? (
            <View style={styles.saveBanner}>
              <Text style={styles.saveBannerTxt}>You’re saving ${promoDiscount.toFixed(2)} today</Text>
            </View>
          ) : null}
        </View>

        <PriceBreakdown
          rows={[
            { label: 'Item subtotal', value: `$${subtotal.toFixed(2)}` },
            ...(promoDiscount > 0
              ? ([
                  { label: 'Promotions', value: `-$${promoDiscount.toFixed(2)}`, accent: true },
                ] as const)
              : []),
            { label: 'Delivery fee', value: deliveryFee <= 0 ? '$0' : `$${deliveryFee.toFixed(2)}` },
            ...(priorityFee > 0
              ? ([{ label: 'Priority fee', value: `$${priorityFee.toFixed(2)}` }] as const)
              : []),
            { label: 'Service fee', value: '$0.99' },
            { label: 'Taxes (est.)', value: `$${taxes.toFixed(2)}` },
            { label: 'Total', value: `$${total.toFixed(2)}` },
            { label: 'Before savings', value: `$${strikeSubtotal.toFixed(2)}`, strike: true },
          ]}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment</Text>
          <Pressable style={styles.payRow}>
            <View style={styles.payIcon}>
              <Text style={styles.payIconTxt}>●●●</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.payTitle}>Visa ···· 4242</Text>
              <Text style={styles.paySub}>Default · expires 12/28</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
          <Pressable style={styles.payRowMuted}>
            <Text style={styles.payTitle}>Apple Pay</Text>
            <Text style={styles.chev}>›</Text>
          </Pressable>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkTxt}>Add payment method</Text>
          </Pressable>
        </View>

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
          onPress={() => router.push(`/restaurant-menu/cart?restaurantId=${encodeURIComponent(restaurantId)}` as never)}
        >
          <Text style={styles.classicLink}>Classic cart & receipt</Text>
        </Pressable>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: 12 }]}>
        <Pressable
          style={[
            styles.placeBtn,
            (placing ||
              cartItems.length === 0 ||
              checkingStripe ||
              authLoading ||
              stripeReady === false) &&
              styles.disabled,
          ]}
          onPress={() => void placeOrder()}
          disabled={
            placing ||
            cartItems.length === 0 ||
            checkingStripe ||
            authLoading ||
            stripeReady === false
          }
        >
          {placing || checkingStripe ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeTxt}>Place order · ${subtotal.toFixed(2)}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: RP.bg },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  h1: { fontSize: 28, fontWeight: '900', color: RP.text, letterSpacing: -0.5, marginTop: 8 },
  subH: { marginTop: 6, fontSize: 15, fontWeight: '600', color: RP.textSecondary },
  section: { marginTop: 22 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: RP.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  mapWrap: {
    height: 160,
    borderRadius: RP.radiusM,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: RP.border,
  },
  map: { ...StyleSheet.absoluteFillObject },
  mapPh: {
    height: 160,
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    backgroundColor: RP.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mapPhTitle: { fontSize: 16, fontWeight: '900', color: RP.text },
  mapPhSub: { marginTop: 4, fontSize: 13, fontWeight: '600', color: RP.textSecondary },
  mapEdit: { marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: RP.text },
  mapEditFloating: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: RP.bg,
    borderWidth: 1,
    borderColor: RP.border,
  },
  mapEditTxt: { color: RP.text, fontWeight: '900', fontSize: 13 },
  card: {
    padding: 16,
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    backgroundColor: RP.surface,
  },
  cardStrong: { fontSize: 16, fontWeight: '900', color: RP.text },
  cardLine: { marginTop: 6, fontSize: 14, fontWeight: '600', color: RP.textSecondary },
  input: {
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: RP.text,
    backgroundColor: RP.bg,
  },
  hint: { marginTop: 6, fontSize: 12, fontWeight: '600', color: RP.textMuted },
  giftRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  giftLabel: { fontSize: 16, fontWeight: '800', color: RP.text },
  saveBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: RP.radiusM,
    backgroundColor: 'rgba(0,200,83,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,200,83,0.25)',
  },
  saveBannerTxt: { fontSize: 14, fontWeight: '900', color: RP.accent },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineName: { flex: 1, fontSize: 14, fontWeight: '600', color: RP.textSecondary },
  linePrice: { fontSize: 14, fontWeight: '800', color: RP.text },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    backgroundColor: RP.bg,
    marginBottom: 10,
    gap: 12,
  },
  payRowMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: RP.radiusM,
    borderWidth: 1,
    borderColor: RP.border,
    backgroundColor: RP.surface,
    marginBottom: 10,
    gap: 12,
  },
  payIcon: {
    width: 40,
    height: 28,
    borderRadius: 6,
    backgroundColor: RP.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payIconTxt: { color: '#fff', fontSize: 8, fontWeight: '900' },
  payTitle: { fontSize: 16, fontWeight: '800', color: RP.text },
  paySub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: RP.textSecondary },
  chev: { fontSize: 22, color: RP.textMuted, fontWeight: '300' },
  linkRow: { paddingVertical: 8 },
  linkTxt: { fontSize: 15, fontWeight: '800', color: RP.text, textDecorationLine: 'underline' },
  setupCard: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
    padding: 12,
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
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  setupButtonText: { color: '#FFFFFF', fontWeight: '800' },
  classicLink: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '700',
    color: RP.textSecondary,
    textDecorationLine: 'underline',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RP.border,
    backgroundColor: RP.bg,
  },
  placeBtn: {
    height: 56,
    borderRadius: 20,
    backgroundColor: RP.blackBtn,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
  disabled: { opacity: 0.45 },
});
