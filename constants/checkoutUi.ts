import { Platform, type PressableProps } from 'react-native';
import { RP } from '@/constants/restaurantPremiumTheme';

/**
 * On web, `accessibilityRole="button"` maps Pressable to `<button>`.
 * Nested pressables (e.g. footer CTA over scroll rows) break clicks — use `none` instead.
 */
export const checkoutPressableProps: Pick<PressableProps, 'accessibilityRole'> =
  Platform.OS === 'web' ? { accessibilityRole: 'none' } : { accessibilityRole: 'button' };

/** Checkout-specific tokens layered on RP (Orders Hub dark chrome). */
export const CK = {
  ...RP,
  headerHairline: 'rgba(255,255,255,0.08)',
  mapRadius: 20,
  cardShadowOpacity: 0.28,
  savingsGoldFrom: 'rgba(245,158,11,0.14)',
  savingsGoldMid: '#F59E0B',
  savingsGoldText: '#F59E0B',
  nextBtnRadius: 16,
};
