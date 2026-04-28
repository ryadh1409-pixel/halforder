import {
  CardField,
  PlatformPay,
  PlatformPayButton,
  useStripe,
} from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createPaymentIntentForOrder,
  finalizeOrderPayment,
  getPaymentOrderSummary,
  markPaymentFailed,
  subscribeMyPaymentHistory,
  type PaymentOrderSummary,
} from '@/services/stripePayment';
import { showError, showSuccess } from '@/utils/toast';

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const { confirmPayment } = useStripe();
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [summary, setSummary] = useState<PaymentOrderSummary | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [history, setHistory] = useState<
    Array<{ id: string; amount: number; status: string; orderId: string }>
  >([]);
  const fade = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    getPaymentOrderSummary(orderId)
      .then((data) => {
        if (!mounted) return;
        setSummary(data);
      })
      .catch(() => {
        if (!mounted) return;
        setSummary(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [orderId]);

  useEffect(() => {
    let mounted = true;
    void subscribeMyPaymentHistory()
      .then((rows) => {
        if (!mounted) return;
        setHistory(rows.slice(0, 4));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const payLabel = useMemo(() => {
    return summary ? `Pay CAD $${summary.totalAmount.toFixed(2)}` : 'Pay Now';
  }, [summary]);

  async function onPayNow() {
    if (!orderId || !summary) return;
    if (!cardComplete) {
      showError('Please complete your card details.');
      return;
    }
    if (
      !summary.chargesEnabled ||
      !summary.payoutsEnabled ||
      !summary.restaurantStripeAccountId
    ) {
      showError('Restaurant payouts are not enabled yet.');
      return;
    }
    setPaying(true);
    let paymentId: string | null = null;
    try {
      const intent = await createPaymentIntentForOrder({
        orderId,
        amountSubtotal: summary.amountSubtotal,
      });
      paymentId = intent.paymentId;
      const confirmed = await confirmPayment(intent.clientSecret, {
        paymentMethodType: 'Card',
      });
      if (confirmed.error) {
        await markPaymentFailed(intent.paymentId);
        showError(confirmed.error.message ?? 'Payment failed.');
        return;
      }
      const paymentIntentId = confirmed.paymentIntent?.id ?? intent.paymentIntentId;
      await finalizeOrderPayment({
        orderId,
        paymentId: intent.paymentId,
        paymentIntentId,
      });
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }).start();
      showSuccess('Payment successful');
      setTimeout(() => {
        router.replace(`/payment/receipt/${intent.paymentId}` as never);
      }, 600);
    } catch (error) {
      if (paymentId) await markPaymentFailed(paymentId).catch(() => {});
      showError('Could not process payment. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  async function onPayWithAppleOrGoogle() {
    if (!summary || !orderId) return;
    const supported = await PlatformPay.isPlatformPaySupported();
    if (!supported) {
      showError('Apple Pay / Google Pay is not available on this device.');
      return;
    }
    setPaying(true);
    try {
      const intent = await createPaymentIntentForOrder({
        orderId,
        amountSubtotal: summary.amountSubtotal,
      });
      const result = await PlatformPay.confirmPlatformPayPayment(intent.clientSecret, {
        applePay: {
          cartItems: [
            { label: 'HalfOrder Subtotal', amount: summary.amountSubtotal.toFixed(2), paymentType: PlatformPay.PaymentType.Immediate },
            { label: 'HST (13%)', amount: summary.hstAmount.toFixed(2), paymentType: PlatformPay.PaymentType.Immediate },
            { label: 'HalfOrder', amount: summary.totalAmount.toFixed(2), paymentType: PlatformPay.PaymentType.Immediate },
          ],
          merchantCountryCode: 'CA',
          currencyCode: 'CAD',
        },
        googlePay: {
          testEnv: true,
          merchantName: 'HalfOrder',
          merchantCountryCode: 'CA',
          currencyCode: 'CAD',
        },
      });
      if (result.error) {
        await markPaymentFailed(intent.paymentId);
        showError(result.error.message ?? 'Platform Pay failed.');
        return;
      }
      await finalizeOrderPayment({
        orderId,
        paymentId: intent.paymentId,
        paymentIntentId: intent.paymentIntentId,
      });
      showSuccess('Payment successful');
      router.replace(`/payment/receipt/${intent.paymentId}` as never);
    } catch {
      showError('Could not complete Apple Pay / Google Pay payment.');
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0EA5E9" />
        </View>
      </SafeAreaView>
    );
  }

  if (!summary) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.empty}>This order is not available for payment.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Checkout</Text>
        <Text style={styles.subtitle}>Securely pay with Stripe.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order Summary</Text>
          <Text style={styles.mealName}>{summary.mealName}</Text>
          <View style={styles.line}>
            <Text style={styles.meta}>Subtotal</Text>
            <Text style={styles.metaValue}>CAD ${summary.amountSubtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.meta}>HST (13%)</Text>
            <Text style={styles.metaValue}>CAD ${summary.hstAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.meta}>Platform fee (7%, included in subtotal)</Text>
            <Text style={styles.metaValue}>CAD ${summary.platformFee.toFixed(2)}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.line}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>CAD ${summary.totalAmount.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Method</Text>
          <CardField
            postalCodeEnabled
            style={styles.cardField}
            cardStyle={{
              backgroundColor: '#FFFFFF',
              textColor: '#0F172A',
              borderColor: '#CBD5E1',
              borderWidth: 1,
              borderRadius: 12,
            }}
            onCardChange={(details) => setCardComplete(details.complete)}
          />
        </View>

        <Pressable style={[styles.payButton, paying && styles.payButtonDisabled]} onPress={() => void onPayNow()} disabled={paying}>
          {paying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.payText}>{payLabel}</Text>
          )}
        </Pressable>
        <PlatformPayButton
          style={styles.platformPay}
          type={PlatformPay.ButtonType.Buy}
          appearance={PlatformPay.ButtonStyle.Black}
          onPress={() => void onPayWithAppleOrGoogle()}
          disabled={paying}
        />

        <Animated.View style={[styles.successCard, { opacity: fade }]}>
          <Text style={styles.successTitle}>Payment Complete</Text>
          <Text style={styles.successBody}>Your order is confirmed and moving to delivery tracking.</Text>
        </Animated.View>
        {!summary.chargesEnabled || !summary.payoutsEnabled ? (
          <View style={styles.warningCard}>
            <Text style={styles.warningTitle}>Restaurant payouts pending</Text>
            <Text style={styles.warningText}>
              This restaurant has not completed Stripe onboarding yet.
            </Text>
          </View>
        ) : null}

        {history.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Transactions</Text>
            {history.map((item) => (
              <View key={item.id} style={styles.historyRow}>
                <Text style={styles.historyMeta}>Order {item.orderId.slice(0, 8)}</Text>
                <Text style={styles.historyMeta}>${item.amount.toFixed(2)} · {item.status}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 16, paddingBottom: 28 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#64748B', fontWeight: '600', marginBottom: 12 },
  empty: { color: '#64748B', fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', marginBottom: 8 },
  mealName: { color: '#1E293B', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  meta: { color: '#64748B', fontWeight: '600' },
  metaValue: { color: '#334155', fontWeight: '700' },
  separator: { height: 1, backgroundColor: '#E2E8F0', marginTop: 10 },
  totalLabel: { color: '#0F172A', fontWeight: '800', fontSize: 15 },
  totalValue: { color: '#0F172A', fontWeight: '800', fontSize: 18 },
  cardField: { width: '100%', height: 52 },
  payButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#0EA5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  payButtonDisabled: { opacity: 0.8 },
  payText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  platformPay: { height: 44, marginTop: 10 },
  successCard: {
    marginTop: 14,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#86EFAC',
    padding: 12,
  },
  successTitle: { color: '#166534', fontWeight: '800', fontSize: 15 },
  successBody: { marginTop: 4, color: '#166534', fontWeight: '600', fontSize: 12 },
  warningCard: {
    marginTop: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
  },
  warningTitle: { color: '#92400E', fontWeight: '800', fontSize: 14 },
  warningText: { marginTop: 4, color: '#B45309', fontWeight: '600', fontSize: 12 },
  historyRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyMeta: { color: '#475569', fontWeight: '600', fontSize: 12 },
});
