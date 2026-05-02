import { CardField, useStripeWrapper } from '../../services/stripe';
import { createPaymentIntent } from '../../services/stripePayment';
import { showError, showSuccess } from '../../utils/toast';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PaymentScreen() {
  const { confirmPayment } = useStripeWrapper();
  const [loading, setLoading] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const amount = 1200;
  const amountLabel = useMemo(() => `$${(amount / 100).toFixed(2)}`, [amount]);

  async function handlePay() {
    if (!cardComplete) {
      showError('Please enter complete card details.');
      return;
    }

    setLoading(true);
    try {
      const clientSecret = await createPaymentIntent(amount);
      const result = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
      });
      if (result.error) {
        throw new Error(result.error.message || 'Payment failed, try again.');
      }

      showSuccess('Payment successful');
    } catch (error) {
      console.log('[payment] failed', error);
      showError(error instanceof Error ? error.message : 'Payment failed, try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Secure Stripe Payment</Text>
        <Text style={styles.subtitle}>Test card: 4242 4242 4242 4242</Text>
        <CardField
          postalCodeEnabled
          placeholders={{ number: '4242 4242 4242 4242' }}
          cardStyle={{
            backgroundColor: '#FFFFFF',
            textColor: '#0F172A',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderRadius: 12,
          }}
          style={styles.cardField}
          onCardChange={(details) => {
            setCardComplete(Boolean(details.complete));
          }}
        />
        <Pressable
          style={[styles.payButton, loading ? styles.disabled : null]}
          disabled={loading || !cardComplete}
          onPress={handlePay}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.payText}>Pay {amountLabel}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { flex: 1, padding: 16, justifyContent: 'center' },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#64748B', marginTop: 8, marginBottom: 18, fontWeight: '600' },
  cardField: {
    width: '100%',
    height: 52,
    marginBottom: 16,
  },
  payButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
