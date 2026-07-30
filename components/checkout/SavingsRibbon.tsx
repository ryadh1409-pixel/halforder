import { CK } from '@/constants/checkoutUi';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import React, { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';

type Props = {
  savingsAmount: number;
  /** Optional subtitle, e.g. membership name */
  sublabel?: string;
  /** Optional custom headline (replaces default “You saved…” lead). */
  headline?: string;
  /** Optional custom detail line under the headline. */
  detail?: string;
};

/** Savings cue — mounts above footer CTA whenever the order has real savings. */
function SavingsRibbonInner({
  savingsAmount,
  sublabel,
  headline,
  detail,
}: Props) {
  const visible = savingsAmount > 0.009;
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, {
      toValue: visible ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appear, visible]);

  if (!visible) return null;
  const formatted = `$${savingsAmount.toFixed(2)}`;
  const lead = `You saved ${formatted} today`;
  return (
    <Animated.View
      style={[
        styles.shell,
        {
          opacity: appear,
          transform: [
            {
              translateY: appear.interpolate({
                inputRange: [0, 1],
                outputRange: [6, 0],
              }),
            },
          ],
        },
      ]}
    >
      <LinearGradient
        colors={['rgba(168,85,247,0.24)', 'rgba(168,85,247,0.10)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <View style={styles.innerHighlight} pointerEvents="none" />
        <View style={styles.star}>
          <Ionicons name="star" size={14} color="#C4B5FD" />
        </View>
        <View style={styles.textWrap}>
          {headline ? (
            <>
              <Text style={styles.bold}>{headline}</Text>
              {detail ? <Text style={styles.sub}>{detail}</Text> : null}
            </>
          ) : (
            <Text style={styles.bold}>{lead}</Text>
          )}
          {sublabel ? <Text style={styles.sub}>{sublabel}</Text> : null}
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export const SavingsRibbon = memo(SavingsRibbonInner);

const styles = StyleSheet.create({
  shell: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: CK.mapRadius,
    ...Platform.select({
      ios: {
        shadowColor: '#A855F7',
        shadowOpacity: 0.18,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 3,
      },
      default: {
        shadowColor: '#A855F7',
        shadowOpacity: 0.16,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
  banner: {
    borderRadius: CK.mapRadius,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,85,247,0.34)',
    overflow: 'hidden',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  star: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(168,85,247,0.20)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(168,85,247,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    zIndex: 1,
  },
  bold: {
    fontSize: 15.5,
    fontWeight: '800',
    color: CK.text,
    letterSpacing: -0.1,
    lineHeight: 21,
  },
  sub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: CK.textSecondary,
    lineHeight: 16,
  },
});
