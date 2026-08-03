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
  const n = Math.round((Number.isFinite(amount) ? amount : 0) * 100) / 100;
  const sign = n < 0 ? '-' : '';
  return `${sign}CA$${Math.abs(n).toFixed(2)}`;
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
      <Text style={styles.title}>Wallet History</Text>
      {credits.length === 0 ? (
        <Text style={styles.empty}>{emptyText}</Text>
      ) : (
        credits.map((c) => {
          const isAdjustment = c.type === 'admin_balance_adjustment';
          const displayAmount = isAdjustment
            ? c.adjustmentAmount ?? c.amount
            : c.amount;
          const amountLabel = isAdjustment
            ? formatCad(displayAmount)
            : `+${formatCad(displayAmount)}`;
          return (
            <View key={c.id} style={styles.row}>
              <View style={styles.rowTop}>
                <Text style={styles.amount}>{amountLabel}</Text>
                <Text style={styles.meta}>
                  {localDate(c.createdAt)} · {localTime(c.createdAt)}
                </Text>
              </View>
              {isAdjustment ? (
                <>
                  <Text style={styles.line}>
                    Type: admin_balance_adjustment
                  </Text>
                  <Text style={styles.line}>
                    Previous: {formatCad(c.previousBalance ?? 0)} → New:{' '}
                    {formatCad(c.newBalance ?? c.balanceAfter)}
                  </Text>
                  {c.reason || c.note ? (
                    <Text style={styles.note} numberOfLines={3}>
                      Reason: {c.reason ?? c.note}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
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
                </>
              )}
              <Text style={styles.footnote}>
                {c.description ||
                  (isAdjustment
                    ? 'Admin balance adjustment'
                    : 'Balance added by HalfOrder')}
              </Text>
            </View>
          );
        })
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
