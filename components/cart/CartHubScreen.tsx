import { UE } from '@/constants/uberEatsTheme';
import { selectCartTotals, useCartStore } from '@/store/cartStore';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Cart tab — lines grouped by restaurant, CTA to restaurant cart / checkout. */
export function CartHubScreen() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const { qty, subtotal } = useMemo(() => selectCartTotals(items), [items]);

  const byRestaurant = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const line of items) {
      const list = map.get(line.restaurantId) ?? [];
      list.push(line);
      map.set(line.restaurantId, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>Cart</Text>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="bag-outline" size={56} color={UE.textMuted} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>
            Add items from a restaurant to get started.
          </Text>
          <Pressable
            style={styles.browseBtn}
            onPress={() => router.navigate('/(tabs)' as never)}
          >
            <Text style={styles.browseBtnTxt}>Browse restaurants</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {byRestaurant.map(([restaurantId, lines]) => {
            const { qty: rQty, subtotal: rSub } = selectCartTotals(lines);
            const thumb = lines[0]?.image;
            return (
              <Pressable
                key={restaurantId}
                style={styles.card}
                onPress={() =>
                  router.push(
                    `/restaurant-menu/cart?restaurantId=${encodeURIComponent(restaurantId)}` as never,
                  )
                }
              >
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbPh]}>
                    <Ionicons
                      name="restaurant"
                      size={24}
                      color={UE.textMuted}
                    />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {lines[0]?.name ?? 'Restaurant order'}
                  </Text>
                  <Text style={styles.cardSub}>
                    {rQty} {rQty === 1 ? 'item' : 'items'} · ${rSub.toFixed(2)}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={22}
                  color={UE.textMuted}
                />
              </Pressable>
            );
          })}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalVal}>${subtotal.toFixed(2)}</Text>
          </View>
          <Text style={styles.hint}>
            {qty} items across {byRestaurant.length} bag(s)
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UE.bg },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: UE.text,
    paddingHorizontal: 16,
    marginBottom: 16,
    letterSpacing: -0.4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '900',
    color: UE.text,
  },
  emptySub: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: UE.textMuted,
    textAlign: 'center',
  },
  browseBtn: {
    marginTop: 24,
    backgroundColor: UE.blackBtn,
    paddingHorizontal: 24,
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseBtnTxt: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: UE.radiusXL,
    backgroundColor: UE.surface,
    borderWidth: 1,
    borderColor: UE.borderLight,
    marginBottom: 12,
    gap: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: UE.borderLight,
  },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: UE.text },
  cardSub: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: UE.textMuted,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: UE.border,
  },
  totalLabel: { fontSize: 17, fontWeight: '800', color: UE.text },
  totalVal: { fontSize: 17, fontWeight: '900', color: UE.text },
  hint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: UE.textMuted,
    textAlign: 'center',
  },
});
