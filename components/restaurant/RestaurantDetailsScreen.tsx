import { MenuHorizontalCarousel } from '@/components/menu/MenuHorizontalCarousel';
import { MenuItemCard } from '@/components/menu/MenuItemCard';
import { FloatingCartBar } from '@/components/cart/FloatingCartBar';
import { CategoryTabs } from '@/components/restaurant/CategoryTabs';
import { DeliveryOptions, type DeliveryMode } from '@/components/restaurant/DeliveryOptions';
import {
  ItemDetailsSheet,
  type ItemSheetAddPayload,
} from '@/components/restaurant/ItemDetailsSheet';
import {
  MenuGridSkeleton,
  RestaurantAboveFoldSkeleton,
} from '@/components/restaurant/MenuGridSkeleton';
import { MiniStickyHeader } from '@/components/restaurant/MiniStickyHeader';
import { QuickInfoCards } from '@/components/restaurant/QuickInfoCards';
import { RestaurantHero } from '@/components/restaurant/RestaurantHero';
import { RestaurantInfo } from '@/components/restaurant/RestaurantInfo';
import { RP } from '@/constants/restaurantPremiumTheme';
import { useMenu } from '@/hooks/useMenu';
import { useRestaurantMenuSections } from '@/hooks/useRestaurantMenuSections';
import { useRestaurantProfile, type RestaurantProfile } from '@/hooks/useRestaurantProfile';
import { useAuth } from '@/services/AuthContext';
import { useCart } from '@/services/CartContext';
import {
  cartFingerprint,
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
  rating: 4.85,
  reviewCount: 1240,
});

type Props = {
  restaurantId: string;
};

function buildOptionsFingerprint(payload: ItemSheetAddPayload): string {
  const note = payload.notes ? `notes:${payload.notes}` : '';
  return `${payload.optionsSummary}|${note}`;
}

/**
 * Marketplace restaurant storefront — Uber Eats–grade layout: hero, info, segmented order type,
 * featured horizontal rails, sticky category pills, denser grid menu, customizable item sheet,
 * floating checkout bar (`CartProvider`).
 */
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

  const displayItems = useMemo(
    () => items.filter((i) => i.available).map(enrichMenuItem),
    [items],
  );
  const categories = useMemo(() => defaultCategoriesFromItems(items), [items]);
  const sectionBuckets = useRestaurantMenuSections(displayItems);

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

  const cartQty = useMemo(
    () => cartForRestaurant.reduce((s, c) => s + c.qty, 0),
    [cartForRestaurant],
  );
  const subtotal = useMemo(
    () => cartForRestaurant.reduce((s, c) => s + c.price * c.qty, 0),
    [cartForRestaurant],
  );
  const savings = useMemo(() => (subtotal >= 25 ? Math.min(6.5, subtotal * 0.06) : 0), [subtotal]);

  const loading = profileLoading || menuLoading;

  /** Sum quantity across cart lines sharing the same base menu item id. */
  const qtyForBaseMenuItem = useCallback(
    (id: string) =>
      cartForRestaurant.filter((c) => c.id === id).reduce((acc, row) => acc + row.qty, 0),
    [cartForRestaurant],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
    setTimeout(() => setRefreshing(false), 680);
  }, [refetch]);

  const openSheet = useCallback((item: DisplayMenuItem) => {
    void Haptics.selectionAsync();
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

  const deliveryFee = deliveryMode === 'pickup' ? 0 : 2.49;
  const serviceFee = 0.99;
  const etaRange = deliveryMode === 'pickup' ? '15–25 min' : deliveryMode === 'group' ? '30–45 min' : '25–40 min';

  const rows = useMemo(() => {
    const out: DisplayMenuItem[][] = [];
    for (let i = 0; i < categoryItems.length; i += 2) {
      out.push([categoryItems[i]!, categoryItems[i + 1]].filter(Boolean) as DisplayMenuItem[]);
    }
    return out;
  }, [categoryItems]);

    (payload: ItemSheetAddPayload) => {
      const it = selectedItem;
      if (!it) return;
      const fp = cartFingerprint(buildOptionsFingerprint(payload));
      const optParts = [payload.optionsSummary, payload.notes ? `Note: ${payload.notes}` : ''].filter(
        Boolean,
      );
      addToCart({
        id: it.id,
        cartLineId: `${it.id}__${fp}`,
        name: it.name,
        price: it.price,
        image: it.image,
        restaurantId,
        optionsSummary: optParts.join(' · '),
        qty: payload.qty,
      });
    },
    [addToCart, restaurantId, selectedItem],
  );

  const quickAdd = useCallback(
    (it: DisplayMenuItem) => {
      addToCart({
        id: it.id,
        name: it.name,
        price: it.price,
        image: it.image,
        restaurantId,
      });
    },
    [addToCart, restaurantId],
  );

  const openRestaurantMenu = useCallback(() => {
    Alert.alert(
      'Menu',
      'Search and dietary filters arrive in the next update. Explore categories below.',
    );
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <MiniStickyHeader
        scrollY={scrollY}
        title={resolvedProfile.name}
        topInset={insets.top}
        onBack={() => router.back()}
      />

      <Animated.ScrollView
        stickyHeaderIndices={[2]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RP.text} />
        }
        contentContainerStyle={[styles.scrollContent, { paddingBottom: cartQty > 0 ? 128 : 36 }]}
      >
        <View>
          {profileLoading ? (
            <RestaurantAboveFoldSkeleton />
          ) : (
            <>
              <RestaurantHero
                scrollY={scrollY}
                coverUri={resolvedProfile.coverImage}
                topInset={insets.top}
                onBack={() => router.back()}
                onSearch={openRestaurantMenu}
                onFavorite={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                onShare={() => void shareRestaurant()}
                onMore={() => {
                  void Haptics.selectionAsync();
                  Alert.alert('Restaurant', 'Coupons, hours, and allergen info — coming soon.');
                }}
              />
              <RestaurantInfo
                profile={resolvedProfile}
                deliveryFee={deliveryFee}
                serviceFee={serviceFee}
                distanceLabel="2.4 mi"
                etaRange={etaRange}
                reorderCopy="800+ people in your neighborhood reordered last month"
              />
              <DeliveryOptions mode={deliveryMode} onChange={setDeliveryMode} />
              <QuickInfoCards
                mode={deliveryMode}
                deliveryFee={deliveryFee}
                etaRange={etaRange}
              />
            </>
          )}
        </View>

        <View style={styles.featuredBlock}>
          <MenuHorizontalCarousel
            title="Popular items"
            subtitle="Top picks near you"
            items={sectionBuckets.popular}
            qtyForItem={qtyForBaseMenuItem}
            onItemPress={openSheet}
            onItemAdd={quickAdd}
          />
          <MenuHorizontalCarousel
            title="Buy 1 Get 1"
            subtitle="Deals on bundles"
            items={sectionBuckets.deals}
            qtyForItem={qtyForBaseMenuItem}
            onItemPress={openSheet}
            onItemAdd={quickAdd}
          />
          <MenuHorizontalCarousel
            title="Recommended"
            subtitle="Because you order great food"
            items={sectionBuckets.recommended}
            qtyForItem={qtyForBaseMenuItem}
            onItemPress={openSheet}
            onItemAdd={quickAdd}
          />
          <MenuHorizontalCarousel
            title="Drinks"
            subtitle="Add a beverage"
            items={sectionBuckets.drinks}
            qtyForItem={qtyForBaseMenuItem}
            onItemPress={openSheet}
            onItemAdd={quickAdd}
          />
          <MenuHorizontalCarousel
            title="Desserts"
            subtitle="Finish sweet"
            items={sectionBuckets.desserts}
            qtyForItem={qtyForBaseMenuItem}
            onItemPress={openSheet}
            onItemAdd={quickAdd}
          />
        </View>

        <CategoryTabs categories={categories} active={activeCat} onSelect={setActiveCat} />

        <View>
          <View style={styles.menuHeaderRow}>
            <Text style={styles.menuHeaderTitle}>{activeCat}</Text>
            <Text style={styles.menuHeaderSub}>
              {categoryItems.length} {categoryItems.length === 1 ? 'item' : 'items'}
            </Text>
          </View>

          <View style={styles.menuBlock}>
          {error ? (
            <Text style={styles.err}>Could not load menu. Pull to refresh.</Text>
          ) : null}
          {loading && displayItems.length === 0 ? (
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
                      qty={qtyForBaseMenuItem(it.id)}
                      onPress={() => openSheet(it)}
                      onAdd={() => quickAdd(it)}
                    />
                  </View>
                ))}
                {pair.length === 1 ? <View style={styles.menuCell} /> : null}
              </View>
            ))
          />
        </View>
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
        onAdd={addFromSheet}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: RP.bg },
  scrollContent: { flexGrow: 1 },
  featuredBlock: { marginTop: 4 },
  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
  },
  menuHeaderTitle: { fontSize: 22, fontWeight: '900', color: RP.text, letterSpacing: -0.4 },
  menuHeaderSub: { fontSize: 13, fontWeight: '700', color: RP.textMuted },
  menuBlock: { paddingTop: 4, minHeight: 200 },
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
