import { AdminHeader } from '@/components/admin/AdminHeader';
import { AppTextInput } from '@/components/AppTextInput';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { USER_ROUTES } from '@/lib/navigationPaths';
import {
  subscribeSupportConversationMessages,
  type SupportConversationMessage,
} from '@/services/supportConversations';
import {
  fetchAdminPaymentTransactions,
  formatCurrency,
  formatPaymentCard,
  formatPaymentStatusLabel,
} from '@/services/adminPaymentCenter';
import {
  savePaymentInternalNotes,
  subscribePaymentInternalNotes,
  subscribePaymentSupportHistory,
  type PaymentInternalNotes,
  type PaymentSupportHistoryMessage,
} from '@/services/paymentAdminMeta';
import {
  buildPaymentTimeline,
  fetchPaymentCustomerProfile,
  fetchPaymentDocExtras,
  fetchPaymentOrderEnrichment,
  sendPaymentCustomerSupportMessage,
  stripeFieldOrUnavailable,
  type PaymentCardExtras,
  type PaymentCustomerProfile,
  type PaymentOrderEnrichment,
  type PaymentTimelineEvent,
} from '@/services/paymentDetailSupport';
import type { AdminPaymentTransaction } from '@/types/adminPaymentTransaction';
import { getReadableErrorMessageOr } from '@/utils/errorMessages';
import { showError, showSuccess } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function DetailRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      {onPress ? (
        <Pressable onPress={onPress}>
          <Text style={[styles.detailValue, styles.link]}>{value}</Text>
        </Pressable>
      ) : (
        <Text style={styles.detailValue}>{value}</Text>
      )}
    </View>
  );
}

function formatWhen(ms: number | null | undefined): string {
  if (ms == null) return '—';
  return new Date(ms).toLocaleString();
}

type HistoryRow = {
  id: string;
  sender: 'admin' | 'customer';
  body: string;
  createdAtMs: number | null;
  read: boolean;
  delivered: boolean;
};

function mergeHistory(
  paymentMsgs: PaymentSupportHistoryMessage[],
  supportMsgs: SupportConversationMessage[],
  paymentId: string,
): HistoryRow[] {
  const rows: HistoryRow[] = paymentMsgs.map((m) => ({
    id: `p-${m.id}`,
    sender: m.sender,
    body: m.body,
    createdAtMs: m.createdAtMs,
    read: m.read,
    delivered: m.delivered,
  }));

  for (const m of supportMsgs) {
    const isCustomer = m.sender === 'customer';
    const mentionsPayment = m.body.includes(paymentId);
    if (!isCustomer && !mentionsPayment) continue;
    const key = `${m.createdAtMs ?? 0}|${m.body.slice(0, 80)}`;
    if (
      rows.some(
        (r) => `${r.createdAtMs ?? 0}|${r.body.slice(0, 80)}` === key,
      )
    ) {
      continue;
    }
    rows.push({
      id: `s-${m.id}`,
      sender: isCustomer ? 'customer' : 'admin',
      body: m.body,
      createdAtMs: m.createdAtMs,
      read: isCustomer ? m.readByAdmin : m.readByCustomer,
      delivered: true,
    });
  }

  return rows.sort(
    (a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0),
  );
}

export default function AdminPaymentDetailScreen() {
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const id = typeof paymentId === 'string' ? decodeURIComponent(paymentId) : '';
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<AdminPaymentTransaction | null>(null);
  const [customer, setCustomer] = useState<PaymentCustomerProfile | null>(null);
  const [orderInfo, setOrderInfo] = useState<PaymentOrderEnrichment | null>(null);
  const [cardExtras, setCardExtras] = useState<PaymentCardExtras | null>(null);
  const [refundStatus, setRefundStatus] = useState<string | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);
  const [paymentMethodLabel, setPaymentMethodLabel] = useState<string | null>(
    null,
  );
  const [notes, setNotes] = useState<PaymentInternalNotes | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [historyPayment, setHistoryPayment] = useState<
    PaymentSupportHistoryMessage[]
  >([]);
  const [historySupport, setHistorySupport] = useState<SupportConversationMessage[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await fetchAdminPaymentTransactions();
      if (cancelled) return;
      const found = rows.find((row) => row.id === id) ?? null;
      setPayment(found);
      if (found) {
        const [profile, order, extras] = await Promise.all([
          fetchPaymentCustomerProfile(found.customerId),
          fetchPaymentOrderEnrichment(found.orderId, found.matchId),
          fetchPaymentDocExtras(found.id),
        ]);
        if (cancelled) return;
        setCustomer(profile);
        setOrderInfo(order);
        setCardExtras(extras.card);
        setRefundStatus(extras.refundStatus ?? order.refundStatus);
        setUpdatedAtMs(extras.updatedAtMs ?? order.updatedAtMs);
        setPaymentMethodLabel(extras.paymentMethod);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return subscribePaymentInternalNotes(id, (n) => {
      setNotes(n);
      setNotesDraft(n.text);
    });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    return subscribePaymentSupportHistory(id, setHistoryPayment);
  }, [id]);

  useEffect(() => {
    const uid = payment?.customerId;
    if (!uid) return;
    return subscribeSupportConversationMessages(uid, setHistorySupport);
  }, [payment?.customerId]);

  const created = useMemo(() => formatWhen(payment?.createdAtMs), [payment?.createdAtMs]);
  const paid = useMemo(() => formatWhen(payment?.paidAtMs), [payment?.paidAtMs]);
  const updated = useMemo(() => formatWhen(updatedAtMs), [updatedAtMs]);

  const timeline: PaymentTimelineEvent[] = useMemo(() => {
    if (!payment) return [];
    return buildPaymentTimeline(payment, orderInfo ?? {
      orderStatus: null,
      deliveryStatus: null,
      refundStatus: null,
      updatedAtMs: null,
      restaurantAcceptedAtMs: null,
      driverAssignedAtMs: null,
      deliveredAtMs: null,
      cancelledAtMs: null,
      customerJoinedAtMs: null,
    });
  }, [payment, orderInfo]);

  const history = useMemo(
    () => mergeHistory(historyPayment, historySupport, id),
    [historyPayment, historySupport, id],
  );

  const amountLabel = payment
    ? formatCurrency(payment.amount, payment.currency)
    : '—';

  const customerName =
    customer?.name || payment?.customerName || payment?.customerId || '—';
  const customerEmail = customer?.email || '—';
  const customerPhone = customer?.phone || '—';
  const mealTitle = payment?.adminFoodShareName || '—';

  const brandDisplay = stripeFieldOrUnavailable(
    cardExtras?.brand || payment?.paymentMethodBrand,
  );
  const last4Display = stripeFieldOrUnavailable(
    cardExtras?.last4 || payment?.paymentMethodLast4,
  );
  const expirationDisplay = stripeFieldOrUnavailable(cardExtras?.expiration);
  const fundingDisplay = stripeFieldOrUnavailable(cardExtras?.funding);
  const countryDisplay = stripeFieldOrUnavailable(cardExtras?.country);
  const methodDisplay = stripeFieldOrUnavailable(
    paymentMethodLabel ||
      payment?.paymentMethodLabel ||
      (payment?.paymentMethodBrand
        ? formatPaymentCard(payment)
        : null),
  );

  const onSendSupport = async () => {
    if (!payment) return;
    setSending(true);
    try {
      await sendPaymentCustomerSupportMessage({
        payment,
        customMessage: composerText,
        amountLabel,
        customerEmail: customer?.email,
      });
      setComposerText('');
      setComposerOpen(false);
      showSuccess('Message sent to customer inbox');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not send message'));
    } finally {
      setSending(false);
    }
  };

  const onSaveNotes = async () => {
    if (!id) return;
    setNotesSaving(true);
    try {
      await savePaymentInternalNotes(id, notesDraft);
      showSuccess('Internal notes saved');
    } catch (e) {
      showError(getReadableErrorMessageOr(e, 'Could not save notes'));
    } finally {
      setNotesSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <AdminHeader title="Payment Details" subtitle={id || 'Payment'} />
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 24 }} />
      ) : !payment ? (
        <View style={styles.card}>
          <Text style={styles.title}>Payment not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.amount}>{amountLabel}</Text>
            <Text style={styles.cardLabel}>{formatPaymentCard(payment)}</Text>
            <Text style={styles.status}>
              {formatPaymentStatusLabel(payment.status)}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Customer</Text>
            {customer?.photoURL ? (
              <Image
                source={{ uri: customer.photoURL }}
                style={styles.avatar}
              />
            ) : null}
            <DetailRow label="Customer name" value={customerName} />
            <DetailRow label="Customer email" value={customerEmail} />
            <DetailRow label="Customer UID" value={payment.customerId || '—'} />
            <DetailRow label="Customer phone" value={customerPhone} />
            <DetailRow
              label="Profile photo"
              value={customer?.photoURL ? 'Available' : '—'}
            />
          </View>

          {payment.adminFoodShareImage ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Food Card</Text>
              <Image
                source={{ uri: payment.adminFoodShareImage }}
                style={styles.foodImage}
              />
              <Text style={styles.foodName}>
                {payment.adminFoodShareName ?? 'Shared meal'}
              </Text>
              {payment.adminFoodShareId ? (
                <Pressable
                  onPress={() =>
                    router.push(
                      adminRoutes.foodCard(payment.adminFoodShareId!) as never,
                    )
                  }
                >
                  <Text style={styles.link}>
                    Open food card slot {payment.adminFoodShareId}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : payment.adminFoodShareId ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Food Card</Text>
              <Pressable
                onPress={() =>
                  router.push(
                    adminRoutes.foodCard(payment.adminFoodShareId!) as never,
                  )
                }
              >
                <Text style={styles.link}>
                  Open food card slot {payment.adminFoodShareId}
                </Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <DetailRow label="Restaurant name" value={payment.restaurantName ?? '—'} />
            <DetailRow label="Meal title" value={mealTitle} />
            <DetailRow label="Order ID" value={payment.orderId ?? '—'} />
            <DetailRow label="Match ID" value={payment.matchId ?? '—'} />
            <DetailRow
              label="Payment Intent ID"
              value={payment.stripePaymentIntentId || '—'}
            />
            <DetailRow
              label="Charge ID"
              value={payment.stripeChargeId ?? '—'}
            />
            <DetailRow label="Payment method" value={methodDisplay} />
            <DetailRow label="Amount paid" value={amountLabel} />
            <DetailRow
              label="Platform fee"
              value={formatCurrency(payment.platformFee, payment.currency)}
            />
            <DetailRow
              label="Stripe fee"
              value={formatCurrency(payment.stripeFee, payment.currency)}
            />
            <DetailRow
              label="Net revenue"
              value={formatCurrency(payment.netRevenue, payment.currency)}
            />
            <DetailRow
              label="Currency"
              value={(payment.currency || '—').toUpperCase()}
            />
            <DetailRow
              label="Payment status"
              value={formatPaymentStatusLabel(payment.status)}
            />
            <DetailRow
              label="Refund status"
              value={refundStatus || (payment.status === 'refunded' ? 'Refunded' : '—')}
            />
            <DetailRow label="Created date" value={created} />
            <DetailRow label="Paid date" value={paid} />
            <DetailRow label="Updated date" value={updated} />
            <DetailRow
              label="Order status"
              value={orderInfo?.orderStatus ?? '—'}
            />
            <DetailRow
              label="Delivery status"
              value={orderInfo?.deliveryStatus ?? '—'}
            />
            {payment.receiptUrl ? (
              <DetailRow
                label="Receipt link"
                value="Open Stripe receipt"
                onPress={() => void Linking.openURL(payment.receiptUrl!)}
              />
            ) : (
              <DetailRow label="Receipt link" value="—" />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Card (Stripe)</Text>
            <DetailRow label="Card brand" value={brandDisplay} />
            <DetailRow label="Last 4 digits" value={last4Display} />
            <DetailRow label="Expiration" value={expirationDisplay} />
            <DetailRow label="Funding" value={fundingDisplay} />
            <DetailRow label="Country" value={countryDisplay} />
            <Text style={styles.hint}>
              Missing fields show “Not available from Stripe.” — never fabricated.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Order context</Text>
            <DetailRow label="Food amount" value={formatCurrency(payment.foodAmount, payment.currency)} />
            <DetailRow label="Delivery fee" value={formatCurrency(payment.deliveryFee, payment.currency)} />
            <DetailRow label="Partner" value={payment.partnerName ?? payment.partnerId ?? '—'} />
            <DetailRow label="Driver" value={payment.driverName ?? payment.driverId ?? '—'} />
            <DetailRow
              label="Source"
              value={payment.source === 'food_share' ? 'Food share' : 'Marketplace'}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Payment timeline</Text>
            {timeline.map((ev) => (
              <View key={ev.id} style={styles.timelineRow}>
                <View
                  style={[
                    styles.timelineDot,
                    ev.active ? styles.timelineDotOn : styles.timelineDotOff,
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.timelineLabel,
                      !ev.active && styles.timelineLabelMuted,
                    ]}
                  >
                    {ev.label}
                  </Text>
                  <Text style={styles.timelineTime}>
                    {ev.active ? formatWhen(ev.atMs) : 'Not reached'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Customer Support</Text>
            <Text style={styles.hint}>
              Opens a composer with order, payment, restaurant, amount, date,
              time, match, and customer name attached automatically.
            </Text>
            <Pressable
              style={styles.actionBtn}
              onPress={() => setComposerOpen(true)}
            >
              <Text style={styles.actionBtnText}>Contact Customer</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Conversation History</Text>
            {history.length === 0 ? (
              <Text style={styles.hint}>No messages yet.</Text>
            ) : (
              history.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    m.sender === 'admin' ? styles.bubbleAdmin : styles.bubbleCustomer,
                  ]}
                >
                  <Text style={styles.bubbleMeta}>
                    {m.sender === 'admin' ? 'Admin' : 'Customer'} ·{' '}
                    {formatWhen(m.createdAtMs)}
                  </Text>
                  <Text style={styles.bubbleBody}>{m.body}</Text>
                  <Text style={styles.bubbleStatus}>
                    {m.delivered ? 'Delivered' : 'Pending'} ·{' '}
                    {m.read ? 'Read' : 'Unread'}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Internal Notes</Text>
            <Text style={styles.hint}>
              Visible only to Admin. Examples: Customer requested refund · Waiting
              for restaurant · Fraud review · Driver contacted · Escalated.
            </Text>
            <AppTextInput
              style={styles.notesInput}
              value={notesDraft}
              onChangeText={setNotesDraft}
              multiline
              placeholder="Add internal notes…"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.metaLine}>
              Created by: {notes?.createdByName ?? notes?.createdBy ?? '—'}
            </Text>
            <Text style={styles.metaLine}>
              Created: {formatWhen(notes?.createdAtMs)}
            </Text>
            <Text style={styles.metaLine}>
              Last edited by: {notes?.updatedByName ?? notes?.updatedBy ?? '—'}
            </Text>
            <Text style={styles.metaLine}>
              Last edited: {formatWhen(notes?.updatedAtMs)}
            </Text>
            <Pressable
              style={[styles.actionBtn, notesSaving && { opacity: 0.6 }]}
              onPress={() => void onSaveNotes()}
              disabled={notesSaving}
            >
              <Text style={styles.actionBtnText}>
                {notesSaving ? 'Saving…' : 'Save notes'}
              </Text>
            </Pressable>
          </View>

          {payment.orderId ? (
            <Pressable
              style={styles.actionBtn}
              onPress={() =>
                router.push(adminRoutes.order(payment.orderId!) as never)
              }
            >
              <Text style={styles.actionBtnText}>Open order</Text>
            </Pressable>
          ) : null}
          {payment.matchId ? (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() =>
                router.push(
                  USER_ROUTES.foodShareMatch(payment.matchId!) as never,
                )
              }
            >
              <Text style={styles.actionBtnTextSecondary}>Open match</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={composerOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.sectionTitle}>Contact Customer</Text>
            <Text style={styles.hint}>
              Context attached automatically. Type your message only.
            </Text>
            <View style={styles.contextBox}>
              <Text style={styles.contextLine}>Customer: {customerName}</Text>
              <Text style={styles.contextLine}>
                Order ID: {payment?.orderId ?? '—'}
              </Text>
              <Text style={styles.contextLine}>
                Payment ID: {payment?.id ?? '—'}
              </Text>
              <Text style={styles.contextLine}>
                Match ID: {payment?.matchId ?? '—'}
              </Text>
              <Text style={styles.contextLine}>
                Restaurant: {payment?.restaurantName ?? '—'}
              </Text>
              <Text style={styles.contextLine}>Amount: {amountLabel}</Text>
              <Text style={styles.contextLine}>Date: {created}</Text>
            </View>
            <AppTextInput
              style={styles.composerInput}
              value={composerText}
              onChangeText={setComposerText}
              multiline
              placeholder="Write your message to the customer…"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => !sending && setComposerOpen(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.actionBtn, styles.sendBtn, sending && { opacity: 0.6 }]}
                onPress={() => void onSendSupport()}
                disabled={sending}
              >
                <Text style={styles.actionBtnText}>
                  {sending ? 'Sending…' : 'Send'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { ...adminCardShell },
  hero: { ...adminCardShell, alignItems: 'center', paddingVertical: 24 },
  amount: { fontSize: 34, fontWeight: '800', color: COLORS.text },
  cardLabel: { marginTop: 6, fontSize: 16, fontWeight: '600', color: COLORS.text },
  status: { marginTop: 8, fontSize: 15, fontWeight: '700', color: COLORS.primary },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 10,
  },
  detailRow: { marginBottom: 10 },
  detailLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  detailValue: { fontSize: 15, color: COLORS.text },
  link: { color: COLORS.primary, fontWeight: '600' },
  foodImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 10 },
  foodName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 12,
    backgroundColor: COLORS.border,
  },
  hint: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 12,
    lineHeight: 18,
  },
  metaLine: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  notesInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineDotOn: { backgroundColor: COLORS.primary },
  timelineDotOff: { backgroundColor: COLORS.border },
  timelineLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  timelineLabelMuted: { color: COLORS.textMuted, fontWeight: '600' },
  timelineTime: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  bubble: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
  },
  bubbleAdmin: {
    backgroundColor: 'rgba(168,85,247,0.12)',
    borderColor: 'rgba(168,85,247,0.35)',
  },
  bubbleCustomer: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
  },
  bubbleMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  bubbleBody: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  bubbleStatus: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  actionBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionBtnSecondary: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  actionBtnText: { color: COLORS.onPrimary, fontWeight: '800' },
  actionBtnTextSecondary: { color: COLORS.primary, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '90%',
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  contextBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: COLORS.background,
  },
  contextLine: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  composerInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    color: COLORS.text,
    backgroundColor: COLORS.background,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelText: { fontWeight: '700', color: COLORS.textMuted },
  sendBtn: { flex: 1 },
});
