import { CK, checkoutPressableProps } from '@/constants/checkoutUi';
import * as Haptics from 'expo-haptics';
import React, { memo, useState } from 'react';
import {
  Image,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

type Props = {
  restaurantName: string;
  imageUri: string | null;
  itemCount: number;
  children: React.ReactNode;
};

/** Collapsible bag summary — list style, no heavy card chrome. */
function CheckoutOrderSummaryInner({
  restaurantName,
  imageUri,
  itemCount,
  children,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const open = useSharedValue(1);

  const rotate = useAnimatedStyle(() => ({
    transform: [{ rotate: `${(1 - open.value) * 180}deg` }],
  }));

  const toggle = () => {
    if (Platform.OS === 'android') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    void Haptics.selectionAsync();
    setExpanded((e) => {
      const next = !e;
      open.value = withSpring(next ? 1 : 0, { damping: 16, stiffness: 180 });
      return next;
    });
  };

  return (
    <View style={styles.card}>
      <Pressable {...checkoutPressableProps} onPress={toggle} style={styles.head}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.thumb}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPh]}>
            <Text style={styles.thumbTxt}>{restaurantName.charAt(0)}</Text>
          </View>
        )}
        <View style={styles.headMid}>
          <Text style={styles.name} numberOfLines={1}>
            {restaurantName}
          </Text>
          <Text style={styles.sub}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
        <Animated.View style={[styles.chevWrap, rotate]}>
          <Text style={styles.chev}>⌄</Text>
        </Animated.View>
      </Pressable>

      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

export const CheckoutOrderSummary = memo(CheckoutOrderSummaryInner);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
    gap: 12,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  thumbTxt: { fontSize: 18, fontWeight: '800', color: CK.text },
  headMid: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.25,
  },
  sub: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '600',
    color: CK.textSecondary,
  },
  chevWrap: { paddingHorizontal: 4 },
  chev: { fontSize: 15, fontWeight: '700', color: CK.textMuted },
  body: {
    paddingHorizontal: 0,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 12,
    paddingTop: 12,
  },
});
