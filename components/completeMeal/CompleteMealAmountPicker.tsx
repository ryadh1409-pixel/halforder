import { CompleteMealProgressBar } from '@/components/completeMeal/CompleteMealProgressBar';
import { CK } from '@/constants/checkoutUi';
import {
    COMPLETE_MEAL_MIN_OWNER_CENTS,
    COMPLETE_MEAL_PRESET_DOLLARS,
} from '@/constants/completeMeal';
import { clampOwnerPayCents, moneyLabelFromCents } from '@/types/completeMeal';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

type Props = {
  totalCents: number;
  busy?: boolean;
  onContinue: (ownerPayCents: number) => void;
};

export function CompleteMealAmountPicker({
  totalCents,
  busy,
  onContinue,
}: Props) {
  const minOwner = Math.min(
    totalCents,
    Math.max(COMPLETE_MEAL_MIN_OWNER_CENTS, 50),
  );
  const defaultPay = Math.min(
    totalCents,
    Math.max(minOwner, Math.round(totalCents * 0.4)),
  );
  const [payCents, setPayCents] = useState(defaultPay);
  const [custom, setCustom] = useState((defaultPay / 100).toFixed(2));

  const remaining = Math.max(0, totalCents - payCents);
  const validation = useMemo(
    () => clampOwnerPayCents(payCents, totalCents),
    [payCents, totalCents],
  );

  const applyDollars = (dollars: number) => {
    const cents = Math.round(dollars * 100);
    setPayCents(cents);
    setCustom((cents / 100).toFixed(2));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Complete My Meal</Text>
      <Text style={styles.title}>How much will you pay now?</Text>
      <Text style={styles.sub}>
        Friends can help cover the rest before your order is placed.
      </Text>

      <View style={styles.card}>
        <Row label="Order Total" value={moneyLabelFromCents(totalCents)} />
        <Row label="Pay Now" value={moneyLabelFromCents(payCents)} emphasize />
        <Row label="Remaining" value={moneyLabelFromCents(remaining)} />
        <CompleteMealProgressBar
          progressRatio={totalCents > 0 ? payCents / totalCents : 0}
          paidLabel={moneyLabelFromCents(payCents)}
          remainingLabel={moneyLabelFromCents(remaining)}
        />
      </View>

      <Text style={styles.label}>Quick amounts</Text>
      <View style={styles.presets}>
        {COMPLETE_MEAL_PRESET_DOLLARS.map((d) => {
          const cents = d * 100;
          if (cents < minOwner || cents > totalCents) return null;
          return (
            <Pressable
              key={d}
              style={[styles.chip, payCents === cents && styles.chipOn]}
              onPress={() => applyDollars(d)}
            >
              <Text style={styles.chipTxt}>${d}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, payCents === minOwner && styles.chipOn]}
          onPress={() => applyDollars(minOwner / 100)}
        >
          <Text style={styles.chipTxt}>Min {moneyLabelFromCents(minOwner)}</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, payCents === totalCents && styles.chipOn]}
          onPress={() => applyDollars(totalCents / 100)}
        >
          <Text style={styles.chipTxt}>Full</Text>
        </Pressable>
      </View>

      <Text style={styles.label}>Custom amount</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        value={custom}
        onChangeText={(t) => {
          setCustom(t);
          const n = Number.parseFloat(t);
          if (Number.isFinite(n)) setPayCents(Math.round(n * 100));
        }}
        placeholder="12.00"
        placeholderTextColor={CK.textMuted}
      />

      {!validation.ok ? (
        <Text style={styles.error}>{validation.message}</Text>
      ) : null}

      <Pressable
        style={[styles.cta, (!validation.ok || busy) && styles.ctaDisabled]}
        disabled={!validation.ok || busy}
        onPress={() => {
          if (validation.ok) onContinue(validation.ownerPayCents);
        }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaTxt}>
            Pay {moneyLabelFromCents(payCents)} now
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, emphasize && styles.rowEm]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: CK.accent ?? '#A855F7',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: { fontSize: 24, fontWeight: '900', color: CK.text },
  sub: { fontSize: 14, fontWeight: '600', color: CK.textSecondary, lineHeight: 20 },
  card: {
    marginTop: 8,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.bg,
    gap: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { color: CK.textSecondary, fontWeight: '700', fontSize: 14 },
  rowValue: { color: CK.text, fontWeight: '800', fontSize: 14 },
  rowEm: { color: CK.accent ?? '#A855F7', fontWeight: '900', fontSize: 16 },
  label: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800',
    color: CK.textSecondary,
    textTransform: 'uppercase',
  },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.bg,
  },
  chipOn: {
    borderColor: CK.accent ?? '#A855F7',
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  chipTxt: { color: CK.text, fontWeight: '800', fontSize: 13 },
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CK.border,
    backgroundColor: CK.bg,
    paddingHorizontal: 14,
    color: CK.text,
    fontSize: 16,
    fontWeight: '700',
  },
  error: { color: '#F87171', fontWeight: '700', fontSize: 13 },
  cta: {
    marginTop: 10,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: CK.accent ?? '#A855F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.55 },
  ctaTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
});
