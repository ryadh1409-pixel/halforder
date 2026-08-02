import type { HalfOrderPartnerWalletCredit } from '@/types/halfOrderPartnerWallet';
import { safeTimestampToDate } from '@/utils/time';
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

const PAL = {
  text: '#FFFFFF',
  textMuted: '#7D8493',
  textSecondary: '#B7BDC9',
  border: 'rgba(255,255,255,0.08)',
  surface: '#151126',
};

function formatCad(amount: number): string {
  return `CA$${Math.max(0, amount).toFixed(2)}`;
}

function localDate(value: unknown): string {
  const d = safeTimestampToDate(value);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return '—';
  }
}

function localTime(value: unknown): string {
  const d = safeTimestampToDate(value);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
}

type Props = {
  credits: HalfOrderPartnerWalletCredit[];
  /** Label for the order / delivery id column. */
  orderIdLabel: string;
  emptyText: string;
};

export const PartnerWalletCreditHistory = memo(function PartnerWalletCreditHistory({
  credits,
  orderIdLabel,
  emptyText,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.title}>Credit History</Text>
      {credits.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        credits.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.amount}>+{formatCad(c.amount)}</Text>
              <Text style={styles.meta}>
                {localDate(c.createdAt)} · {localTime(c.createdAt)}
              </Text>
            </View>
            <Text style={styles.line}>
              {orderIdLabel}: {c.orderId ?? '—'}
            </Text>
            <Text style={styles.line}>
              Balance after credit: {formatCad(c.balanceAfter)}
            </Text>
            {c.note ? (
              <Text style={styles.note} numberOfLines={2}>
                {c.note}
              </Text>
            ) : null}
            <Text style={styles.footnote}>
              {c.description || 'Balance added by HalfOrder'}
            </Text>
          </View>
        ))
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  title: {
    marginBottom: 12,
    fontSize: 13,
    fontWeight: '800',
    color: PAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  empty: { color: PAL.textMuted, fontSize: 14, fontWeight: '600' },
  row: {
    backgroundColor: PAL.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: PAL.border,
    padding: 14,
    marginBottom: 10,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  amount: { color: '#C084FC', fontSize: 17, fontWeight: '800' },
  meta: { color: PAL.textMuted, fontSize: 12, fontWeight: '600' },
  line: { color: PAL.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 2 },
  note: { color: PAL.textSecondary, fontSize: 12, marginTop: 6 },
  footnote: { color: PAL.textMuted, fontSize: 11, fontWeight: '600', marginTop: 8 },
});
