import { AdminFoodCardTile } from '../../../../components/admin/AdminFoodCardTile';
import { adminRoutes } from '../../../../constants/adminRoutes';
import { adminColors as COLORS } from '../../../../constants/adminTheme';
import {
  ADMIN_FOOD_CARD_SLOT_COUNT,
} from '../../../../constants/adminFoodCards';
import { auth } from '../../../../services/firebase';
import {
  subscribeAdminFoodCardSlots,
  type AdminFoodCardSlot,
} from '../../../../services/adminFoodCardSlots';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

const COL_GAP = 12;
const ROW_HEIGHT = 220;

export function AdminCardsDashboard() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const horizontalPad = 16;
  const cellW = (winW - horizontalPad * 2 - COL_GAP) / 2;

  const [remote, setRemote] = useState<AdminFoodCardSlot[] | null>(null);

  useEffect(() => {
    const unsub = subscribeAdminFoodCardSlots((rows) => {
      console.log('[ADMIN CARDS]', rows);
      setRemote(rows);
    });
    return unsub;
  }, []);

  const openDetail = (docId: string) => {
    const href = adminRoutes.foodCard(docId);
    console.log('[ADMIN CARDS] navigate', href);
    router.push(href as never);
  };

  const listMinHeight = useMemo(() => {
    if (!remote?.length) return ROW_HEIGHT;
    return Math.ceil(remote.length / 2) * ROW_HEIGHT;
  }, [remote?.length]);

  if (!remote) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading food cards…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.headTitle}>
        Food cards ({ADMIN_FOOD_CARD_SLOT_COUNT} slots)
      </Text>
      <Text style={styles.headSub}>
        Tap any card to open full details, edit, or delete.
      </Text>
      <FlatList
        data={remote}
        keyExtractor={(item) => item.docId}
        numColumns={2}
        scrollEnabled={false}
        style={{ minHeight: listMinHeight }}
        columnWrapperStyle={{ gap: COL_GAP, marginBottom: COL_GAP }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: slot }) => {
          const configured =
            slot.title.trim().length > 0 || slot.image.trim().length > 0;
          const priceLabel =
            slot.price > 0 ? `$${slot.price.toFixed(2)}` : 'Not set';
          const sharingPriceLabel =
            slot.sharingPrice > 0
              ? `Share $${slot.sharingPrice.toFixed(2)}`
              : undefined;
          return (
            <View style={{ width: cellW }}>
              <AdminFoodCardTile
                cardId={slot.docId}
                title={slot.title || `Slot ${slot.docId}`}
                restaurantName={slot.restaurantName}
                imageUri={slot.image}
                priceLabel={priceLabel}
                sharingPriceLabel={sharingPriceLabel}
                active={slot.active}
                configured={configured}
                onPress={() => openDetail(slot.docId)}
              />
            </View>
          );
        }}
      />
      <Text style={styles.footerId}>
        Signed in: {auth.currentUser?.uid ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
  center: { padding: 24, alignItems: 'center' },
  loadingText: { marginTop: 10, color: COLORS.textMuted },
  headTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  headSub: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  footerId: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 8,
  },
});

export default AdminCardsDashboard;
