import { AdminHeader } from '@/components/admin/AdminHeader';
import { adminRoutes } from '@/constants/adminRoutes';
import { adminCardShell, adminColors as COLORS } from '@/constants/adminTheme';
import { USER_ROUTES } from '@/lib/navigationPaths';
import {
  fetchAdminPaymentTransactions,
  formatCurrency,
  formatPaymentCard,
  formatPaymentStatusLabel,
} from '@/services/adminPaymentCenter';
import type { AdminPaymentTransaction } from '@/types/adminPaymentTransaction';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
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

export default function AdminPaymentDetailScreen() {
  const router = useRouter();
  const { paymentId } = useLocalSearchParams<{ paymentId?: string }>();
  const id = typeof paymentId === 'string' ? decodeURIComponent(paymentId) : '';
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<AdminPaymentTransaction | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const rows = await fetchAdminPaymentTransactions();
      if (cancelled) return;
      setPayment(rows.find((row) => row.id === id) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const created = useMemo(() => {
    if (!payment?.createdAtMs) return '—';
    return new Date(payment.createdAtMs).toLocaleString();
  }, [payment?.createdAtMs]);

  const paid = useMemo(() => {
    if (!payment?.paidAtMs) return '—';
    return new Date(payment.paidAtMs).toLocaleString();
  }, [payment?.paidAtMs]);

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
            <Text style={styles.amount}>
              {formatCurrency(payment.amount, payment.currency)}
            </Text>
            <Text style={styles.cardLabel}>{formatPaymentCard(payment)}</Text>
            <Text style={styles.status}>{formatPaymentStatusLabel(payment.status)}</Text>
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
                    router.push(adminRoutes.foodCard(payment.adminFoodShareId!) as never)
                  }
                >
                  <Text style={styles.link}>Open food card slot {payment.adminFoodShareId}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : payment.adminFoodShareId ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Food Card</Text>
              <Pressable
                onPress={() =>
                  router.push(adminRoutes.foodCard(payment.adminFoodShareId!) as never)
                }
              >
                <Text style={styles.link}>Open food card slot {payment.adminFoodShareId}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Stripe</Text>
            <DetailRow label="Payment Intent" value={payment.stripePaymentIntentId} />
            <DetailRow label="Charge ID" value={payment.stripeChargeId ?? '—'} />
            <DetailRow
              label="Card"
              value={formatPaymentCard(payment)}
            />
            {payment.receiptUrl ? (
              <DetailRow
                label="Receipt"
                value="Open Stripe receipt"
                onPress={() => void Linking.openURL(payment.receiptUrl!)}
              />
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Order context</Text>
            <DetailRow label="Order ID" value={payment.orderId ?? '—'} />
            {payment.matchId ? (
              <DetailRow
                label="Match"
                value={payment.matchId}
                onPress={() =>
                  router.push(USER_ROUTES.foodShareMatch(payment.matchId!) as never)
                }
              />
            ) : (
              <DetailRow label="Match ID" value="—" />
            )}
            <DetailRow label="Restaurant" value={payment.restaurantName ?? '—'} />
            <DetailRow label="Food amount" value={formatCurrency(payment.foodAmount, payment.currency)} />
            <DetailRow label="Delivery fee" value={formatCurrency(payment.deliveryFee, payment.currency)} />
            <DetailRow label="Platform fee" value={formatCurrency(payment.platformFee, payment.currency)} />
            <DetailRow label="Stripe fee" value={formatCurrency(payment.stripeFee, payment.currency)} />
            <DetailRow label="Net revenue" value={formatCurrency(payment.netRevenue, payment.currency)} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>People</Text>
            <DetailRow label="Customer" value={payment.customerName ?? payment.customerId} />
            <DetailRow label="Partner" value={payment.partnerName ?? payment.partnerId ?? '—'} />
            <DetailRow label="Driver" value={payment.driverName ?? payment.driverId ?? '—'} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            <DetailRow label="Created" value={created} />
            <DetailRow label="Paid" value={paid} />
            <DetailRow label="Source" value={payment.source === 'food_share' ? 'Food share' : 'Marketplace'} />
          </View>

          {payment.orderId ? (
            <Pressable
              style={styles.actionBtn}
              onPress={() => router.push(adminRoutes.order(payment.orderId!) as never)}
            >
              <Text style={styles.actionBtnText}>Open order</Text>
            </Pressable>
          ) : null}
          {payment.matchId ? (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnSecondary]}
              onPress={() =>
                router.push(USER_ROUTES.foodShareMatch(payment.matchId!) as never)
              }
            >
              <Text style={styles.actionBtnTextSecondary}>Open match</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
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
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  detailRow: { marginBottom: 10 },
  detailLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  detailValue: { fontSize: 15, color: COLORS.text },
  link: { color: COLORS.primary, fontWeight: '600' },
  foodImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 10 },
  foodName: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
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
});
