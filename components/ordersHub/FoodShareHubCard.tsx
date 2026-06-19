import { FoodShareInviteButton } from '@/components/foodShare/FoodShareInviteButton';
import {
  HUB_STATUS_META,
  type FoodShareHubItem,
  type FoodShareHubStatus,
} from '@/lib/ordersHubStatus';
import { formatShareCurrency } from '@/lib/foodSharePricing';
import { USER_ROUTES } from '@/lib/navigationPaths';
import { ORDER_CHAT_TYPE } from '@/constants/orderChat';
import { orderRoomHref } from '@/services/orderChat';
import { formatFirestoreTime } from '@/lib/admin/orderHelpers';
import { confirmCancelWaitingShare } from '@/hooks/useFoodShareUx';
import {
  cancelFoodShareMatch,
  cancelWaitingFoodShare,
} from '@/services/foodShareMatchService';
import { FOOD_SHARE_ERRORS, foodShareErrorMessage } from '@/lib/foodShareUx';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showError, showSuccess } from '@/utils/toast';

const c = theme.colors;

function joinedLabel(ms: number | null): string {
  if (ms == null) return '—';
  return formatFirestoreTime(ms);
}

function ActionBtn({
  label,
  onPress,
  primary,
  danger,
  busy,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.actionBtn,
        primary && styles.actionBtnPrimary,
        danger && styles.actionBtnDanger,
        busy && styles.actionBtnBusy,
      ]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? (
        <ActivityIndicator color={primary ? '#FFF' : c.primary} size="small" />
      ) : (
        <Text
          style={[
            styles.actionBtnText,
            primary && styles.actionBtnTextPrimary,
            danger && styles.actionBtnTextDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function FoodShareHubCard({ item }: { item: FoodShareHubItem }) {
  const router = useRouter();
  const meta = HUB_STATUS_META[item.status];
  const [cancelling, setCancelling] = useState(false);
  const assignedDriverId = item.match?.driverId || item.match?.assignedDriverId || '';
  const canOpenDriverChat = !!assignedDriverId && !!(item.orderId || item.matchId);
  const driverChatOrderId = item.orderId || item.matchId || '';

  const openDetails = useCallback(() => {
    if (item.kind === 'waiting') {
      router.push(USER_ROUTES.foodShareHubWaiting(item.adminFoodShareId) as never);
      return;
    }
    if (item.matchId) {
      router.push(USER_ROUTES.foodShareHubMatch(item.matchId) as never);
    }
  }, [item, router]);

  const handleCancel = useCallback(async () => {
    const ok = await confirmCancelWaitingShare(item.foodName);
    if (!ok) return;
    setCancelling(true);
    try {
      await cancelWaitingFoodShare(item.adminFoodShareId);
      showSuccess('Request cancelled');
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.unableToJoin));
    } finally {
      setCancelling(false);
    }
  }, [item.adminFoodShareId, item.foodName]);

  const handleCancelMatch = useCallback(() => {
    if (!item.matchId || cancelling) return;
    const lifecycle = String(item.lifecycle ?? '').toUpperCase();
    const refundWarning =
      lifecycle === 'PAYMENT_CONFIRMED' || lifecycle === 'ORDER_PLACED'
        ? '\n\nThis share is already active. Refund policy applies before cancelling.'
        : '';

    Alert.alert(
      'Cancel Share',
      `Are you sure you want to cancel this food share?${refundWarning}`,
      [
        { text: 'Keep Share', style: 'cancel' },
        {
          text: 'Cancel Share',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setCancelling(true);
              try {
                const result = await cancelFoodShareMatch({
                  matchId: item.matchId!,
                  foodName: item.foodName,
                  adminFoodShareId: item.adminFoodShareId,
                });
                showSuccess(
                  result.refundAttempted
                    ? 'Share cancelled. Refund is processing.'
                    : 'Share cancelled',
                );
              } catch (e) {
                showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.cancelFailed));
              } finally {
                setCancelling(false);
              }
            })();
          },
        },
      ],
    );
  }, [cancelling, item.adminFoodShareId, item.foodName, item.lifecycle, item.matchId]);

  const renderActions = (status: FoodShareHubStatus) => {
    switch (status) {
      case 'waiting_partner':
        return (
          <View style={styles.actions}>
            <ActionBtn label="Reopen Waiting" primary onPress={() => router.push(USER_ROUTES.foodShareWaiting(item.adminFoodShareId) as never)} />
            {item.shareRaw ? (
              <FoodShareInviteButton
                adminFoodShareId={item.adminFoodShareId}
                shareRaw={item.shareRaw}
                foodName={item.foodName}
                restaurantName={item.restaurantName}
                sharedPrice={item.sharedPrice}
                deliveryShare={item.deliveryShare}
                totalPerUser={item.totalPerUser}
                pickupOrDelivery={item.pickupOrDelivery}
                variant="compact"
              />
            ) : null}
            <ActionBtn label="Cancel Share" danger busy={cancelling} onPress={() => void handleCancel()} />
          </View>
        );
      case 'match_found':
        return (
          <View style={styles.actions}>
            {item.matchId ? (
              <>
                <ActionBtn label="Pay Now" primary onPress={() => router.push(USER_ROUTES.foodSharePay(item.matchId!) as never)} />
                <ActionBtn label="Partner Chat" onPress={() => router.push(USER_ROUTES.foodShareChat(item.matchId!) as never)} />
                <ActionBtn label="View Match" onPress={() => router.push(USER_ROUTES.foodShareHubMatch(item.matchId!) as never)} />
                <ActionBtn label="Cancel Share" danger busy={cancelling} onPress={handleCancelMatch} />
              </>
            ) : null}
          </View>
        );
      case 'awaiting_payment':
        return item.matchId ? (
          <View style={styles.actions}>
            <ActionBtn label="Continue Payment" primary onPress={() => router.push(USER_ROUTES.foodSharePay(item.matchId!) as never)} />
            <ActionBtn label="Partner Chat" onPress={() => router.push(USER_ROUTES.foodShareChat(item.matchId!) as never)} />
            <ActionBtn label="Cancel Share" danger busy={cancelling} onPress={handleCancelMatch} />
          </View>
        ) : null;
      case 'active_chat':
        return item.matchId ? (
          <View style={styles.actions}>
            <ActionBtn label="Partner Chat" primary onPress={() => router.push(USER_ROUTES.foodShareChat(item.matchId!) as never)} />
            {canOpenDriverChat ? (
              <ActionBtn
                label="Driver Chat"
                onPress={() => router.push(orderRoomHref(driverChatOrderId, ORDER_CHAT_TYPE.CUSTOMER_DRIVER) as never)}
              />
            ) : null}
            <ActionBtn label="Cancel Share" danger busy={cancelling} onPress={handleCancelMatch} />
          </View>
        ) : null;
      case 'completed':
        return item.matchId ? (
          <View style={styles.actions}>
            <ActionBtn label="View Summary" onPress={() => router.push(USER_ROUTES.foodShareHubMatch(item.matchId!) as never)} />
          </View>
        ) : null;
      default:
        return null;
    }
  };

  return (
    <Pressable style={styles.card} onPress={openDetails}>
      <View style={styles.topRow}>
        {item.foodImageUrl ? (
          <Image source={{ uri: item.foodImageUrl }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Ionicons name="fast-food-outline" size={22} color="rgba(255,255,255,0.35)" />
          </View>
        )}
        <View style={styles.topCopy}>
          <Text style={styles.foodName} numberOfLines={2}>{item.foodName}</Text>
          <Text style={styles.restaurant} numberOfLines={1}>{item.restaurantName}</Text>
          <Text style={styles.joined}>Joined {joinedLabel(item.joinedAtMs)}</Text>
        </View>
        <View style={[styles.badge, { borderColor: `${meta.color}55` }]}>
          <Text style={styles.badgeEmoji}>{meta.emoji}</Text>
          <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <MetaChip icon="swap-horizontal-outline" label={item.pickupOrDelivery} />
        <MetaChip icon="cash-outline" label={formatShareCurrency(item.sharedPrice)} />
        <MetaChip icon="bicycle-outline" label={formatShareCurrency(item.deliveryShare)} />
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>
          {item.totalPaid != null ? 'Total paid' : 'Total per person'}
        </Text>
        <Text style={styles.totalValue}>
          {formatShareCurrency(item.totalPaid ?? item.totalPerUser)}
        </Text>
      </View>

      {item.countdownLabel ? (
        <View style={styles.countdown}>
          <Ionicons name="time-outline" size={14} color="#FBBF24" />
          <Text style={styles.countdownText}>{item.countdownLabel}</Text>
        </View>
      ) : null}

      {renderActions(item.status)}
    </Pressable>
  );
}

function MetaChip({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.chip}>
      <Ionicons name={icon} size={12} color="rgba(255,255,255,0.55)" />
      <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: '#1a2030',
  },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  topCopy: { flex: 1, minWidth: 0 },
  foodName: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  restaurant: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  joined: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
  },
  badge: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    maxWidth: 92,
  },
  badgeEmoji: { fontSize: 14 },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    maxWidth: 100,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  totalLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  totalValue: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  countdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(251,191,36,0.1)',
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FDE68A',
    flex: 1,
  },
  actions: { gap: 8, marginTop: 12 },
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  actionBtnPrimary: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  actionBtnDanger: {
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(248,113,113,0.08)',
  },
  actionBtnBusy: { opacity: 0.65 },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
  },
  actionBtnTextPrimary: { color: '#FFF' },
  actionBtnTextDanger: { color: '#FCA5A5' },
});
