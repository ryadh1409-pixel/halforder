/**
 * Premium HalfOrder balance card for Restaurant / Driver wallets.
 * Visual match to Customer Wallet card — no cashback / rewards.
 */
import AppLogo from '@/components/AppLogo';
import { useCountUpValue } from '@/hooks/useCountUpValue';
import { formatOrderDateTimeAbsolute } from '@/utils/time';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

function formatCad(amount: number): string {
  return `CA$${Math.max(0, amount).toFixed(2)}`;
}

type Props = {
  balance: number;
  updatedAt: unknown;
};

export const PartnerHalfOrderBalanceCard = memo(function PartnerHalfOrderBalanceCard({
  balance,
  updatedAt,
}: Props) {
  const displayBalance = useCountUpValue(balance, { durationMs: 900 });
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  const translateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });

  const lastUpdated = formatOrderDateTimeAbsolute(updatedAt);

  return (
    <Animated.View
      style={[styles.cardShell, { opacity: entrance, transform: [{ translateY }] }]}
      accessibilityRole="summary"
      accessibilityLabel={`HalfOrder balance ${balance.toFixed(2)} dollars. Managed by HalfOrder.`}
    >
      <LinearGradient
        colors={['#3B1873', '#25123F', '#140B23']}
        locations={[0, 0.52, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardSurface}
      >
        <View style={styles.cardGlowTop} pointerEvents="none" />
        <View style={styles.cardGlowBottom} pointerEvents="none" />
        <View style={styles.cardArcOuter} pointerEvents="none" />
        <View style={styles.cardArcInner} pointerEvents="none" />
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.16)',
            'rgba(255,255,255,0.04)',
            'transparent',
          ]}
          locations={[0, 0.42, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.95, y: 0.8 }}
          style={styles.cardSheen}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.34)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.cardTopEdge}
          pointerEvents="none"
        />
        <View style={styles.cardWatermark} pointerEvents="none">
          <AppLogo size={168} />
        </View>

        <Text style={styles.cardEyebrow} maxFontSizeMultiplier={1.2}>
          HALFORDER BALANCE
        </Text>

        <Text style={styles.cardBalance} maxFontSizeMultiplier={1.15}>
          {`CA$${displayBalance.toFixed(2)}`}
        </Text>

        <Text style={styles.cardFootnote} maxFontSizeMultiplier={1.25}>
          Managed by HalfOrder
        </Text>

        <View style={styles.cardDivider} pointerEvents="none" />

        <View style={styles.cardCashRow}>
          <Text style={styles.cardCashLabel} maxFontSizeMultiplier={1.25}>
            Current Balance
          </Text>
          <Text style={styles.cardCashValue} maxFontSizeMultiplier={1.2}>
            {formatCad(balance)}
          </Text>
        </View>

        <View style={styles.cardCashRow}>
          <Text style={styles.cardCashLabel} maxFontSizeMultiplier={1.25}>
            Last Updated
          </Text>
          <Text style={styles.cardCashValue} maxFontSizeMultiplier={1.2}>
            {lastUpdated === '—' ? '—' : lastUpdated}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  cardShell: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(196,181,253,0.30)',
    overflow: 'hidden',
    marginBottom: 30,
    ...Platform.select({
      ios: {
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.34,
        shadowRadius: 26,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  cardSurface: {
    minHeight: 202,
    paddingHorizontal: 22,
    paddingVertical: 22,
    overflow: 'hidden',
  },
  cardGlowTop: {
    position: 'absolute',
    top: -132,
    right: -84,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(168,85,247,0.22)',
  },
  cardGlowBottom: {
    position: 'absolute',
    bottom: -150,
    left: -96,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(196,181,253,0.10)',
  },
  cardArcOuter: {
    position: 'absolute',
    right: -118,
    bottom: -128,
    width: 300,
    height: 300,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardArcInner: {
    position: 'absolute',
    right: -74,
    bottom: -84,
    width: 212,
    height: 212,
    borderRadius: 106,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  cardTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  cardWatermark: {
    position: 'absolute',
    top: -34,
    right: -26,
    opacity: 0.07,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.62)',
    letterSpacing: 1.8,
  },
  cardBalance: {
    marginTop: 12,
    fontSize: 46,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1.6,
  },
  cardFootnote: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.52)',
    letterSpacing: 0.1,
  },
  cardDivider: {
    marginTop: 20,
    marginBottom: 18,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardCashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
  },
  cardCashLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.66)',
  },
  cardCashValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textAlign: 'right',
    flexShrink: 1,
  },
});
