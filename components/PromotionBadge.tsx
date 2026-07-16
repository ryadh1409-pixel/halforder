import {
  parsePromotionBadge,
  promotionBadgeColor,
  promotionBadgeLabel,
  type PromotionBadgeValue,
} from '@/lib/promotionBadge';
import React, { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { platformElevation } from '@/utils/platformElevation';

type Props = {
  /** Stored enum value, or a display label containing the badge text. */
  value?: PromotionBadgeValue | string | null;
  style?: StyleProp<ViewStyle>;
};

function resolveValue(
  value: Props['value'],
): Exclude<PromotionBadgeValue, 'none'> | null {
  if (value == null || value === '' || value === 'none') return null;
  if (value === 'most_ordered' || value === 'great_price') return value;
  const parsed = parsePromotionBadge(value);
  if (parsed !== 'none') return parsed;
  const lower = String(value).toLowerCase();
  if (lower.includes('most ordered')) return 'most_ordered';
  if (lower.includes('great price')) return 'great_price';
  return null;
}

function PromotionBadgeInner({ value, style }: Props) {
  const badge = resolveValue(value);
  if (!badge) return null;
  const label = promotionBadgeLabel(badge);
  const bg = promotionBadgeColor(badge);
  if (!label || !bg) return null;

  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export const PromotionBadge = memo(PromotionBadgeInner);

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'flex-start',
    ...platformElevation({
      web: '0px 4px 12px rgba(0, 0, 0, 0.28)',
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.28,
        shadowOffset: { width: 0, height: 3 },
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  text: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
