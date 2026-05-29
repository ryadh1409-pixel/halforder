import { CK } from '@/constants/checkoutUi';
import * as Haptics from 'expo-haptics';
import React, { memo, useState } from 'react';
import { Image, LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

type Props = {
  restaurantName: string;
  imageUri: string | null;
  itemCount: number;
  children: React.ReactNode;
};

/** Collapsible bag card with spring chevron; mirrors Uber Eats order summary. */
function CheckoutOrderSummaryInner({ restaurantName, imageUri, itemCount, children }: Props) {
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
      <Pressable
        accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
        onPress={toggle}
        style={styles.head}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.thumb} accessibilityIgnoresInvertColors />
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
    marginTop: 18,
    borderRadius: CK.mapRadius,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.bg,
    overflow: 'hidden',
    shadowColor: CK.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  thumb: { width: 56, height: 56, borderRadius: 14, backgroundColor: CK.surface },
  thumbPh: { alignItems: 'center', justifyContent: 'center' },
  thumbTxt: { fontSize: 22, fontWeight: '900', color: CK.text },
  headMid: { flex: 1, minWidth: 0 },
  name: { fontSize: 18.5, fontWeight: '900', color: CK.text, letterSpacing: -0.35 },
  sub: { marginTop: 3, fontSize: 13.5, fontWeight: '600', color: CK.textSecondary },
  chevWrap: { paddingHorizontal: 6 },
  chev: { fontSize: 16, fontWeight: '900', color: CK.textMuted },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CK.border,
    gap: 10,
    paddingTop: 12,
  },
});
