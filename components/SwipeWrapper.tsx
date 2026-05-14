import React from 'react';
import { StyleSheet, View } from 'react-native';

type SwipeWrapperProps = {
  children: React.ReactNode;
  /** Reserved for layout parity with tab order; tab changes are tab-bar only (no swipe navigation). */
  currentIndex: number;
};

/**
 * Layout wrapper for main tab screens. Tab changes must come from the tab bar only —
 * swipe-driven `router.push` was removed to avoid spurious sequential tab navigation
 * (e.g. explore → ai → orders on mount when all tabs mounted).
 */
export default function SwipeWrapper({ children }: SwipeWrapperProps) {
  return <View style={styles.fill}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
