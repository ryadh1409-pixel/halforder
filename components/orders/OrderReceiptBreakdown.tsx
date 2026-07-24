import {
  feeOrFreeLabel,
  formatHstLabel,
  moneyLabel,
  receiptNumberFromId,
  type OrderPricingBreakdown,
} from '@/lib/orderPricing';
import { formatPaidAtLabel } from '@/lib/orderReceipt';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type OrderReceiptMeta = {
  receiptNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  stripeTransactionId?: string | null;
  /** Firestore server timestamp (paidAt) — never device clock. */
  paidAt?: unknown;
  /** Fallback id used to derive receipt number when receiptNumber missing. */
  idForReceipt?: string | null;
};

type Tone = 'dark' | 'light';

type Props = {
  pricing: OrderPricingBreakdown;
  meta?: OrderReceiptMeta;
  tone?: Tone;
  title?: string;
};

function Row({
  label,
  value,
  tone,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  tone: Tone;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text
        style={[
          tone === 'dark' ? styles.labelDark : styles.labelLight,
          muted && styles.muted,
          emphasize && styles.emphasizeLabel,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          tone === 'dark' ? styles.valueDark : styles.valueLight,
          emphasize && styles.emphasizeValue,
          muted && styles.muted,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Uber Eats–style receipt: food, HST, delivery, service, promo, total + metadata.
 * Does not show tip or membership benefit.
 */
export function OrderReceiptBreakdown({
  pricing,
  meta,
  tone = 'dark',
  title = 'Order Summary',
}: Props) {
  const paidAtLabel = formatPaidAtLabel(meta?.paidAt);
  const receiptNo =
    (meta?.receiptNumber && meta.receiptNumber.trim()) ||
    receiptNumberFromId(meta?.idForReceipt ?? meta?.stripeTransactionId);

  return (
    <View
      style={[
        styles.card,
        tone === 'light' ? styles.cardLight : styles.cardDark,
      ]}
    >
      <Text style={tone === 'dark' ? styles.titleDark : styles.titleLight}>
        {title}
      </Text>

      <Row
        tone={tone}
        label="Food subtotal"
        value={moneyLabel(pricing.foodSubtotal)}
      />
      <Row
        tone={tone}
        label={formatHstLabel(pricing.taxRate)}
        value={moneyLabel(pricing.hst)}
      />
      <Row
        tone={tone}
        label="Delivery fee"
        value={feeOrFreeLabel(pricing.deliveryFee)}
      />
      <Row
        tone={tone}
        label="Service fee"
        value={feeOrFreeLabel(pricing.serviceFee)}
      />
      {pricing.promoDiscount > 0 ? (
        <Row
          tone={tone}
          label="Promotion discount"
          value={`-${moneyLabel(pricing.promoDiscount)}`}
        />
      ) : null}

      <View style={[styles.divider, tone === 'light' && styles.dividerLight]} />

      <Row
        tone={tone}
        label="Total paid"
        value={moneyLabel(pricing.totalPaid)}
        emphasize
      />

      {meta ? (
        <>
          <View
            style={[styles.divider, tone === 'light' && styles.dividerLight]}
          />
          <Text
            style={tone === 'dark' ? styles.metaTitleDark : styles.metaTitleLight}
          >
            Receipt
          </Text>
          <Row tone={tone} label="Receipt Number" value={receiptNo} muted />
          <Row
            tone={tone}
            label="Payment Method"
            value={meta.paymentMethod?.trim() || '—'}
            muted
          />
          <Row
            tone={tone}
            label="Payment Status"
            value={meta.paymentStatus?.trim() || '—'}
            muted
          />
          <Row
            tone={tone}
            label="Stripe Transaction ID"
            value={meta.stripeTransactionId?.trim() || '—'}
            muted
          />
          <Row tone={tone} label="Paid At" value={paidAtLabel} muted />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardDark: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  titleDark: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 10,
  },
  titleLight: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 10,
  },
  metaTitleDark: {
    color: '#B7BDC9',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaTitleLight: {
    color: '#64748b',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  labelDark: { color: '#7D8493', fontWeight: '700', flexShrink: 1 },
  labelLight: { color: '#64748b', fontWeight: '700', flexShrink: 1 },
  valueDark: { color: '#FFFFFF', fontWeight: '600' },
  valueLight: { color: '#0f172a', fontWeight: '600' },
  emphasizeLabel: { fontSize: 16, fontWeight: '800' },
  emphasizeValue: { fontSize: 16, fontWeight: '800' },
  muted: { opacity: 0.85, fontSize: 13 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 12,
    marginBottom: 4,
  },
  dividerLight: { backgroundColor: 'rgba(15, 23, 42, 0.1)' },
});
