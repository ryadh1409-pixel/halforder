import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  haptic?: boolean;
  scaleTo?: number;
};

function PressableScaleInner({
  haptic = true,
  scaleTo = 0.97,
  onPress,
  style,
  children,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      style={[style, anim]}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 420 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 14, stiffness: 280 });
      }}
      onPress={(e) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}

export const PressableScale = memo(PressableScaleInner);
