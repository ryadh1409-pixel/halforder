import { Image } from 'expo-image';
import React, { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import type { EmoCompanionSnapshot, EmoEmotion } from './emoAiCompanionTypes';
import { randBetween } from './emoAiEmotionEngine';

const HERO = require('../../../assets/emo-ai/chat-header.png');

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedPath = Animated.createAnimatedComponent(Path);

type Props = EmoCompanionSnapshot & {
  alive: boolean;
  streamingTick?: number;
};

function TypingDotsOverlay() {
  const a = useSharedValue(0);
  useEffect(() => {
    a.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
  }, [a]);
  const d0 = useAnimatedStyle(() => ({
    opacity: interpolate(a.value, [0, 0.33, 0.66], [0.3, 1, 0.3], Extrapolation.CLAMP),
  }));
  const d1 = useAnimatedStyle(() => ({
    opacity: interpolate(a.value, [0.2, 0.5, 0.8], [0.3, 1, 0.3], Extrapolation.CLAMP),
  }));
  const d2 = useAnimatedStyle(() => ({
    opacity: interpolate(a.value, [0.4, 0.7, 1], [0.3, 1, 0.3], Extrapolation.CLAMP),
  }));
  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, d0]} />
      <Animated.View style={[styles.dot, d1]} />
      <Animated.View style={[styles.dot, d2]} />
    </View>
  );
}

function FaceHud({
  emotion,
  heartEyes,
  blink,
  lookX,
  lookY,
  mouth,
  thinking,
}: {
  emotion: EmoEmotion;
  heartEyes: boolean;
  blink: SharedValue<number>;
  lookX: SharedValue<number>;
  lookY: SharedValue<number>;
  mouth: SharedValue<number>;
  thinking: boolean;
}) {
  const gazeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: lookX.value * 3.2 },
      { translateY: lookY.value * 2.4 },
    ],
  }));

  const leftLid = useAnimatedProps(() => {
    const open = 1 - blink.value;
    return { ry: Math.max(0.8, 5.4 * open) };
  });
  const rightLid = useAnimatedProps(() => {
    const open = 1 - blink.value;
    return { ry: Math.max(0.8, 5.4 * open) };
  });

  const mouthProps = useAnimatedProps(() => {
    const o = mouth.value;
    if (emotion === 'funny' || emotion === 'happy' || emotion === 'excited') {
      return { d: `M28,44 Q35,${48 + o * 6} 42,44` };
    }
    if (emotion === 'sad' || emotion === 'lonely') {
      return { d: `M29,48 Q35,${44 - o} 41,48` };
    }
    if (emotion === 'surprised') {
      const r = 2 + o * 3;
      return { d: `M35,${46 - r} a${r},${r} 0 1,0 0.01,0` };
    }
    const h = 1.2 + o * 5;
    return { d: `M32,${46 - h / 2} Q35,${46 + h / 2} 38,${46 - h / 2}` };
  });

  const arcHappy =
    emotion === 'happy' ||
    emotion === 'funny' ||
    emotion === 'excited' ||
    emotion === 'caring';

  return (
    <Animated.View style={[styles.faceHud, gazeStyle]} pointerEvents="none">
      <Svg width={70} height={58} viewBox="0 0 70 58">
        <Rect x={8} y={10} width={54} height={40} rx={12} fill="#0A0A0C" opacity={0.55} />
        {heartEyes ? (
          <>
            <Path
              d="M20,28 c0,-5 7,-5 7,0 c0,5 -3.5,8 -7,11 c-3.5,-3 -7,-6 -7,-11 c0,-5 7,-5 7,0"
              fill="#E879F9"
            />
            <Path
              d="M46,28 c0,-5 7,-5 7,0 c0,5 -3.5,8 -7,11 c-3.5,-3 -7,-6 -7,-11 c0,-5 7,-5 7,0"
              fill="#E879F9"
            />
          </>
        ) : arcHappy ? (
          <>
            <Path
              d="M15,32 Q23,25 31,32"
              stroke="#C084FC"
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M39,32 Q47,25 55,32"
              stroke="#C084FC"
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : emotion === 'angry' ? (
          <>
            <Path d="M16,24 L30,28" stroke="#A855F7" strokeWidth={2.2} strokeLinecap="round" />
            <Path d="M40,28 L54,24" stroke="#A855F7" strokeWidth={2.2} strokeLinecap="round" />
            <AnimatedEllipse animatedProps={leftLid} cx={23} cy={33} rx={5} fill="#C084FC" />
            <AnimatedEllipse animatedProps={rightLid} cx={47} cy={33} rx={5} fill="#C084FC" />
          </>
        ) : emotion === 'sad' || emotion === 'lonely' ? (
          <>
            <Path
              d="M15,28 Q23,35 31,28"
              stroke="#A78BFA"
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            />
            <Path
              d="M39,28 Q47,35 55,28"
              stroke="#A78BFA"
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
            />
          </>
        ) : emotion === 'sleepy' ? (
          <>
            <Path d="M16,32 Q23,35 30,32" stroke="#A78BFA" strokeWidth={2.2} fill="none" />
            <Path d="M40,32 Q47,35 54,32" stroke="#A78BFA" strokeWidth={2.2} fill="none" />
          </>
        ) : (
          <>
            <AnimatedEllipse animatedProps={leftLid} cx={23} cy={30} rx={5.5} fill="#C084FC" />
            <AnimatedEllipse animatedProps={rightLid} cx={47} cy={30} rx={5.5} fill="#C084FC" />
            {emotion === 'thinking' ? (
              <Circle cx={50} cy={18} r={2.2} fill="#E9D5FF" />
            ) : null}
          </>
        )}
        <Ellipse cx={18} cy={40} rx={4} ry={2.2} fill="#F9A8D4" opacity={0.45} />
        <Ellipse cx={52} cy={40} rx={4} ry={2.2} fill="#F9A8D4" opacity={0.45} />
        <AnimatedPath
          animatedProps={mouthProps}
          stroke="#E9D5FF"
          fill="none"
          strokeLinecap="round"
          strokeWidth={2}
        />
      </Svg>
      {thinking ? <TypingDotsOverlay /> : null}
    </Animated.View>
  );
}

function FoodProp({
  food,
  offer,
  eating,
  hand,
}: {
  food: EmoCompanionSnapshot['food'];
  offer: boolean;
  eating: boolean;
  hand: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const lift = eating ? -10 - hand.value * 14 : offer ? -6 : 0;
    const rot = eating ? -18 - hand.value * 12 : offer ? -8 : 0;
    const show = offer || eating ? 1 : 0;
    return {
      transform: [
        { translateY: lift },
        { translateX: offer ? 8 : 0 },
        { rotate: `${rot}deg` },
        { scale: offer || eating ? 1.08 : 0.92 },
      ],
      opacity: show,
    };
  });

  const emoji =
    food === 'burger'
      ? '🍔'
      : food === 'coffee'
        ? '☕'
        : food === 'bubbleTea'
          ? '🧋'
          : food === 'noodles'
            ? '🍜'
            : '🍕';

  return (
    <Animated.View style={[styles.foodProp, style]} pointerEvents="none">
      <Text style={styles.foodEmoji}>{emoji}</Text>
    </Animated.View>
  );
}

function CatLayer({
  closer,
  sleeping,
  lookAtEmo,
  alive,
  reachPizza,
}: {
  closer: boolean;
  sleeping: boolean;
  lookAtEmo: boolean;
  alive: boolean;
  reachPizza: boolean;
}) {
  const ear = useSharedValue(0);
  const tail = useSharedValue(0);
  const blink = useSharedValue(0);
  const body = useSharedValue(0);
  const reach = useSharedValue(0);

  useEffect(() => {
    if (!alive) return;
    ear.value = withRepeat(
      withTiming(1, { duration: randBetween(900, 1400), easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    tail.value = withRepeat(
      withTiming(1, { duration: randBetween(1200, 1800), easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    body.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    let cancelled = false;
    const blinkLoop = () => {
      if (cancelled || sleeping) return;
      blink.value = withSequence(
        withTiming(1, { duration: 90 }),
        withTiming(0, { duration: 110 }),
      );
      setTimeout(blinkLoop, randBetween(1800, 4200));
    };
    const t = setTimeout(blinkLoop, randBetween(800, 1600));
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [alive, sleeping, ear, tail, blink, body]);

  useEffect(() => {
    reach.value = withTiming(reachPizza ? 1 : 0, { duration: 420 });
  }, [reachPizza, reach]);

  const wrap = useAnimatedStyle(() => ({
    transform: [
      { translateX: (closer ? -14 : 0) + interpolate(reach.value, [0, 1], [0, -8]) },
      { translateY: sleeping ? 6 : interpolate(body.value, [0, 1], [0, -2]) },
      { scale: closer ? 1.04 : 1 },
    ],
  }));

  const earL = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(ear.value, [0, 1], [-8, 10])}deg` }],
  }));
  const earR = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(ear.value, [0, 1], [8, -10])}deg` }],
  }));
  const tailStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(tail.value, [0, 1], [-22, 26])}deg` }],
  }));
  const eyeStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleY: sleeping ? 0.12 : 1 - blink.value * 0.92 },
      { translateX: lookAtEmo ? -3 : 0 },
    ],
  }));

  return (
    <Animated.View style={[styles.catWrap, wrap]} pointerEvents="none">
      <Animated.View style={[styles.catEar, { left: 18 }, earL]} />
      <Animated.View style={[styles.catEar, styles.catEarR, { left: 48 }, earR]} />
      <Animated.View style={[styles.catEye, { left: 30 }, eyeStyle]} />
      <Animated.View style={[styles.catEye, { left: 48 }, eyeStyle]} />
      <Animated.View style={[styles.catTail, tailStyle]} />
      {sleeping ? <Text style={styles.zzz}>z</Text> : null}
      {closer && !sleeping ? <Text style={styles.purr}>♡</Text> : null}
    </Animated.View>
  );
}

function EmoAiLiveCompanionInner({
  alive,
  phase,
  emotion,
  food,
  idleAction,
  lookAtMessage,
  catCloser,
  catSleeping,
  offerFood,
  calmLights,
  heartEyes,
  streamingTick = 0,
}: Props) {
  const breath = useSharedValue(0);
  const sway = useSharedValue(0);
  const head = useSharedValue(0);
  const hair = useSharedValue(0);
  const hoodie = useSharedValue(0);
  const phones = useSharedValue(0);
  const blink = useSharedValue(0);
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const mouth = useSharedValue(0);
  const hand = useSharedValue(0);
  const jump = useSharedValue(0);
  const sceneDim = useSharedValue(0);

  useEffect(() => {
    sceneDim.value = withTiming(calmLights ? 1 : 0, { duration: 700 });
  }, [calmLights, sceneDim]);

  useEffect(() => {
    if (!alive) {
      breath.value = 0;
      sway.value = 0;
      return;
    }
    const slow = emotion === 'sad' || emotion === 'sleepy' || emotion === 'lonely';
    const fast = emotion === 'excited' || emotion === 'funny' || emotion === 'happy';
    breath.value = withRepeat(
      withTiming(1, {
        duration: slow ? 3400 : fast ? 2000 : 2600,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    sway.value = withRepeat(
      withTiming(1, {
        duration: slow ? 4200 : fast ? 2400 : 3200,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
    hair.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    hoodie.value = withRepeat(
      withTiming(1, { duration: 2900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    phones.value = withRepeat(
      withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [alive, emotion, breath, sway, hair, hoodie, phones]);

  useEffect(() => {
    if (!alive) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const speed = emotion === 'excited' || emotion === 'funny' ? 0.7 : 1;
      blink.value = withSequence(
        withTiming(1, { duration: 70 * speed }),
        withTiming(0, { duration: 90 * speed }),
      );
      setTimeout(run, randBetween(1600, 4800) * speed);
    };
    const t = setTimeout(run, randBetween(600, 1400));
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [alive, emotion, blink]);

  useEffect(() => {
    if (!alive) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (lookAtMessage) {
        lookX.value = withSpring(0.85, { damping: 14, stiffness: 120 });
        lookY.value = withSpring(0.55, { damping: 14, stiffness: 120 });
        head.value = withSpring(6, { damping: 16, stiffness: 100 });
      } else if (emotion === 'embarrassed') {
        lookX.value = withSpring(-0.9, { damping: 12 });
        lookY.value = withSpring(0.3, { damping: 12 });
        head.value = withSpring(-8, { damping: 14 });
      } else if (emotion === 'thinking') {
        lookX.value = withSpring(0.2, { damping: 14 });
        lookY.value = withSpring(-0.85, { damping: 14 });
        head.value = withSpring(8, { damping: 14 });
      } else if (emotion === 'sad' || emotion === 'lonely') {
        lookY.value = withSpring(0.7, { damping: 16 });
        head.value = withSpring(10, { damping: 16 });
        lookX.value = withSpring(0, { damping: 16 });
      } else {
        const tx = randBetween(-1, 1);
        const ty = randBetween(-0.6, 0.6);
        lookX.value = withTiming(tx, { duration: 700 });
        lookY.value = withTiming(ty, { duration: 700 });
        head.value = withTiming(tx * 5, { duration: 800 });
      }
      setTimeout(run, lookAtMessage ? 900 : randBetween(2200, 5200));
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [alive, lookAtMessage, emotion, lookX, lookY, head]);

  useEffect(() => {
    if (!alive) {
      mouth.value = 0;
      return;
    }
    if (phase === 'speaking') {
      mouth.value = withRepeat(
        withTiming(1, { duration: 140, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      );
      hand.value = withRepeat(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    } else if (phase === 'eating') {
      mouth.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 160 }),
          withTiming(0.3, { duration: 180 }),
          withTiming(0.8, { duration: 140 }),
          withTiming(0, { duration: 220 }),
          withDelay(200, withTiming(0, { duration: 1 })),
        ),
        -1,
        false,
      );
      hand.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(0.2, { duration: 240 }),
          withDelay(180, withTiming(0.2, { duration: 1 })),
        ),
        -1,
        false,
      );
    } else if (phase === 'thinking') {
      mouth.value = withTiming(0.15, { duration: 200 });
      hand.value = withTiming(0, { duration: 200 });
    } else if (idleAction === 'drinkCoffee') {
      hand.value = withRepeat(withTiming(1, { duration: 600 }), 4, true);
      mouth.value = withRepeat(withTiming(0.6, { duration: 300 }), 6, true);
    } else if (idleAction === 'wave') {
      hand.value = withRepeat(withTiming(1, { duration: 280 }), 6, true);
      mouth.value = withTiming(0.4, { duration: 200 });
    } else if (idleAction === 'yawn' || emotion === 'sleepy') {
      mouth.value = withSequence(
        withTiming(1, { duration: 400 }),
        withDelay(500, withTiming(0, { duration: 350 })),
      );
    } else if (emotion === 'funny') {
      mouth.value = withRepeat(withTiming(1, { duration: 160 }), 8, true);
      blink.value = withTiming(1, { duration: 120 });
    } else {
      mouth.value = withTiming(0.2, { duration: 250 });
      hand.value = withTiming(0, { duration: 250 });
    }
  }, [alive, phase, idleAction, emotion, mouth, hand, blink, streamingTick]);

  useEffect(() => {
    if (emotion === 'excited' || idleAction === 'stretch') {
      jump.value = withSequence(
        withSpring(-8, { damping: 8, stiffness: 180 }),
        withSpring(0, { damping: 10, stiffness: 160 }),
      );
    }
  }, [emotion, idleAction, jump]);

  const sceneStyle = useAnimatedStyle(() => {
    const b = interpolate(breath.value, [0, 1], [1, 1.018]);
    const y = interpolate(breath.value, [0, 1], [0, -2.2]) + jump.value;
    const r = interpolate(sway.value, [0, 1], [-1.1, 1.1]);
    const hx = interpolate(hair.value, [0, 1], [-0.6, 0.6]);
    return {
      transform: [
        { translateY: y },
        { translateX: hx },
        { rotate: `${r + head.value * 0.15}deg` },
        { scale: b },
      ],
    };
  });

  const hairStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(hair.value, [0, 1], [-2.5, 2.5])}deg` },
      { translateX: interpolate(hair.value, [0, 1], [-1.5, 1.5]) },
    ],
  }));

  const hoodieStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(hoodie.value, [0, 1], [0, 1.8]) },
      { scaleX: interpolate(hoodie.value, [0, 1], [1, 1.012]) },
    ],
  }));

  const phoneStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(phones.value, [0, 1], [-1.8, 1.8])}deg` }],
  }));

  const dimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sceneDim.value, [0, 1], [0, 0.42]),
  }));

  const headTiltStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${head.value}deg` }],
  }));

  const eating = phase === 'eating';
  const reachPizza = food === 'pizza' && (phase === 'eating' || offerFood);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.scene, sceneStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, hoodieStyle]}>
          <Image source={HERO} style={styles.image} contentFit="contain" />
        </Animated.View>

        <Animated.View style={[styles.hairShim, hairStyle]} pointerEvents="none" />
        <Animated.View style={[styles.phoneShim, phoneStyle]} pointerEvents="none" />

        <Animated.View style={[styles.faceAnchor, headTiltStyle]}>
          <FaceHud
            emotion={emotion}
            heartEyes={heartEyes}
            blink={blink}
            lookX={lookX}
            lookY={lookY}
            mouth={mouth}
            thinking={phase === 'thinking'}
          />
        </Animated.View>

        <FoodProp
          food={food}
          offer={offerFood || idleAction === 'drinkCoffee' || idleAction === 'eatPizza'}
          eating={phase === 'eating'}
          hand={hand}
        />

        <CatLayer
          closer={catCloser}
          sleeping={catSleeping}
          lookAtEmo={lookAtMessage || phase === 'thinking'}
          alive={alive}
          reachPizza={reachPizza}
        />

        {idleAction === 'checkPhone' ? (
          <View style={styles.phoneProp} pointerEvents="none">
            <Text style={styles.phoneEmoji}>📱</Text>
          </View>
        ) : null}
        {idleAction === 'wave' ? (
          <View style={styles.waveProp} pointerEvents="none">
            <Text style={styles.waveEmoji}>👋</Text>
          </View>
        ) : null}
      </Animated.View>

      <Animated.View style={[styles.dim, dimStyle]} pointerEvents="none" />
      <View style={styles.liveBadge} pointerEvents="none">
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE</Text>
      </View>
    </View>
  );
}

export const EmoAiLiveCompanion = memo(EmoAiLiveCompanionInner);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#171923',
  },
  scene: {
    ...StyleSheet.absoluteFillObject,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  hairShim: {
    position: 'absolute',
    left: '28%',
    top: '6%',
    width: '22%',
    height: '18%',
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  phoneShim: {
    position: 'absolute',
    left: '22%',
    top: '14%',
    width: '34%',
    height: '22%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.12)',
  },
  faceAnchor: {
    position: 'absolute',
    left: '29%',
    top: '16%',
    width: 70,
    height: 70,
  },
  faceHud: {
    width: 70,
    height: 70,
    alignItems: 'center',
  },
  dotsRow: {
    position: 'absolute',
    right: -28,
    top: 18,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(23,25,35,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#C084FC',
  },
  foodProp: {
    position: 'absolute',
    left: '42%',
    top: '46%',
  },
  foodEmoji: {
    fontSize: 28,
  },
  catWrap: {
    position: 'absolute',
    right: '6%',
    bottom: '10%',
    width: 86,
    height: 70,
  },
  catEar: {
    position: 'absolute',
    top: 8,
    width: 14,
    height: 16,
    backgroundColor: '#7C3AED',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 4,
    opacity: 0.85,
  },
  catEarR: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 10,
  },
  catEye: {
    position: 'absolute',
    top: 28,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#2E1065',
  },
  catTail: {
    position: 'absolute',
    right: 2,
    bottom: 10,
    width: 18,
    height: 8,
    borderRadius: 8,
    backgroundColor: '#6D28D9',
    opacity: 0.8,
  },
  zzz: {
    position: 'absolute',
    right: 8,
    top: 0,
    color: '#E9D5FF',
    fontWeight: '800',
    fontSize: 12,
  },
  purr: {
    position: 'absolute',
    left: 8,
    top: 2,
    color: '#F9A8D4',
    fontSize: 12,
  },
  phoneProp: {
    position: 'absolute',
    left: '48%',
    top: '40%',
  },
  phoneEmoji: { fontSize: 22 },
  waveProp: {
    position: 'absolute',
    left: '55%',
    top: '28%',
  },
  waveEmoji: { fontSize: 24 },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020617',
  },
  liveBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  liveText: {
    color: '#E9D5FF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});
