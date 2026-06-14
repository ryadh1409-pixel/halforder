import { AdminFoodCardTile } from '../../../../components/admin/AdminFoodCardTile';
import { adminRoutes } from '../../../../constants/adminRoutes';
import { adminColors as COLORS } from '../../../../constants/adminTheme';
import {
  ADMIN_FOOD_CARD_SLOT_COUNT,
} from '../../../../constants/adminFoodCards';
import { auth } from '../../../../services/firebase';
import {
  subscribeAdminFoodCardWaitingQueues,
  type AdminFoodCardWaitingQueue,
} from '../../../../services/adminFoodCardDetail';
import {
  subscribeAllFoodShareInviteStats,
  type FoodShareInviteStats,
} from '../../../../services/foodShareInvite';
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
  const [waitingQueues, setWaitingQueues] = useState<
    Record<string, AdminFoodCardWaitingQueue>
  >({});
  const [inviteStats, setInviteStats] = useState<FoodShareInviteStats>({
    sent: 0,
    opened: 0,
    converted: 0,
    conversionRate: 0,
  });

  useEffect(() => {
    const unsub = subscribeAdminFoodCardSlots((rows) => {
      console.log('[ADMIN CARDS]', rows);
      setRemote(rows);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeAdminFoodCardWaitingQueues(setWaitingQueues);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeAllFoodShareInviteStats(setInviteStats);
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
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Food share invites</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{inviteStats.sent}</Text>
            <Text style={styles.statLabel}>Sent</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{inviteStats.opened}</Text>
            <Text style={styles.statLabel}>Opened</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{inviteStats.converted}</Text>
            <Text style={styles.statLabel}>Converted</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>
              {inviteStats.sent > 0 ? `${inviteStats.conversionRate}%` : '—'}
            </Text>
            <Text style={styles.statLabel}>Rate</Text>
          </View>
        </View>
      </View>
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
          const waiting = waitingQueues[slot.docId];
          const waitingUserName = waiting?.waitingUserFirstName ?? null;
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
                waitingUserName={waitingUserName}
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
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 14,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCell: { flex: 1, alignItems: 'center' },
  statValue: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
  },
  footerId: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    marginTop: 8,
  },
});

export default AdminCardsDashboard;
