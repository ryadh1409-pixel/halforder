/**
 * Premium draggable tracking bottom sheet — presentation only.
 * Snap points via Reanimated + Gesture Handler (no new deps).
 */
import { UE } from '@/constants/uberEatsTheme';
import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type TrackingSheetSnap = 'peek' | 'mid' | 'full';

type Props = {
  children: React.ReactNode;
  /** When true, expand toward a taller sheet (completed orders). */
  preferFull?: boolean;
  onSnapChange?: (snap: TrackingSheetSnap) => void;
};

function snapsFor(windowH: number, sheetH: number, bottomPad: number) {
  const peekVisible = 228 + bottomPad;
  const midVisible = Math.round(windowH * 0.48);
  const fullVisible = Math.round(windowH * 0.88);
  return {
    peek: Math.max(0, sheetH - peekVisible),
    mid: Math.max(0, sheetH - midVisible),
    full: Math.max(0, sheetH - fullVisible),
  };
}

function nearestSnap(
  y: number,
  points: { peek: number; mid: number; full: number },
): TrackingSheetSnap {
  const entries: [TrackingSheetSnap, number][] = [
    ['peek', points.peek],
    ['mid', points.mid],
    ['full', points.full],
  ];
  let best: TrackingSheetSnap = 'mid';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const [name, value] of entries) {
    const d = Math.abs(y - value);
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

export function TrackingBottomSheet({ children, preferFull = false, onSnapChange }: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const bottomPad = Math.max(insets.bottom, 12);
  const sheetH = Math.round(windowH * 0.92);
  const points = useMemo(
    () => snapsFor(windowH, sheetH, bottomPad),
    [windowH, sheetH, bottomPad],
  );

  const translateY = useSharedValue(points.mid);
  const dragStart = useSharedValue(points.mid);

  const notifySnap = useCallback(
    (snap: TrackingSheetSnap) => {
      onSnapChange?.(snap);
    },
    [onSnapChange],
  );

  useEffect(() => {
    const target = preferFull ? points.full : points.mid;
    translateY.value = withSpring(target, { damping: 22, stiffness: 240 });
    notifySnap(preferFull ? 'full' : 'mid');
  }, [preferFull, points.full, points.mid, translateY, notifySnap]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .onStart(() => {
          dragStart.value = translateY.value;
        })
        .onUpdate((e) => {
          const next = dragStart.value + e.translationY;
          translateY.value = Math.min(points.peek, Math.max(points.full, next));
        })
        .onEnd((e) => {
          const projected = translateY.value + e.velocityY * 0.12;
          const snap = nearestSnap(projected, points);
          const target = points[snap];
          translateY.value = withSpring(target, { damping: 22, stiffness: 260 });
          runOnJS(notifySnap)(snap);
        }),
    [points, notifySnap, translateY, dragStart],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: sheetH,
          paddingBottom: bottomPad,
        },
        sheetStyle,
      ]}
      pointerEvents="box-none"
      accessibilityRole="summary"
      accessibilityLabel="Delivery details"
    >
      <GestureDetector gesture={pan}>
        <View
          style={styles.handleHit}
          accessibilityRole="adjustable"
          accessibilityLabel="Drag to resize delivery details"
        >
          <View style={styles.grabber} />
        </View>
      </GestureDetector>
      <View style={styles.body}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: UE.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: UE.border,
    borderBottomWidth: 0,
    shadowColor: UE.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
    overflow: 'hidden',
  },
  handleHit: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  grabber: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  body: { flex: 1 },
});
