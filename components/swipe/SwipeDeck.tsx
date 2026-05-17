import { SwipeFoodCard } from '@/components/swipe/SwipeFoodCard';
import type { SwipeFoodCard as CardType } from '@/types/swipe';
import React, { memo, useEffect } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W } = Dimensions.get('window');
const SWIPE_OUT = SCREEN_W * 1.35;
const SWIPE_TRIGGER = SCREEN_W * 0.22;
const REJECT_MS = 165;

type Props = {
  current: CardType | undefined;
  next: CardType | undefined;
  cardMaxHeight: number;
  onPass: () => void;
  onLike: () => void;
};

function SwipeDeckInner({
  current,
  next,
  cardMaxHeight,
  onPass,
  onLike,
}: Props) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateX.value = 0;
    translateY.value = 0;
  }, [current?.id, translateX, translateY]);

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-20, 20])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.25;
    })
    .onEnd(() => {
      if (translateX.value > SWIPE_TRIGGER) {
        translateX.value = 0;
        translateY.value = 0;
        runOnJS(onLike)();
      } else if (translateX.value < -SWIPE_TRIGGER) {
        translateX.value = withTiming(
          -SWIPE_OUT,
          { duration: REJECT_MS },
          (done) => {
            if (done) runOnJS(onPass)();
          },
        );
        translateY.value = withTiming(0, { duration: REJECT_MS });
      } else {
        translateX.value = withSpring(0, { damping: 20, stiffness: 260 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 260 });
      }
    });

  const topStyle = useAnimatedStyle(() => {
    const rot = interpolate(
      translateX.value,
      [-SCREEN_W * 0.4, SCREEN_W * 0.4],
      [-12, 12],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rot}deg` },
      ],
    };
  });

  const likeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_TRIGGER * 0.85],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const nopeStamp = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_TRIGGER * 0.85, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (!current) {
    return (
      <View style={[styles.empty, { maxHeight: cardMaxHeight }]}>
        <Text style={styles.emptyTitle}>No meals to swipe</Text>
        <Text style={styles.emptySub}>
          Check back soon — new split orders drop all day in Toronto.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.deck, { maxHeight: cardMaxHeight }]}>
      {next ? (
        <View
          style={[styles.shell, styles.behind, { maxHeight: cardMaxHeight }]}
        >
          <SwipeFoodCard card={next} />
        </View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.shell,
            styles.front,
            { maxHeight: cardMaxHeight },
            topStyle,
          ]}
        >
          <SwipeFoodCard card={current} />
          <Animated.View
            style={[styles.stamp, styles.stampLike, likeStamp]}
            pointerEvents="none"
          >
            <Text style={styles.stampLikeTxt}>SPLIT</Text>
          </Animated.View>
          <Animated.View
            style={[styles.stamp, styles.stampNope, nopeStamp]}
            pointerEvents="none"
          >
            <Text style={styles.stampNopeTxt}>PASS</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export const SwipeDeck = memo(SwipeDeckInner);

const styles = StyleSheet.create({
  deck: { flex: 1, marginHorizontal: 16, justifyContent: 'center' },
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  behind: { transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.88 },
  front: { zIndex: 2 },
  stamp: {
    position: 'absolute',
    top: 48,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 3,
    borderRadius: 10,
    zIndex: 10,
  },
  stampLike: {
    right: 24,
    borderColor: '#06C167',
    transform: [{ rotate: '12deg' }],
  },
  stampNope: {
    left: 24,
    borderColor: '#FF4458',
    transform: [{ rotate: '-12deg' }],
  },
  stampLikeTxt: {
    fontSize: 28,
    fontWeight: '900',
    color: '#06C167',
    letterSpacing: 2,
  },
  stampNopeTxt: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FF4458',
    letterSpacing: 2,
  },
  empty: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 22,
  },
});
