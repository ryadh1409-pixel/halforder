import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  disabled?: boolean;
  loading?: boolean;
  onPass: () => void;
  onLike: () => void;
};

function ActionBtn({
  onPress,
  disabled,
  variant,
}: {
  onPress: () => void;
  disabled?: boolean;
  variant: 'pass' | 'like';
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const isPass = variant === 'pass';

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(0.92, { damping: 16, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 280 });
      }}
      onPress={() => {
        void Haptics.impactAsync(
          isPass
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Medium,
        );
        onPress();
      }}
      style={[
        styles.btn,
        isPass ? styles.pass : styles.like,
        disabled && styles.disabled,
        anim,
      ]}
    >
      <Ionicons
        name={isPass ? 'close' : 'flame'}
        size={isPass ? 32 : 34}
        color={isPass ? '#FF4458' : '#FFFFFF'}
      />
    </AnimatedPressable>
  );
}

function SwipeActionButtonsInner({ disabled, loading, onPass, onLike }: Props) {
  return (
    <View style={styles.row}>
      <ActionBtn
        variant="pass"
        disabled={disabled || loading}
        onPress={onPass}
      />
      <ActionBtn
        variant="like"
        disabled={disabled || loading}
        onPress={onLike}
      />
    </View>
  );
}

export const SwipeActionButtons = memo(SwipeActionButtonsInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
    paddingVertical: 8,
    paddingBottom: 4,
  },
  btn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pass: {
    backgroundColor: 'rgba(20,20,28,0.95)',
    borderColor: 'rgba(255,68,88,0.45)',
    shadowColor: '#FF4458',
    shadowOpacity: 0.35,
  },
  like: {
    backgroundColor: '#22C55E',
    borderColor: '#7D8493',
    shadowColor: '#22C55E',
    shadowOpacity: 0.45,
  },
  disabled: { opacity: 0.4 },
});
