import { sendFoodShareInvite } from '@/services/foodShareInvite';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showError, showSuccess } from '@/utils/toast';
import { foodShareErrorMessage } from '@/lib/foodShareUx';
import { FOOD_SHARE_ERRORS } from '@/lib/foodShareUx';

export type FoodShareInviteButtonProps = {
  adminFoodShareId: string;
  shareRaw?: Record<string, unknown>;
  foodName?: string;
  restaurantName?: string;
  sharedPrice?: number;
  deliveryShare?: number;
  totalPerUser?: number;
  pickupOrDelivery?: string;
  dateLabel?: string;
  timeLabel?: string;
  variant?: 'card' | 'compact';
};

export function FoodShareInviteButton({
  adminFoodShareId,
  shareRaw,
  foodName,
  restaurantName,
  sharedPrice,
  deliveryShare,
  totalPerUser,
  pickupOrDelivery,
  dateLabel,
  timeLabel,
  variant = 'card',
}: FoodShareInviteButtonProps) {
  const [busy, setBusy] = useState(false);

  const handleInvite = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await sendFoodShareInvite({
        adminFoodShareId,
        shareRaw,
        foodName,
        restaurantName,
        sharedPrice,
        deliveryShare,
        totalPerUser,
        pickupOrDelivery,
        dateLabel,
        timeLabel,
      });
      showSuccess(
        result.channel === 'whatsapp'
          ? 'Invite sent via WhatsApp'
          : 'Invite shared',
      );
    } catch (e) {
      showError(foodShareErrorMessage(e, FOOD_SHARE_ERRORS.unableToJoin));
    } finally {
      setBusy(false);
    }
  }, [
    adminFoodShareId,
    busy,
    dateLabel,
    deliveryShare,
    foodName,
    pickupOrDelivery,
    restaurantName,
    shareRaw,
    sharedPrice,
    timeLabel,
    totalPerUser,
  ]);

  if (variant === 'compact') {
    return (
      <Pressable
        style={[styles.compactBtn, busy && styles.btnDisabled]}
        onPress={() => void handleInvite()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#25D366" size="small" />
        ) : (
          <>
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            <Text style={styles.compactText}>Invite Friend</Text>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
        </View>
        <View style={styles.copyCol}>
          <Text style={styles.title}>Invite a Friend</Text>
          <Text style={styles.subtitle}>Share Food Together</Text>
        </View>
      </View>
      <Text style={styles.body}>
        Know someone who would split this meal? Send them a professional invite on
        WhatsApp with pricing and a direct link to join.
      </Text>
      <Pressable
        style={[styles.cta, busy && styles.btnDisabled]}
        onPress={() => void handleInvite()}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
            <Text style={styles.ctaText}>Invite Friend</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const c = theme.colors;

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    backgroundColor: 'rgba(37, 211, 102, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.22)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(37, 211, 102, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyCol: { flex: 1 },
  title: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    color: '#B7BDC9',
    marginBottom: 14,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: 14,
    paddingVertical: 14,
  },
  ctaText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(37, 211, 102, 0.35)',
    backgroundColor: 'rgba(37, 211, 102, 0.1)',
  },
  compactText: { color: '#86EFAC', fontSize: 14, fontWeight: '800' },
  btnDisabled: { opacity: 0.65 },
});
