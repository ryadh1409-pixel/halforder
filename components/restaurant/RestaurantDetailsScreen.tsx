import { CategoryTabs } from '@/components/restaurant/CategoryTabs';
import { DeliveryOptions, type DeliveryMode } from '@/components/restaurant/DeliveryOptions';
import { FloatingCartBar } from '@/components/cart/FloatingCartBar';
import { ItemDetailsSheet } from '@/components/restaurant/ItemDetailsSheet';
import { MenuGridSkeleton } from '@/components/restaurant/MenuGridSkeleton';
import { MenuItemCard } from '@/components/restaurant/MenuItemCard';
import { MiniStickyHeader } from '@/components/restaurant/MiniStickyHeader';
import { PromoBanner } from '@/components/restaurant/PromoBanner';
import { RestaurantHero } from '@/components/restaurant/RestaurantHero';
import { RestaurantInfo } from '@/components/restaurant/RestaurantInfo';
import { RP } from '@/constants/restaurantPremiumTheme';
import { useMenu } from '@/hooks/useMenu';
import { useRestaurantProfile, type RestaurantProfile } from '@/hooks/useRestaurantProfile';
import { useAuth } from '@/services/AuthContext';
import { useCart } from '@/services/CartContext';
import {
  defaultCategoriesFromItems,
  enrichMenuItem,
  itemsForCategory,
  type DisplayMenuItem,
} from '@/utils/menuDisplayEnrich';
import { showError } from '@/utils/toast';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const PLACEHOLDER_PROFILE = (id: string): RestaurantProfile => ({
  id,
  name: 'Restaurant',
  image: null,
  coverImage: null,
  address: null,
  rating: 4.8,
  reviewCount: 1240,
});

type Props = {
  restaurantId: string;
};

export function RestaurantDetailsScreen({ restaurantId }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const { profile, loading: profileLoading } = useRestaurantProfile(restaurantId || null);
  const { items, loading: menuLoading, error, refetch } = useMenu(restaurantId || null);
  const { items: cart, addToCart } = useCart();

  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('delivery');
  const [activeCat, setActiveCat] = useState('Popular');
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DisplayMenuItem | null>(null);

  const resolvedProfile = profile ?? PLACEHOLDER_PROFILE(restaurantId);

  const displayItems = useMemo(() => items.map(enrichMenuItem), [items]);
  const categories = useMemo(() => defaultCategoriesFromItems(items), [items]);

  useEffect(() => {
    if (categories.length > 0 && !categories.includes(activeCat)) {
      setActiveCat(categories[0]!);
    }
  }, [categories, activeCat]);

  const categoryItems = useMemo(
    () => itemsForCategory(displayItems, activeCat),
    [displayItems, activeCat],
  );

  const cartForRestaurant = useMemo(
    () => cart.filter((c) => c.restaurantId === restaurantId),
    [cart, restaurantId],
  );

  const cartQty = useMemo(() => cartForRestaurant.reduce((s, c) => s + c.qty, 0), [cartForRestaurant]);
  const subtotal = useMemo(
    () => cartForRestaurant.reduce((s, c) => s + c.price * c.qty, 0),
    [cartForRestaurant],
  );
  const savings = useMemo(() => (subtotal >= 25 ? Math.min(6.5, subtotal * 0.06) : 0), [subtotal]);

  const loading = profileLoading || menuLoading;

  const qtyForItem = useCallback(
    (id: string) => cartForRestaurant.find((c) => c.id === id)?.qty ?? 0,
    [cartForRestaurant],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 700);
  }, [refetch]);

  const openSheet = useCallback((item: DisplayMenuItem) => {
    setSelectedItem(item);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setSelectedItem(null);
  }, []);

  const goCheckout = useCallback(() => {
    if (!user?.uid) {
      showError('Please sign in first.');
      return;
    }
    if (cartForRestaurant.length === 0) {
      showError('Cart is empty.');
      return;
    }
    router.push(
      `/restaurant-menu/checkout-premium?restaurantId=${encodeURIComponent(restaurantId)}` as never,
    );
  }, [cartForRestaurant.length, restaurantId, router, user?.uid]);

  const shareRestaurant = useCallback(async () => {
    try {
      await Share.share({
        message: `Order from ${resolvedProfile.name} on HalfOrder`,
      });
    } catch {
      /* ignore */
    }
  }, [resolvedProfile.name]);

  const rows = useMemo(() => {
    const out: DisplayMenuItem[][] = [];
    for (let i = 0; i < categoryItems.length; i += 2) {
      out.push([categoryItems[i]!, categoryItems[i + 1]].filter(Boolean) as DisplayMenuItem[]);
    }
    return out;
  }, [categoryItems]);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <MiniStickyHeader
        scrollY={scrollY}
        title={resolvedProfile.name}
        topInset={insets.top}
        onBack={() => router.back()}
      />

      <Animated.ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RP.text} />
        }
        contentContainerStyle={[styles.scrollContent, { paddingBottom: cartQty > 0 ? 120 : 32 }]}
      >
        <View>
          <RestaurantHero
            scrollY={scrollY}
            coverUri={resolvedProfile.coverImage}
            topInset={insets.top}
            onBack={() => router.back()}
            onSearch={() => Alert.alert('Search', 'Menu search is coming soon.')}
            onFavorite={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            onShare={() => void shareRestaurant()}
          />
          <RestaurantInfo
            profile={resolvedProfile}
            deliveryFee={deliveryMode === 'pickup' ? 0 : 2.49}
            serviceFee={0.99}
            distanceLabel="2.4 mi"
            etaRange={deliveryMode === 'pickup' ? '15–25 min' : '25–35 min'}
            reorderCopy="800+ people in your neighborhood reordered last month"
          />
          <DeliveryOptions mode={deliveryMode} onChange={setDeliveryMode} />
          <PromoBanner />
        </View>

        <CategoryTabs categories={categories} active={activeCat} onSelect={setActiveCat} />

        <View style={styles.menuBlock}>
          {error ? (
            <Text style={styles.err}>Could not load menu. Pull to refresh.</Text>
          ) : null}
          {loading ? (
            <MenuGridSkeleton rows={5} />
          ) : items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Menu is empty</Text>
              <Text style={styles.emptySub}>Check back soon for new dishes.</Text>
            </View>
          ) : (
            rows.map((pair, idx) => (
              <View key={`${activeCat}-${idx}`} style={styles.menuRow}>
                {pair.map((it) => (
                  <View key={it.id} style={styles.menuCell}>
                    <MenuItemCard
                      item={it}
                      qty={qtyForItem(it.id)}
                      onPress={() => openSheet(it)}
                      onAdd={() =>
                        addToCart({
                          id: it.id,
                          name: it.name,
                          price: it.price,
                          image: it.image,
                          restaurantId,
                        })
                      }
                    />
                  </View>
                ))}
                {pair.length === 1 ? <View style={styles.menuCell} /> : null}
              </View>
            ))
          )}
        </View>
      </Animated.ScrollView>

      <FloatingCartBar
        visible={cartQty > 0}
        itemCount={cartQty}
        savings={savings}
        total={subtotal}
        onCheckout={goCheckout}
      />

      <ItemDetailsSheet
        visible={sheetOpen}
        item={selectedItem}
        onClose={closeSheet}
        onAdd={(qty) => {
          const it = selectedItem;
          if (!it) return;
          for (let i = 0; i < qty; i += 1) {
            addToCart({
              id: it.id,
              name: it.name,
              price: it.price,
              image: it.image,
              restaurantId,
            });
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: RP.bg },
  scrollContent: { flexGrow: 1 },
  menuBlock: { paddingTop: 8, minHeight: 200 },
  menuRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 16 },
  menuCell: { flex: 1, minWidth: 0 },
  err: { paddingHorizontal: 16, color: RP.offer, fontWeight: '700', marginBottom: 8 },
  empty: {
    marginHorizontal: 16,
    padding: 24,
    borderRadius: RP.radiusM,
    backgroundColor: RP.surface,
    borderWidth: 1,
    borderColor: RP.border,
  },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: RP.text },
  emptySub: { marginTop: 6, fontSize: 14, fontWeight: '600', color: RP.textSecondary },
});
