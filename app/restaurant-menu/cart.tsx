import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AppHeader from '../../components/AppHeader';
import { DeliveryEligibilityBanner } from '@/components/delivery/DeliveryEligibilityBanner';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { useDeliveryEligibility } from '@/hooks/useDeliveryEligibility';
import { useMenu } from '../../hooks/useMenu';
import { useRestaurantProfile } from '@/hooks/useRestaurantProfile';
import { OUTSIDE_DELIVERY_AREA_MESSAGE } from '@/lib/delivery/deliveryEligibility';
import { useAuth } from '../../services/AuthContext';
import { useCart } from '../../services/CartContext';
import { auth, ensureAuthReady } from '../../services/firebase';
import { createOrder } from '../../services/orderService';
import { resolveDeliveryLocationForCheckout } from '../../services/location';
import { isOwnerHost } from '../../services/roles';
import { checkStripeStatus, resolveRestaurantPaymentsReady } from '../../services/stripeConnect';
import { getHostStripeOnboardingUrl } from '../../services/stripeOnboarding';
import { alertFriendly } from '../../utils/friendlyAlert';
import { showError, showFriendlyError } from '../../utils/toast';

export default function CartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId: string }>();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';
  const { user, role, loading: authLoading } = useAuth();
  const isOwnerOfThisRestaurant =
    !authLoading && isOwnerHost(user, role, restaurantId);
  const { items: cart } = useCart();
  const { items, loading } = useMenu(restaurantId || null);
  const { profile } = useRestaurantProfile(restaurantId || null);
  const {
    userCoords,
    locationLoading,
    locationReady,
    refreshLocation: refreshCustomerLocation,
  } = useHomeMarketplaceLocation();
  const [placing, setPlacing] = useState(false);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [checkingStripe, setCheckingStripe] = useState(false);

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
          // Owner-only callable; ignore if not applicable.
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
      void refreshCustomerLocation();
      void refreshStripeReadiness();
    }, [refreshCustomerLocation, refreshStripeReadiness]),
  );

  const { eligibility, distanceLoading: distanceCheckLoading } = useDeliveryEligibility({
    customerEntity: userCoords,
    restaurantEntity: profile?.raw,
    restaurantRaw: profile?.raw,
    mode: 'delivery',
    locationResolving: locationLoading && !userCoords,
    locationReady,
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshStripeReadiness();
    });
    return () => sub.remove();
  }, [refreshStripeReadiness]);

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
  const totalPrice = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.qty, 0),
    [cartItems],
  );

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

  async function placeOrder() {
    if (!user?.uid) {
      showError('Please sign in first.');
      return;
    }
    if (!restaurantId || cartItems.length === 0 || items.length === 0) {
      showError('Cart is empty.');
      return;
    }
    if (eligibility.blocked) {
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
      const delivery = await resolveDeliveryLocationForCheckout({ required: true });
      const orderId = await createOrder({
        userId: user.uid,
        restaurantId,
        items: cartItems,
        totalPrice,
        deliveryLocation: {
          lat: delivery.lat,
          lng: delivery.lng,
          address: delivery.address,
        },
        customerLocation: delivery.customerLocation,
      });
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

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <AppHeader title="Cart" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#22C55E" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <AppHeader title="Cart" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your Cart</Text>
        {cartItems.length > 0 ? (
          <DeliveryEligibilityBanner
            eligibility={eligibility}
            loading={distanceCheckLoading}
          />
        ) : null}
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
        {cartItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubTitle}>Be the first to order</Text>
          </View>
        ) : (
          cartItems.map((item) => (
            <View key={item.id} style={styles.card}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={styles.lineThumb} />
              ) : (
                <View style={[styles.lineThumb, styles.lineThumbPh]} />
              )}
              <View style={styles.lineBody}>
                <Text style={styles.name}>{item.qty}x {item.name}</Text>
                <Text style={styles.price}>${(item.price * item.qty).toFixed(2)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.total}>Total: ${totalPrice.toFixed(2)}</Text>
        <Pressable
          style={[
            styles.placeButton,
            (placing ||
              cartItems.length === 0 ||
              checkingStripe ||
              authLoading ||
              stripeReady === false ||
              eligibility.blocked ||
              distanceCheckLoading ||
              !userCoords) &&
              styles.disabled,
          ]}
          onPress={placeOrder}
          disabled={
            placing ||
            cartItems.length === 0 ||
            checkingStripe ||
            authLoading ||
            stripeReady === false ||
            eligibility.blocked ||
            distanceCheckLoading ||
            !userCoords
          }
        >
          {placing || checkingStripe ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeText}>Pay now</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#171923' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 120 },
  setupCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.14)',
    padding: 12,
    marginBottom: 12,
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
  title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginBottom: 12 },
  emptyCard: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#09090B', padding: 16 },
  emptyTitle: { color: '#7D8493', fontWeight: '700' },
  emptySubTitle: { color: '#7D8493', fontWeight: '600', marginTop: 4 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lineThumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#B7BDC9',
  },
  lineThumbPh: { backgroundColor: '#f1f5f9' },
  lineBody: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: '#FFFFFF', fontWeight: '700', flex: 1, paddingRight: 8 },
  price: { color: '#22C55E', fontWeight: '800' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#09090B',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  total: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  placeButton: {
    marginLeft: 'auto',
    height: 42,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: { color: '#FFFFFF', fontWeight: '800' },
  disabled: { opacity: 0.45 },
});
