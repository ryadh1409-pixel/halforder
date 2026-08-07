import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EMO_AI_PURPLE, EMO_AI_SURFACE } from '@/types/emoAi';
import type {
  EmoOrderAddressDraft,
  EmoOrderMealDraft,
  EmoOrderPricing,
  EmoOrderRestaurantOption,
} from '@/types/emoOrder';

type Props = {
  restaurant: EmoOrderRestaurantOption;
  meal: EmoOrderMealDraft;
  address: EmoOrderAddressDraft;
  pricing: EmoOrderPricing;
  paying: boolean;
  onPay: () => void;
};

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, accent && styles.rowAccent]}>{label}</Text>
      <Text style={[styles.rowValue, accent && styles.rowAccent]}>{value}</Text>
    </View>
  );
}

function EmoOrderSummaryCardInner({ restaurant, meal, address, pricing, paying, onPay }: Props) {
  const mealLabel = meal.notes
    ? `${meal.mealName} (${meal.notes})`
    : meal.mealName;

  return (
    <View style={styles.card}>
      {/* Restaurant */}
      <View style={styles.restaurantRow}>
        <View style={styles.restaurantIcon}>
          <Text style={styles.restaurantEmoji}>🍽</Text>
        </View>
        <View style={styles.restaurantInfo}>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          {restaurant.address ? (
            <Text style={styles.restaurantAddress} numberOfLines={1}>
              {restaurant.address.split(',').slice(0, 2).join(',')}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Meal */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Your Order</Text>
        <Text style={styles.mealName}>{mealLabel}</Text>
        {meal.quantity > 1 ? (
          <Text style={styles.mealMeta}>×{meal.quantity}</Text>
        ) : null}
      </View>

      <View style={styles.divider} />

      {/* Pricing breakdown */}
      <View style={styles.section}>
        <Row label="Meal (est.)" value={`~CA$${pricing.foodSubtotal.toFixed(2)}`} />
        <Row label="Delivery" value={`CA$${pricing.deliveryFee.toFixed(2)}`} />
        <Row label="Service fee" value={`CA$${pricing.serviceFee.toFixed(2)}`} />
        <Row
          label={`Tax (${(pricing.taxRate * 100).toFixed(0)}%)`}
          value={`CA$${pricing.hst.toFixed(2)}`}
        />
        <View style={styles.totalDivider} />
        <Row
          label="Est. Total"
          value={`~CA$${pricing.totalPaid.toFixed(2)}`}
          accent
        />
      </View>

      <View style={styles.divider} />

      {/* Delivery address */}
      <View style={styles.addressRow}>
        <Text style={styles.addressIcon}>📍</Text>
        <Text style={styles.addressText} numberOfLines={2}>
          {address.address}
        </Text>
      </View>

      {/* Pay button */}
      <Pressable
        style={[styles.payBtn, paying && styles.payBtnDisabled]}
        onPress={onPay}
        disabled={paying}
        accessibilityRole="button"
        accessibilityLabel={`Pay approximately CA$${pricing.totalPaid.toFixed(2)}`}
      >
        {paying ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Ionicons name="lock-closed" size={16} color="#FFF" />
            <Text style={styles.payBtnText}>
              {'Pay ~CA$'}{pricing.totalPaid.toFixed(2)}
            </Text>
          </>
        )}
      </Pressable>

      <Text style={styles.hint}>
        {'Meal price is an estimate. Your driver purchases the actual item at the restaurant\'s current price. Final charge may vary slightly. Secured by Stripe.'}
      </Text>
    </View>
  );
}

export const EmoOrderSummaryCard = memo(EmoOrderSummaryCardInner);

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    padding: 16,
    borderRadius: 20,
    backgroundColor: EMO_AI_SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.25)',
    gap: 0,
  },
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
  },
  restaurantIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.14)',
  },
  restaurantEmoji: { fontSize: 22 },
  restaurantInfo: { flex: 1 },
  restaurantName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  restaurantAddress: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 12,
  },
  totalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(168,85,247,0.3)',
    marginVertical: 8,
  },
  section: { gap: 4 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  mealName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  mealMeta: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  rowLabel: { fontSize: 14, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  rowValue: { fontSize: 14, color: '#FFFFFF', fontWeight: '700' },
  rowAccent: { color: EMO_AI_PURPLE, fontWeight: '900', fontSize: 16 },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  addressIcon: { fontSize: 15, marginTop: 1 },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
    lineHeight: 18,
  },
  payBtn: {
    marginTop: 16,
    height: 52,
    borderRadius: 14,
    backgroundColor: EMO_AI_PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
  hint: {
    marginTop: 10,
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 15,
    fontStyle: 'italic',
  },
});
