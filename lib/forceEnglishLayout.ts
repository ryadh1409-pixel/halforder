import { I18nManager, Platform } from 'react-native';

let applied = false;

/**
 * Forces LTR layout and disables RTL mirroring so device Arabic locale
 * does not flip the HalfOrder UI or keyboard direction.
 */
export function forceEnglishLayout(): void {
  if (applied) return;
  applied = true;

  if (I18nManager.isRTL) {
    I18nManager.allowRTL(false);
    I18nManager.forceRTL(false);
    if (Platform.OS === 'android') {
      // Native reload may be required on some Android builds; Expo dev client picks this up on restart.
    }
  } else {
    I18nManager.allowRTL(false);
    I18nManager.forceRTL(false);
  }
}
