import {
  floatingTabBarContentPadding,
  floatingTabBarOccupiedHeight,
} from '@/constants/chromeLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Shared bottom chrome padding for screens above the floating tab bar. */
export function useChromeBottomPadding(extra?: number): number {
  const insets = useSafeAreaInsets();
  return floatingTabBarContentPadding(insets.bottom, extra);
}

export function useChromeOccupiedHeight(): number {
  const insets = useSafeAreaInsets();
  return floatingTabBarOccupiedHeight(insets.bottom);
}
