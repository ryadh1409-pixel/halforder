import {
  formatHstLabel,
  receiptNumberFromId,
  type OrderPricingBreakdown,
} from '@/lib/orderPricing';
import { formatPaidAtLabel } from '@/lib/orderReceipt';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export type OrderReceiptMeta = {
  receiptNumber?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  stripeTransactionId?: string | null;
  paidAt?: unknown;
  idForReceipt?: string | null;
};

type Tone = 'dark' | 'light';

type Props = {
  pricing: OrderPricingBreakdown;
  meta?: OrderReceiptMeta;
  tone?: Tone;
  title?: string;
};

// ── Colours ───────────────────────────────────────────────────────────────────

const PURPLE       = '#7C3AED';
const PURPLE_DARK  = '#C084FC';
const PURPLE_SOFT  = '#F5F3FF';
const GREEN        = '#16A34A';
const RED          = '#DC2626';
const RED_BG       = 'rgba(220,38,38,0.06)';
const GOLD         = '#D97706';
const GOLD_BG      = 'rgba(217,119,6,0.08)';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cad(amount: number): string {
  if (!Number.isFinite(amount)) return 'CA$0.00';
  return `CA$${Math.max(0, amount).toFixed(2)}`;
}

function isFree(amount: number): boolean {
  return !Number.isFinite(amount) || amount <= 0;
}

// ── Fee card (Delivery / Service) ─────────────────────────────────────────────

function FeeCard({
  icon,
  title,
  amount,
  shareNote,
  dark,
}: {
  icon: string;
  title: string;
  amount: number;
  shareNote: string;
  dark: boolean;
}) {
  if (isFree(amount)) {
    return (
      <View style={[styles.feeCard, dark ? styles.feeCardDark : styles.feeCardFree]}>
        <View style={styles.feeCardRow}>
          <Text style={styles.feeCardIcon}>{icon}</Text>
          <Text style={[styles.feeCardTitle, dark && styles.textLight]}>{title}</Text>
        </View>
        <View style={styles.freePill}>
          <Text style={styles.freePillText}>FREE</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.feeCard, dark ? styles.feeCardDark : styles.feeCardLight]}>
      {/* Title */}
      <View style={styles.feeCardRow}>
        <Text style={styles.feeCardIcon}>{icon}</Text>
        <Text style={[styles.feeCardTitle, dark && styles.textLight]}>{title}</Text>
      </View>

      {/* Share note pill */}
      <View style={[styles.shareNotePill, dark && styles.shareNotePillDark]}>
        <Ionicons name="people-outline" size={11} color={dark ? PURPLE_DARK : PURPLE} />
        <Text style={[styles.shareNoteText, dark && { color: PURPLE_DARK }]}>
          {shareNote}
        </Text>
      </View>

      {/* Divider */}
      <View style={[styles.feeDivider, dark && styles.feeDividerDark]} />

      {/* You pay */}
      <View style={styles.feeCardRow}>
        <Text style={[styles.youPayLabel, dark && styles.textMuted]}>You pay</Text>
        <Text style={[styles.youPayAmount, dark && styles.youPayAmountDark]}>
          {cad(amount)}
        </Text>
      </View>
    </View>
  );
}

// ── Simple row ────────────────────────────────────────────────────────────────

function SimpleRow({
  icon,
  label,
  value,
  valueStyle,
  dark,
}: {
  icon: string;
  label: string;
  value: string;
  valueStyle?: object;
  dark: boolean;
}) {
  return (
    <View style={[styles.simpleRow, dark && styles.simpleRowDark]}>
      <View style={styles.simpleRowLeft}>
        <Text style={styles.simpleRowIcon}>{icon}</Text>
        <Text style={[styles.simpleRowLabel, dark && styles.textMuted]}>{label}</Text>
      </View>
      <Text style={[styles.simpleRowValue, dark && styles.textLight, valueStyle]}>
        {value}
      </Text>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OrderReceiptBreakdown({
  pricing,
  meta,
  tone = 'dark',
  title = 'Order Summary',
}: Props) {
  const dark = tone === 'dark';
  const paidAtLabel = formatPaidAtLabel(meta?.paidAt);
  const receiptNo =
    (meta?.receiptNumber?.trim()) ||
    receiptNumberFromId(meta?.idForReceipt ?? meta?.stripeTransactionId);

  const hasPromo = pricing.promoDiscount > 0;

  return (
    <View style={[styles.card, dark ? styles.cardDark : styles.cardLight]}>

      {/* ── Header ── */}
      <View style={[styles.header, dark && styles.headerDark]}>
        <View style={styles.headerLeft}>
          <Ionicons
            name="receipt-outline"
            size={15}
            color={dark ? PURPLE_DARK : PURPLE}
          />
          <Text style={[styles.headerTitle, dark && { color: PURPLE_DARK }]}>
            {title}
          </Text>
        </View>
        <View style={[styles.fullOrderBadge, dark && styles.fullOrderBadgeDark]}>
          <Text style={[styles.fullOrderBadgeText, dark && { color: PURPLE_DARK }]}>
            FullOrder
          </Text>
        </View>
      </View>

      {/* ── Food ── */}
      <SimpleRow
        icon="🍽️"
        label="Food"
        value={cad(pricing.foodSubtotal)}
        dark={dark}
      />

      {/* ── Delivery Fee ── */}
      <View style={styles.feeCardWrapper}>
        <FeeCard
          icon="🚚"
          title="Delivery Fee"
          amount={pricing.deliveryFee}
          shareNote="Shared among all participants"
          dark={dark}
        />
      </View>

      {/* ── Service Fee ── */}
      <View style={styles.feeCardWrapper}>
        <FeeCard
          icon="⚡"
          title="Service Fee"
          amount={pricing.serviceFee}
          shareNote="Shared platform cost"
          dark={dark}
        />
      </View>

      {/* ── Promo ── */}
      {hasPromo ? (
        <SimpleRow
          icon="🎟️"
          label="Promo Code"
          value={`−${cad(pricing.promoDiscount)}`}
          valueStyle={{ color: RED, fontWeight: '800' }}
          dark={dark}
        />
      ) : null}

      {/* ── Tax ── */}
      <SimpleRow
        icon="🏛️"
        label={formatHstLabel(pricing.taxRate)}
        value={cad(pricing.hst)}
        dark={dark}
      />

      {/* ── Total ── */}
      <View style={[styles.totalRow, dark && styles.totalRowDark]}>
        <Text style={[styles.totalLabel, dark && styles.textLight]}>Total Paid</Text>
        <Text style={[styles.totalAmount, dark && styles.totalAmountDark]}>
          {cad(pricing.totalPaid)}
        </Text>
      </View>

      {/* ── Savings note ── */}
      <View style={[styles.savingsBanner, dark && styles.savingsBannerDark]}>
        <Text style={styles.savingsEmoji}>🤝</Text>
        <View style={styles.savingsText}>
          <Text style={[styles.savingsTitle, dark && { color: GREEN }]}>
            Shared delivery & fees
          </Text>
          <Text style={[styles.savingsSubtitle, dark && { color: GREEN, opacity: 0.75 }]}>
            Costs split between all order participants
          </Text>
        </View>
      </View>

      {/* ── Receipt metadata ── */}
      {meta ? (
        <View style={[styles.receiptSection, dark && styles.receiptSectionDark]}>
          <View style={styles.receiptHeader}>
            <Ionicons
              name="document-text-outline"
              size={13}
              color={dark ? '#6B7280' : '#94a3b8'}
            />
            <Text style={[styles.receiptTitle, dark && styles.receiptTitleDark]}>
              Receipt
            </Text>
          </View>

          <ReceiptRow label="Receipt Number" value={receiptNo} dark={dark} mono />
          <ReceiptRow
            label="Payment Method"
            value={meta.paymentMethod?.trim() || '—'}
            dark={dark}
          />
          <ReceiptRow
            label="Payment Status"
            value={meta.paymentStatus?.trim() || '—'}
            dark={dark}
            statusColor={
              meta.paymentStatus === 'paid' || meta.paymentStatus === 'succeeded'
                ? GREEN
                : meta.paymentStatus === 'refunded'
                  ? RED
                  : undefined
            }
          />
          <ReceiptRow label="Paid At" value={paidAtLabel} dark={dark} />
        </View>
      ) : null}
    </View>
  );
}

function ReceiptRow({
  label,
  value,
  dark,
  mono,
  statusColor,
}: {
  label: string;
  value: string;
  dark: boolean;
  mono?: boolean;
  statusColor?: string;
}) {
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptLabel, dark && styles.receiptLabelDark]}>{label}</Text>
      <Text
        style={[
          styles.receiptValue,
          dark && styles.receiptValueDark,
          mono && styles.receiptMono,
          statusColor ? { color: statusColor, fontWeight: '800' } : null,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
  },
  cardDark: {
    backgroundColor: 'rgba(18,20,30,0.95)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15,23,42,0.08)',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  headerDark: {
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: PURPLE,
  },
  fullOrderBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: PURPLE_SOFT,
  },
  fullOrderBadgeDark: {
    backgroundColor: 'rgba(124,58,237,0.15)',
  },
  fullOrderBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: PURPLE,
    letterSpacing: 0.3,
  },

  // Simple rows
  simpleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.05)',
  },
  simpleRowDark: {
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  simpleRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simpleRowIcon: { fontSize: 15 },
  simpleRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  simpleRowValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },

  // Fee cards
  feeCardWrapper: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  feeCard: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  feeCardLight: {
    backgroundColor: '#FAFAFA',
    borderColor: 'rgba(15,23,42,0.07)',
  },
  feeCardDark: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  feeCardFree: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: GOLD_BG,
    borderColor: 'rgba(217,119,6,0.15)',
  },
  feeCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  feeCardIcon: { fontSize: 15 },
  feeCardTitle: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  shareNotePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: PURPLE_SOFT,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  shareNotePillDark: {
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  shareNoteText: {
    fontSize: 11,
    fontWeight: '700',
    color: PURPLE,
  },
  feeDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginVertical: 2,
  },
  feeDividerDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  youPayLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  youPayAmount: {
    fontSize: 16,
    fontWeight: '900',
    color: PURPLE,
  },
  youPayAmountDark: {
    color: PURPLE_DARK,
  },

  // Free pill
  freePill: {
    backgroundColor: GOLD_BG,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.2)',
  },
  freePillText: {
    fontSize: 11,
    fontWeight: '900',
    color: GOLD,
    letterSpacing: 0.5,
  },

  // Total
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    marginTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(15,23,42,0.08)',
  },
  totalRowDark: {
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  totalLabel: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
  },
  totalAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: PURPLE,
  },
  totalAmountDark: {
    color: PURPLE_DARK,
  },

  // Savings / sharing banner
  savingsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(22,163,74,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.18)',
  },
  savingsBannerDark: {
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderColor: 'rgba(22,163,74,0.2)',
  },
  savingsEmoji: { fontSize: 22 },
  savingsText: { flex: 1 },
  savingsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: GREEN,
  },
  savingsSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: GREEN,
    opacity: 0.8,
    marginTop: 2,
  },

  // Receipt section
  receiptSection: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    padding: 12,
  },
  receiptSectionDark: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  receiptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  receiptTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: '#94a3b8',
  },
  receiptTitleDark: {
    color: '#6B7280',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15,23,42,0.05)',
  },
  receiptLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    flex: 1,
  },
  receiptLabelDark: {
    color: '#6B7280',
  },
  receiptValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    maxWidth: '55%',
    textAlign: 'right',
  },
  receiptValueDark: {
    color: '#D1D5DB',
  },
  receiptMono: {
    fontFamily: 'monospace',
    fontSize: 12,
  },

  // Shared text helpers
  textLight: { color: '#FFFFFF' },
  textMuted: { color: '#94a3b8' },
});
