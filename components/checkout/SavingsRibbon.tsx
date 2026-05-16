import { CK } from '@/constants/checkoutUi';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  savingsAmount: number;
  /** Optional subtitle, e.g. membership name */
  sublabel?: string;
};

/** Gold-tier savings cue — mounts above footer CTA. */
function SavingsRibbonInner({ savingsAmount, sublabel }: Props) {
  if (!(savingsAmount > 0.009)) return null;
  const formatted = `$${savingsAmount.toFixed(2)}`;
  const lead = `You're saving ${formatted}`;
  return (
    <LinearGradient
      colors={['#FFFAE9', CK.savingsGoldFrom, CK.savingsGoldMid]}
      start={{ x: 0.1, y: 0.4 }}
      end={{ x: 1, y: 1 }}
      style={styles.banner}
    >
      <View style={styles.star}>
        <Ionicons name="star" size={14} color={CK.savingsGoldText} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.bold}>
          {lead}
          <Text style={styles.with}> with promotions</Text>
        </Text>
        {sublabel ? <Text style={styles.sub}>{sublabel}</Text> : null}
      </View>
    </LinearGradient>
  );
}

export const SavingsRibbon = memo(SavingsRibbonInner);

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: CK.mapRadius,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,179,71,0.45)',
    shadowColor: '#8B6914',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  star: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(61,47,11,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1, minWidth: 0 },
  bold: {
    fontSize: 15.5,
    fontWeight: '900',
    color: CK.savingsGoldText,
    letterSpacing: -0.1,
    lineHeight: 21,
  },
  with: { fontWeight: '700', color: CK.savingsGoldText },
  sub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(61,47,11,0.65)',
    lineHeight: 16,
  },
});
