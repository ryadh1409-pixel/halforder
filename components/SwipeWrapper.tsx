import { useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

/** Tab segment names in left-to-right order (must match `app/(tabs)/` screens). */
const TAB_ORDER = ['index', 'ai', 'orders', 'trucks', 'profile'] as const;

function hrefForTab(name: string) {
  return `/(tabs)/${name}`;
}

type SwipeWrapperProps = {
  children: React.ReactNode;
  /** 0 = Home … 4 = Profile */
  currentIndex: number;
};

/**
 * Horizontal swipe between main tabs. Uses `router.push` only (no `replace`).
 * `activeOffsetX` / `failOffsetY` reduce conflict with vertical `ScrollView`.
 */
export default function SwipeWrapper({ children, currentIndex }: SwipeWrapperProps) {
  const router = useRouter();

  const goToIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= TAB_ORDER.length) return;
      const name = TAB_ORDER[nextIndex];
      router.push(hrefForTab(name) as never);
    },
    [router],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-28, 28])
        .failOffsetY([-14, 14])
        .onEnd((e) => {
          const threshold = 56;
          if (e.translationX < -threshold && currentIndex < TAB_ORDER.length - 1) {
            runOnJS(goToIndex)(currentIndex + 1);
          } else if (e.translationX > threshold && currentIndex > 0) {
            runOnJS(goToIndex)(currentIndex - 1);
          }
        }),
    [currentIndex, goToIndex],
  );

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.fill}>{children}</View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
