import { Platform, type PressableProps } from 'react-native';
import { RP } from '@/constants/restaurantPremiumTheme';

/**
 * On web, `accessibilityRole="button"` maps Pressable to `<button>`.
 * Nested pressables (e.g. footer CTA over scroll rows) break clicks — use `none` instead.
 */
export const checkoutPressableProps: Pick<PressableProps, 'accessibilityRole'> =
  Platform.OS === 'web' ? { accessibilityRole: 'none' } : { accessibilityRole: 'button' };

/** Checkout-specific tokens layered on RP (Uber Eats–style light chrome). */
export const CK = {
  ...RP,
  headerHairline: '#EAEAEC',
  mapRadius: 20,
  cardShadowOpacity: 0.12,
  savingsGoldFrom: '#F5E6B8',
  savingsGoldMid: '#E8CF7A',
  savingsGoldText: '#3D2F0B',
  nextBtnRadius: 16,
};
