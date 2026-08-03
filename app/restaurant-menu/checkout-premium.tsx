/**
 * Marketplace checkout — Uber Eats–tier layout composed from `components/checkout/*`.
 * Firebase: cart via `CartContext`, restaurant/menu via hooks, orders via `createOrder`.
 * Payments: Stripe PaymentSheet on `/checkout` after place order (no custom method picker).
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
  PromoCodeRow,
  SavingsRibbon,
  StickyCheckoutButton,
} from '@/components/checkout';
import {
  CheckoutFundingModeCard,
  type CheckoutFundingMode,
} from '@/components/completeMeal/CheckoutFundingModeCard';
import { DeliveryEligibilityBanner } from '@/components/delivery/DeliveryEligibilityBanner';
import { setPendingCompleteMealDraft } from '@/services/completeMeal/pendingDraft';
import { COMPLETE_MEAL_CHECKOUT_ENTRY_ENABLED } from '@/constants/completeMeal';
import { CK } from '@/constants/checkoutUi';
import type {
  CheckoutDeliveryTiming,
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
import { logLocationDebug } from '@/lib/location/locationDebugLog';
import {
  fetchRestaurantLocation,
  resolveDeliveryLocationForCheckout,
} from '@/services/location';
import {
  MARKETPLACE_USER_LOCATION_KEY,
  readMarketplaceUserLocationCache,
} from '@/services/location/locationLocalCache';
import { useHomeMarketplaceLocation } from '@/contexts/HomeMarketplaceLocationContext';
import { useDeliveryEligibility } from '@/hooks/useDeliveryEligibility';
import {
  fetchCheckoutCustomerSnapshotFromServer,
  resolveCheckoutDeliveryAddress,
  subscribeCheckoutCustomerSnapshot,
  syncProfileLocationToAddressBook,
} from '@/services/checkoutCustomerPrefs';
import {
  EMPTY_CHECKOUT_DELIVERY_PREFS,
  summarizeDeliveryPrefs,
  type CheckoutAddressBookEntry,
  type CheckoutDeliveryPrefs,
} from '@/types/checkoutCustomerPrefs';
import type { SavedLocation } from '@/types/savedLocation';
import {
  displayFromStoredProfilePhone,
  isProfilePhoneStorageEmpty,
  profilePhoneForFirestore,
} from '@/lib/profileWhatsAppPhone';
import { isRegisteredAuthUser } from '@/lib/authSession';
import { OUTSIDE_DELIVERY_AREA_MESSAGE } from '@/lib/delivery/deliveryEligibility';
import {
  restaurantPromoWaivesDeliveryFee,
  restaurantPromoWaivesServiceFee,
} from '@/lib/promotionBadge';
import { calculateServiceFee } from '@/lib/restaurantStoreMetrics';
import {
  computeHiEmoooDiscountAmount,
  HI_EMOOO_PROMO_CODE,
  loadEmoHiEmoooDiscount,
} from '@/services/emoAi/emoAiHiEmoooReward';
import { getCashbackWallet } from '@/services/cashbackRewards';
import type { CashbackWallet } from '@/types/cashbackRewards';
import { showError, showFriendlyError, showSuccess } from '@/utils/toast';
import { getUserFriendlyError } from '@/services/errors/userFriendlyErrors';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

function isCashbackCampaignActive(wallet: CashbackWallet | null): boolean {
  if (!wallet) return false;
  const { enabled, paused, startAtMs, endAtMs } = wallet.settings;
  if (!enabled || paused) return false;
  const now = Date.now();
  if (startAtMs != null && now < startAtMs) return false;
  if (endAtMs != null && now > endAtMs) return false;
  return true;
}

export default function CheckoutPremiumScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId: string }>();
  const restaurantId = typeof params.restaurantId === 'string' ? params.restaurantId : '';

  const { user, loading: authLoading } = useAuth();

  const { items: cart } = useCart();
  const { profile } = useRestaurantProfile(restaurantId || null);
  const { items: menuItems, loading: menuLoading } = useMenu(restaurantId || null);
  const {
    userCoords,
    addressLine: marketplaceAddressLine,
    locationLoading,
    locationReady,
    applyCanonicalDeliveryLocation,
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
  const [fundingMode, setFundingMode] = useState<CheckoutFundingMode>('full');
  const [promoDiscount, setPromoDiscount] = useState(0);
  const [appliedPromoCode, setAppliedPromoCode] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [autoHiEmooo, setAutoHiEmooo] = useState(false);
  const [cashbackWallet, setCashbackWallet] = useState<CashbackWallet | null>(
    null,
  );
  const [useHalfOrderCash, setUseHalfOrderCash] = useState(false);
  const [deliveryPrefs, setDeliveryPrefs] = useState<CheckoutDeliveryPrefs>({
    ...EMPTY_CHECKOUT_DELIVERY_PREFS,
  });
  const [addressBook, setAddressBook] = useState<CheckoutAddressBookEntry[]>([]);
  const [profileDeliveryLocation, setProfileDeliveryLocation] =
    useState<SavedLocation | null>(null);
  const [checkoutPhone, setCheckoutPhone] = useState('');

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

  // Auto-apply one-time Hi emooo gift (no manual code entry).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.uid || autoHiEmooo) return;
      if (!(subtotal > 0)) return;
      // Don't override a different manually applied promo.
      if (appliedPromoCode && appliedPromoCode !== HI_EMOOO_PROMO_CODE) return;
      const giftDiscount = await loadEmoHiEmoooDiscount(user.uid);
      if (cancelled || !giftDiscount || giftDiscount.status !== 'available') {
        return;
      }
      const amount = computeHiEmoooDiscountAmount(subtotal);
      if (!(amount > 0)) return;
      setPromoDiscount(amount);
      setAppliedPromoCode(HI_EMOOO_PROMO_CODE);
      setPromo(HI_EMOOO_PROMO_CODE);
      setAutoHiEmooo(true);
      setPromoError(null);
      showSuccess('Hi emooo 50% gift applied');
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, subtotal, autoHiEmooo, appliedPromoCode, setPromo]);

  // Keep Hi emooo amount in sync when cart subtotal changes.
  useEffect(() => {
    if (!autoHiEmooo || appliedPromoCode !== HI_EMOOO_PROMO_CODE) return;
    setPromoDiscount(computeHiEmoooDiscountAmount(subtotal));
  }, [autoHiEmooo, appliedPromoCode, subtotal]);

  // Fetch HalfOrder Cash wallet once for authenticated customers.
  useEffect(() => {
    let cancelled = false;
    const uid = user?.uid;
    if (!uid || user?.isAnonymous) {
      setCashbackWallet(null);
      setUseHalfOrderCash(false);
      return undefined;
    }
    void (async () => {
      try {
        const wallet = await getCashbackWallet();
        if (!cancelled) setCashbackWallet(wallet);
      } catch {
        if (!cancelled) setCashbackWallet(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.isAnonymous]);

  const selectedAddress = useMemo(
    () =>
      resolveCheckoutDeliveryAddress({
        profileDeliveryLocation,
        addressBook,
      }),
    [profileDeliveryLocation, addressBook],
  );

  useEffect(() => {
    logLocationDebug('[CART]', {
      deliveryAddress: selectedAddress?.address ?? null,
      deliveryCoordinates: selectedAddress
        ? { lat: selectedAddress.latitude, lng: selectedAddress.longitude }
        : null,
      source: profileDeliveryLocation
        ? 'users/{uid}.location (canonical)'
        : 'checkoutAddressBook fallback',
    });
  }, [selectedAddress, profileDeliveryLocation]);

  useEffect(() => {
    const uid = isRegisteredAuthUser(user) ? user!.uid : null;
    if (!uid || fulfillmentMode === 'pickup') return;

    const finalAddress =
      selectedAddress?.address?.trim() || 'Add a delivery address';
    const finalCoordinates = selectedAddress
      ? {
          latitude: selectedAddress.latitude,
          longitude: selectedAddress.longitude,
        }
      : null;

    void (async () => {
      let asyncStorageCache: unknown = null;
      try {
        asyncStorageCache = await readMarketplaceUserLocationCache();
      } catch {
        asyncStorageCache = null;
      }

      logLocationDebug('[CHECKOUT OPENS]', {
        whereLoadedFrom: profileDeliveryLocation
          ? 'Firestore users/{uid}.location (canonical profile pin)'
          : addressBook.length > 0
            ? 'Firestore users/{uid}.checkoutAddressBook (fallback)'
            : 'none — empty',
        firestorePath: `users/${uid}`,
        firestoreFieldsRead: [
          'location',
          'address',
          'formattedAddress',
          'checkoutAddressBook',
        ],
        asyncStorageKeys: [
          MARKETPLACE_USER_LOCATION_KEY,
          '@ourfood/delivery_location_cache (legacy, cleared only)',
          '@ourfood/live_gps_bias',
        ],
        asyncStorageMarketplaceCache: asyncStorageCache,
        contextState: {
          name: 'HomeMarketplaceLocationContext',
          userCoords,
          marketplaceAddressLine,
          locationReady,
          locationLoading,
        },
        profileDeliveryLocation: profileDeliveryLocation
          ? {
              address: profileDeliveryLocation.address,
              coordinates: {
                latitude: profileDeliveryLocation.latitude,
                longitude: profileDeliveryLocation.longitude,
              },
            }
          : null,
        addressBookDefault: addressBook.find((e) => e.isDefault) ?? addressBook[0] ?? null,
        finalAddressDisplayed: finalAddress,
        finalCoordinates,
        zustandCheckoutStoreAddressPrimary: useCheckoutStore.getState().addressPrimary,
      });

      logLocationDebug('[CHECKOUT LOAD]', {
        source: profileDeliveryLocation
          ? 'users/{uid}.location'
          : 'checkoutAddressBook / empty',
        documentPath: `users/${uid}`,
        asyncStorageKey: MARKETPLACE_USER_LOCATION_KEY,
        contextState: {
          userCoords,
          marketplaceAddressLine,
        },
        address: finalAddress,
        coordinates: finalCoordinates,
      });
    })();
  }, [
    user,
    fulfillmentMode,
    selectedAddress,
    profileDeliveryLocation,
    addressBook,
    userCoords,
    marketplaceAddressLine,
    locationReady,
    locationLoading,
  ]);

  const mapCoords = useMemo(() => {
    // Delivery map pin must follow canonical profile location — never GPS context.
    if (
      selectedAddress &&
      Number.isFinite(selectedAddress.latitude) &&
      Number.isFinite(selectedAddress.longitude)
    ) {
      return { lat: selectedAddress.latitude, lng: selectedAddress.longitude };
    }
    if (
      profileDeliveryLocation &&
      Number.isFinite(profileDeliveryLocation.latitude) &&
      Number.isFinite(profileDeliveryLocation.longitude)
    ) {
      return {
        lat: profileDeliveryLocation.latitude,
        lng: profileDeliveryLocation.longitude,
      };
    }
    return null;
  }, [selectedAddress, profileDeliveryLocation]);

  const { eligibility, distanceLoading: distanceCheckLoading } = useDeliveryEligibility({
    customerEntity: mapCoords,
    restaurantEntity: profile?.raw,
    restaurantRaw: profile?.raw,
    mode: fulfillmentMode === 'pickup' ? 'pickup' : 'delivery',
    locationResolving:
      fulfillmentMode === 'delivery' && !mapCoords && (locationLoading || !locationReady),
    locationReady: locationReady || Boolean(mapCoords),
  });

  const waiveDeliveryFee = restaurantPromoWaivesDeliveryFee(profile?.raw);
  const waiveServiceFee = restaurantPromoWaivesServiceFee(profile?.raw);

  const deliveryFee =
    fulfillmentMode === 'pickup'
      ? 0
      : waiveDeliveryFee
        ? 0
        : (eligibility.deliveryFee.amount ?? 0);

  const priorityFee =
    fulfillmentMode === 'pickup' ? 0 : timing === 'priority' ? 2.49 : 0;

  const serviceFee = useMemo(
    () =>
      waiveServiceFee
        ? 0
        : (calculateServiceFee({
            subtotal,
            firestoreFee: profile?.serviceFee ?? null,
          }).amount ?? 0),
    [subtotal, profile?.serviceFee, waiveServiceFee],
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

  const cashbackAvailableCad = Math.max(0, cashbackWallet?.availableCad ?? 0);
  const canApplyHalfOrderCash =
    cashbackAvailableCad > 0 &&
    !!cashbackWallet?.settings.enabled &&
    cashbackWallet.settings.visibleInUserApp !== false &&
    isCashbackCampaignActive(cashbackWallet);

  useEffect(() => {
    if (!canApplyHalfOrderCash && useHalfOrderCash) {
      setUseHalfOrderCash(false);
    }
  }, [canApplyHalfOrderCash, useHalfOrderCash]);

  const appliedCashbackCad =
    useHalfOrderCash && canApplyHalfOrderCash
      ? Math.min(cashbackAvailableCad, total)
      : 0;
  const remainingCashBalanceCad = Math.max(
    0,
    cashbackAvailableCad - appliedCashbackCad,
  );
  const remainingAmountToPay = Math.max(0, total - appliedCashbackCad);

  const cad = (n: number) => `CA$${n.toFixed(2)}`;
  const totalFmt = cad(total);
  const payFmt = cad(remainingAmountToPay);

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
      setPromoError(
        getUserFriendlyError(e, {
          context: 'order',
          fallback: 'Invalid promo code',
        }),
      );
    } finally {
      setPromoBusy(false);
    }
  }, [promo, restaurantId, setPromo, subtotal]);

  useEffect(() => {
    const uid = isRegisteredAuthUser(user) ? user!.uid : null;
    if (!uid) {
      setDeliveryPrefs({ ...EMPTY_CHECKOUT_DELIVERY_PREFS });
      setAddressBook([]);
      setProfileDeliveryLocation(null);
      setCheckoutPhone('');
      return undefined;
    }
    return subscribeCheckoutCustomerSnapshot(uid, (snap) => {
      setDeliveryPrefs(snap.deliveryPrefs);
      setAddressBook(snap.addressBook);
      setProfileDeliveryLocation(snap.profileDeliveryLocation);
      setCheckoutPhone(snap.phone || snap.phoneNumber);
      if (snap.profileDeliveryLocation) {
        void applyCanonicalDeliveryLocation(snap.profileDeliveryLocation);
      }
    });
  }, [user, applyCanonicalDeliveryLocation]);

  useFocusEffect(
    useCallback(() => {
      // Do NOT refresh GPS here — that overwrites marketplaceAddressLine with a stale pin.
      const uid = isRegisteredAuthUser(user) ? user!.uid : null;
      if (!uid) return;
      void (async () => {
        try {
          const snap = await fetchCheckoutCustomerSnapshotFromServer(uid);
          setDeliveryPrefs(snap.deliveryPrefs);
          setAddressBook(snap.addressBook);
          setProfileDeliveryLocation(snap.profileDeliveryLocation);
          setCheckoutPhone(snap.phone || snap.phoneNumber);
          if (snap.profileDeliveryLocation) {
            await applyCanonicalDeliveryLocation(snap.profileDeliveryLocation);
          }
          logLocationDebug('[CHECKOUT LOAD]', {
            source: 'checkout focus reload (server)',
            documentPath: `users/${uid}`,
            asyncStorageKey: MARKETPLACE_USER_LOCATION_KEY,
            address: snap.profileDeliveryLocation?.address ?? null,
            coordinates: snap.profileDeliveryLocation
              ? {
                  latitude: snap.profileDeliveryLocation.latitude,
                  longitude: snap.profileDeliveryLocation.longitude,
                }
              : null,
            contextState: {
              userCoords,
              marketplaceAddressLine,
              locationReady,
              locationLoading,
            },
          });
          if (snap.profileDeliveryLocation) {
            const book = await syncProfileLocationToAddressBook(uid);
            setAddressBook(book);
          }
        } catch {
          /* keep live snapshot */
        }
      })();
    }, [
      user,
      userCoords,
      marketplaceAddressLine,
      locationReady,
      locationLoading,
      applyCanonicalDeliveryLocation,
    ]),
  );

  const addressPrimary =
    fulfillmentMode === 'pickup'
      ? (profile?.address ?? 'Restaurant pickup')
      : (selectedAddress?.formattedAddress?.trim() ||
          selectedAddress?.address?.trim() ||
          profileDeliveryLocation?.formattedAddress?.trim() ||
          profileDeliveryLocation?.address?.trim() ||
          'Add a delivery address');
  const addressSecondary =
    fulfillmentMode === 'pickup'
      ? 'Pickup parking — side entrance'
      : summarizeDeliveryPrefs(deliveryPrefs);
  const instructionsSubtitle = summarizeDeliveryPrefs(deliveryPrefs);
  const addressRowSubtitle =
    fulfillmentMode === 'delivery'
      ? selectedAddress?.label
        ? `${selectedAddress.label}${
            deliveryPrefs.buzzer.trim()
              ? ` · Buzzer ${deliveryPrefs.buzzer.trim()}`
              : ''
          }`
        : deliveryPrefs.buzzer.trim()
          ? `Buzzer ${deliveryPrefs.buzzer.trim()}`
          : 'Choose or add a delivery address'
      : (profile?.name ?? 'Restaurant');
  const phoneDigits = profilePhoneForFirestore(checkoutPhone);
  const phoneDisplay = isProfilePhoneStorageEmpty(phoneDigits)
    ? 'Add phone number'
    : displayFromStoredProfilePhone(checkoutPhone);

  async function submitOrder() {
    console.log('[CHECKOUT NEXT CLICKED]', {
      placing,
      cartCount: cartItems.length,
      blocked,
      payment: 'stripe_payment_sheet',
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

    await placeOrder();
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
        const delivery = await resolveDeliveryLocationForCheckout({
          required: true,
          persistToProfile: false,
          manual: selectedAddress
            ? {
                address: selectedAddress.address,
                formattedAddress:
                  selectedAddress.formattedAddress ?? selectedAddress.address,
                latitude: selectedAddress.latitude,
                longitude: selectedAddress.longitude,
                placeId: selectedAddress.placeId,
                city: selectedAddress.city,
                province: selectedAddress.province,
                country: selectedAddress.country,
                postalCode: selectedAddress.postalCode,
              }
            : profileDeliveryLocation,
          savedProfile: profileDeliveryLocation,
        });
        deliveryLocation = {
          lat: delivery.lat,
          lng: delivery.lng,
          address: delivery.address,
        };
        customerLocation = delivery.customerLocation;
        logLocationDebug('[ORDER]', {
          deliveryAddress: deliveryLocation.address,
          deliveryCoordinates: {
            latitude: deliveryLocation.lat,
            longitude: deliveryLocation.lng,
          },
          source: 'checkout selectedAddress → resolveDeliveryLocationForCheckout',
          profileDeliveryLocationAddress: profileDeliveryLocation?.address ?? null,
        });
      }

      let restaurantLocationForLog: {
        latitude: number;
        longitude: number;
        address?: string | null;
      } | null = null;
      try {
        const rl = await fetchRestaurantLocation(restaurantId);
        restaurantLocationForLog = {
          latitude: rl.latitude,
          longitude: rl.longitude,
          address: rl.address,
        };
      } catch {
        restaurantLocationForLog = null;
      }

      console.log('[E2E VERIFY] BEFORE createOrder()', {
        customerLocation: customerLocation
          ? {
              latitude: customerLocation.latitude,
              longitude: customerLocation.longitude,
            }
          : null,
        deliveryLocation: {
          latitude: deliveryLocation.lat,
          longitude: deliveryLocation.lng,
          address: deliveryLocation.address,
        },
        restaurantLocation: restaurantLocationForLog,
        restaurantId,
        fulfillmentMode,
      });

      if (
        COMPLETE_MEAL_CHECKOUT_ENTRY_ENABLED &&
        fundingMode === 'complete_meal'
      ) {
        setPendingCompleteMealDraft({
          restaurantId,
          restaurantName: profile?.name ?? 'Restaurant',
          items: cartItems.map((i) => ({
            id: i.id,
            name: i.name,
            price: i.price,
            qty: i.qty,
            image: i.image ?? null,
          })),
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
          customerLocation: customerLocation
            ? {
                latitude: customerLocation.latitude,
                longitude: customerLocation.longitude,
                timestamp:
                  typeof customerLocation.timestamp === 'number'
                    ? customerLocation.timestamp
                    : Date.now(),
              }
            : null,
        });
        router.replace('/complete-meal/setup' as never);
        return;
      }

      const orderId = await createOrder({
        userId: user!.uid,
        restaurantId,
        items: cartItems,
        // Checkout Final Total — single source of truth (never recompute for Stripe).
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
      // Cart stays until payment succeeds so dismissing PaymentSheet
      // returns here with checkout progress intact.
      // Charge = Final Total, minus HalfOrder Cash when applied (equals Final Total otherwise).
      const checkoutFinalTotalCents = Math.round(total * 100);
      const checkoutChargeCents = Math.round(remainingAmountToPay * 100);
      console.log(
        JSON.stringify({
          msg: 'checkout_final_total_to_payment',
          orderId,
          checkoutFinalTotalCad: total,
          checkoutFinalTotalCents,
          checkoutChargeCents,
          appliedCashbackCad,
          promoDiscount,
          subtotal,
          deliveryFee,
          priorityFee,
          serviceFee,
          taxes,
        }),
      );
      router.push({
        pathname: '/checkout',
        params: {
          orderId,
          restaurantId,
          amountCents: String(checkoutChargeCents),
          finalTotalCents: String(checkoutFinalTotalCents),
          ...(useHalfOrderCash && appliedCashbackCad > 0
            ? { useHalfOrderCash: 'true' }
            : {}),
        },
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
      {
        key: 'subtotal',
        label: autoHiEmooo ? 'Food subtotal' : 'Item subtotal',
        value: cad(subtotal),
      },
    ];
    if (promoDiscount > 0) {
      rows.push({
        key: 'promo',
        label:
          appliedPromoCode === HI_EMOOO_PROMO_CODE
            ? 'Hi emooo discount (-50%)'
            : 'Promotions',
        value: `-${cad(promoDiscount)}`,
        emphasizeSave: true,
        badge:
          appliedPromoCode === HI_EMOOO_PROMO_CODE ? 'Hi emooo' : 'Promo',
      });
    }
    rows.push({
      key: 'delivery',
      label: 'Delivery',
      value:
        fulfillmentMode === 'pickup'
          ? cad(0)
          : waiveDeliveryFee || deliveryFee <= 0
            ? 'FREE'
            : cad(deliveryFee),
      emphasizeSave:
        fulfillmentMode === 'delivery' &&
        (waiveDeliveryFee || subtotal >= 25),
    });
    if (priorityFee > 0) {
      rows.push({
        key: 'priority',
        label: 'Priority delivery',
        value: cad(priorityFee),
      });
    }
    rows.push({
      key: 'service',
      label: autoHiEmooo ? 'Service fee' : 'Fees & marketplace service',
      value: waiveServiceFee || serviceFee <= 0 ? 'FREE' : cad(serviceFee),
    });
    rows.push({
      key: 'tax',
      label: `Tax (HST ${Math.round(taxRate * 1000) / 10}%)`,
      value: cad(taxes),
    });
    const beforeSavings = strikeSubtotal + taxes;
    if (beforeSavings > total + 0.009) {
      rows.push({
        key: 'beforeSave',
        label: 'Pricing before promotions',
        value: cad(beforeSavings),
        strikethrough: true,
      });
    }
    rows.push({
      key: 'total',
      label: 'Final total',
      value: totalFmt,
    });
    return rows;
  }, [
    appliedPromoCode,
    autoHiEmooo,
    deliveryFee,
    fulfillmentMode,
    priorityFee,
    promoDiscount,
    serviceFee,
    strikeSubtotal,
    subtotal,
    taxes,
    taxRate,
    total,
    totalFmt,
    waiveDeliveryFee,
    waiveServiceFee,
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
  }, [setTiming]);

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
      (distanceCheckLoading || !mapCoords || eligibility.blocked));

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
            variant="checkout"
          />
        ) : null}

        {fulfillmentMode === 'delivery' && mapCoords ? (
          <DeliveryMapCard
            center={{ latitude: mapCoords.lat, longitude: mapCoords.lng }}
            markers={[
              {
                id: 'drop',
                latitude: mapCoords.lat,
                longitude: mapCoords.lng,
              },
            ]}
            addressPrimary={addressPrimary}
            addressSecondary={addressSecondary}
            onEditPin={() => router.push('/location' as never)}
          />
        ) : fulfillmentMode === 'delivery' && distanceCheckLoading ? (
          <View style={styles.locationLoading}>
            <Text style={styles.locationLoadingText}>Getting your delivery location…</Text>
          </View>
        ) : null}

        <View style={{ height: 8 }} />

        <View style={styles.addressGroup}>
          <AddressRow
            icon="location-outline"
            title={addressPrimary}
            subtitle={addressRowSubtitle}
            onPress={() =>
              router.push(
                (fulfillmentMode === 'delivery'
                  ? '/checkout-addresses'
                  : '/location') as never,
              )
            }
          />
          <AddressRow
            icon="chatbubble-ellipses-outline"
            title="Delivery instructions"
            subtitle={instructionsSubtitle}
            subtitlePlaceholder={
              instructionsSubtitle === 'Add delivery instructions'
            }
            onPress={() =>
              router.push('/checkout-delivery-instructions' as never)
            }
          />
          <AddressRow
            icon="call-outline"
            title={phoneDisplay}
            subtitle="Driver can call when nearby"
            onPress={() => router.push('/checkout-phone' as never)}
            last
          />
        </View>

        <View style={{ height: 8 }} />

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

        <View style={{ height: 8 }} />

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
              <Text style={styles.lineRight}>{cad(line.price * line.qty)}</Text>
            </View>
          ))}
        </CheckoutOrderSummary>

        <View style={{ height: 8 }} />

        <GiftToggleRow checked={gift} onToggle={setGift} />

        <View style={{ height: 8 }} />

        {autoHiEmooo && appliedPromoCode === HI_EMOOO_PROMO_CODE ? (
          <View style={styles.hiEmoooGiftCard}>
            <Text style={styles.hiEmoooGiftTitle}>🎉 Hi emooo Gift</Text>
            <Text style={styles.hiEmoooGiftOff}>
              50% OFF your first shared meal
            </Text>
            <Text style={styles.hiEmoooGiftHint}>Applied automatically</Text>
          </View>
        ) : (
          <PromoCodeRow
            value={promo}
            onChange={(next) => {
              setPromo(next);
              setPromoDiscount(0);
              setAppliedPromoCode(null);
              setAutoHiEmooo(false);
              setPromoError(null);
            }}
            onApply={() => void onApplyPromo()}
            applying={promoBusy}
            appliedLabel={appliedPromoCode}
            error={promoError}
            hint="Enter a promo code from HalfOrder and tap Apply."
          />
        )}

        <View style={{ height: 8 }} />

        <CheckoutPriceBreakdown lines={priceLines} />

        {canApplyHalfOrderCash ? (
          <View style={styles.cashbackCard}>
            <View style={styles.cashbackHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cashbackTitle}>Apply HalfOrder Cash</Text>
                <Text style={styles.cashbackSub}>
                  Applied after promos and tax · capped at order total
                </Text>
              </View>
              <Switch
                value={useHalfOrderCash}
                onValueChange={setUseHalfOrderCash}
                trackColor={{ false: CK.surface2, true: '#A855F7' }}
                thumbColor="#FFF"
              />
            </View>
            <View style={styles.cashbackRows}>
              <View style={styles.cashbackRow}>
                <Text style={styles.cashbackLabel}>Wallet Balance</Text>
                <Text style={styles.cashbackValue}>
                  {cad(cashbackAvailableCad)}
                </Text>
              </View>
              <View style={styles.cashbackRow}>
                <Text style={styles.cashbackLabel}>Applied Cashback</Text>
                <Text style={styles.cashbackValueAccent}>
                  −{cad(appliedCashbackCad)}
                </Text>
              </View>
              <View style={styles.cashbackRow}>
                <Text style={styles.cashbackLabel}>Remaining Balance</Text>
                <Text style={styles.cashbackValue}>
                  {cad(remainingCashBalanceCad)}
                </Text>
              </View>
              <View style={[styles.cashbackRow, styles.cashbackRowLast]}>
                <Text style={styles.cashbackPayLabel}>
                  Remaining Amount to Pay
                </Text>
                <Text style={styles.cashbackPayValue}>{payFmt}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={{ height: 8 }} />

        <CheckoutFundingModeCard
          mode={fundingMode}
          onChange={setFundingMode}
          showCompleteMeal={COMPLETE_MEAL_CHECKOUT_ENTRY_ENABLED}
        />

        {/* Space for pinned footer */}
        <View style={{ height: 200 }} />
      </Animated.ScrollView>

      <View style={styles.footerDock} pointerEvents="box-none">
        <SavingsRibbon
          savingsAmount={savingsRibbonAmount}
          headline={
            autoHiEmooo && savingsRibbonAmount > 0
              ? '🎉 Hi emooo gift applied'
              : undefined
          }
          detail={
            autoHiEmooo && savingsRibbonAmount > 0
              ? `You saved ${cad(savingsRibbonAmount)} on your first shared meal.`
              : undefined
          }
          sublabel={
            autoHiEmooo
              ? undefined
              : savingsRibbonAmount > 0
                ? 'HalfOrder+ perks stack with promos this order'
                : undefined
          }
        />
        <StickyCheckoutButton
          label={
            COMPLETE_MEAL_CHECKOUT_ENTRY_ENABLED &&
            fundingMode === 'complete_meal'
              ? 'Complete My Meal'
              : 'Complete Checkout'
          }
          sublabel={`Pay ${appliedCashbackCad > 0 ? payFmt : totalFmt}`}
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
  addressGroup: {
    marginHorizontal: 16,
    marginTop: 4,
  },
  footerDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 40,
    paddingBottom: 0,
    backgroundColor: CK.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
    ...Platform.select({
      web: { boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.18)' },
      default: {},
    }),
  },
  pickupNote: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  pickupTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.1,
  },
  pickupBody: {
    marginTop: 8,
    fontSize: 13.5,
    fontWeight: '600',
    color: CK.textSecondary,
    lineHeight: 19,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
  },
  lineLeft: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: CK.textSecondary,
    lineHeight: 19,
  },
  lineRight: {
    fontSize: 14,
    fontWeight: '800',
    color: CK.text,
    fontVariant: ['tabular-nums'],
  },
  hiEmoooGiftCard: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 0,
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  hiEmoooGiftTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.2,
  },
  hiEmoooGiftOff: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '800',
    color: CK.savingsGoldMid,
    lineHeight: 21,
  },
  hiEmoooGiftHint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textSecondary,
  },
  locationLoading: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  locationLoadingText: {
    color: CK.textMuted,
    fontWeight: '600',
    textAlign: 'left',
  },
  cashbackCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 0,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  cashbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cashbackTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.15,
  },
  cashbackSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textMuted,
    lineHeight: 18,
  },
  cashbackRows: {
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
  },
  cashbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  cashbackRowLast: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  cashbackLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: CK.textSecondary,
  },
  cashbackValue: {
    fontSize: 15,
    fontWeight: '700',
    color: CK.text,
    fontVariant: ['tabular-nums'],
  },
  cashbackValueAccent: {
    fontSize: 15,
    fontWeight: '800',
    color: '#A855F7',
    fontVariant: ['tabular-nums'],
  },
  cashbackPayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: CK.textSecondary,
  },
  cashbackPayValue: {
    fontSize: 18,
    fontWeight: '900',
    color: CK.text,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
});
