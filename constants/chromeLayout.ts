import { UE } from '@/constants/uberEatsTheme';

/** Floating CustomTabBar geometry — keep in sync with `components/CustomTabBar.tsx`. */
export const FLOATING_TAB_BAR = {
  height: UE.tabBarHeight,
  /** Matches CustomTabBar `paddingVertical`. */
  innerVerticalPadding: 10,
  /** Matches CustomTabBar `bottom: Math.max(14, insets.bottom + 4)`. */
  minBottomGap: 14,
  bottomInsetExtra: 4,
  /** Extra scroll breathing room above the bar. */
  contentExtra: 20,
} as const;

export function floatingTabBarBottomOffset(bottomInset: number): number {
  return Math.max(
    FLOATING_TAB_BAR.minBottomGap,
    bottomInset + FLOATING_TAB_BAR.bottomInsetExtra,
  );
}

/** Total vertical space occupied by the floating tab bar (bar + gap). */
export function floatingTabBarOccupiedHeight(bottomInset: number): number {
  return (
    FLOATING_TAB_BAR.height +
    FLOATING_TAB_BAR.innerVerticalPadding +
    floatingTabBarBottomOffset(bottomInset)
  );
}

/**
 * Bottom padding for ScrollView `contentContainerStyle` / screen footers
 * so the last control clears the floating tab bar (Uber-style).
 */
export function floatingTabBarContentPadding(
  bottomInset: number,
  extra: number = FLOATING_TAB_BAR.contentExtra,
): number {
  return floatingTabBarOccupiedHeight(bottomInset) + extra;
}
