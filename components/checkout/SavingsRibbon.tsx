import { CK } from '@/constants/checkoutUi';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

type Props = {
  savingsAmount: number;
  /** Optional subtitle, e.g. membership name */
  sublabel?: string;
  /** Optional custom headline (replaces default “You're saving…” lead). */
  headline?: string;
  /** Optional custom detail line under the headline. */
  detail?: string;
};

/** Gold-tier savings cue — mounts above footer CTA. */
function SavingsRibbonInner({
  savingsAmount,
  sublabel,
  headline,
  detail,
}: Props) {
  if (!(savingsAmount > 0.009)) return null;
  const formatted = `$${savingsAmount.toFixed(2)}`;
  const lead = `You're saving ${formatted}`;
  return (
    <View style={styles.shell}>
      <LinearGradient
        colors={['#FFFBF5', '#F5E8CC', '#EAD7A8']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.banner}
      >
        <View style={styles.innerHighlight} pointerEvents="none" />
        <View style={styles.star}>
          <Ionicons name="star" size={14} color="#9A7324" />
        </View>
        <View style={styles.textWrap}>
          {headline ? (
            <>
              <Text style={styles.bold}>{headline}</Text>
              {detail ? <Text style={styles.sub}>{detail}</Text> : null}
            </>
          ) : (
            <Text style={styles.bold}>
              {lead}
              <Text style={styles.with}> with promotions</Text>
            </Text>
          )}
          {sublabel ? <Text style={styles.sub}>{sublabel}</Text> : null}
        </View>
      </LinearGradient>
    </View>
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
        shadowColor: '#6B5428',
        shadowOpacity: 0.14,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      android: {
        elevation: 3,
      },
      default: {
        shadowColor: '#6B5428',
        shadowOpacity: 0.12,
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
    borderColor: 'rgba(154, 115, 36, 0.28)',
    overflow: 'hidden',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
  },
  star: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(154, 115, 36, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(154, 115, 36, 0.22)',
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
    color: '#1C1917',
    letterSpacing: -0.1,
    lineHeight: 21,
  },
  with: {
    fontWeight: '700',
    color: '#1C1917',
  },
  sub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(28, 25, 23, 0.72)',
    lineHeight: 16,
  },
});
