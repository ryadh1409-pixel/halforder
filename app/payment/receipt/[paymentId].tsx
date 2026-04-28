import { getInvoiceByPaymentId, type InvoiceRecord } from '@/services/stripePayment';
import { showError } from '@/utils/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function asDateText(raw: unknown): string {
  const d = raw && typeof raw === 'object' && 'toDate' in raw
    ? (raw as { toDate: () => Date }).toDate()
    : new Date();
  return d.toLocaleString();
}

export default function ReceiptScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);

  useEffect(() => {
    if (!paymentId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    getInvoiceByPaymentId(paymentId)
      .then((result) => {
        if (!mounted) return;
        setInvoice(result);
      })
      .catch(() => {
        if (!mounted) return;
        setInvoice(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [paymentId]);

  async function onShareReceipt() {
    if (!invoice) return;
    try {
      await Share.share({
        title: `HalfOrder Receipt ${invoice.invoiceNumber}`,
        message: [
          `Invoice: ${invoice.invoiceNumber}`,
          `Meal: ${invoice.mealName ?? 'Shared meal'}`,
          `Subtotal: CAD $${invoice.subtotal.toFixed(2)}`,
          `HST (13%): CAD $${invoice.hst.toFixed(2)}`,
          `Total: CAD $${invoice.total.toFixed(2)}`,
        ].join('\n'),
      });
    } catch {
      showError('Could not share receipt.');
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

  if (!invoice) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centered}>
          <Text style={styles.empty}>Receipt not available yet. Please refresh shortly.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Payment Receipt</Text>
        <Text style={styles.subtitle}>Invoice generated successfully.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Invoice #</Text>
          <Text style={styles.value}>{invoice.invoiceNumber}</Text>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{asDateText(invoice.createdAt)}</Text>
          <Text style={styles.label}>Meal</Text>
          <Text style={styles.value}>{invoice.mealName ?? 'Shared meal'}</Text>
          <View style={styles.line}>
            <Text style={styles.meta}>Subtotal</Text>
            <Text style={styles.metaValue}>CAD ${invoice.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={styles.meta}>HST (13%)</Text>
            <Text style={styles.metaValue}>CAD ${invoice.hst.toFixed(2)}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.line}>
            <Text style={styles.total}>Total</Text>
            <Text style={styles.total}>CAD ${invoice.total.toFixed(2)}</Text>
          </View>
        </View>

        <Pressable style={styles.secondaryBtn} onPress={() => void onShareReceipt()}>
          <Text style={styles.secondaryText}>Share Receipt</Text>
        </Pressable>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace('/halforder/home' as never)}>
          <Text style={styles.primaryText}>Back to Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  empty: { color: '#64748B', fontWeight: '600', textAlign: 'center' },
  content: { padding: 16 },
  title: { fontSize: 30, fontWeight: '800', color: '#0F172A' },
  subtitle: { marginTop: 4, color: '#64748B', marginBottom: 12, fontWeight: '600' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  label: { marginTop: 8, color: '#64748B', fontSize: 12, fontWeight: '700' },
  value: { marginTop: 2, color: '#0F172A', fontSize: 15, fontWeight: '700' },
  line: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  meta: { color: '#64748B', fontWeight: '600' },
  metaValue: { color: '#334155', fontWeight: '700' },
  separator: { marginTop: 10, height: 1, backgroundColor: '#E2E8F0' },
  total: { marginTop: 8, color: '#0F172A', fontWeight: '800', fontSize: 16 },
  secondaryBtn: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  secondaryText: { color: '#334155', fontWeight: '700' },
  primaryBtn: { marginTop: 10, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0EA5E9' },
  primaryText: { color: '#FFFFFF', fontWeight: '800' },
});
