import { AppTextInput } from '@/components/AppTextInput';
import { saveRestaurantInteracEmail } from '@/services/restaurantPayoutMethods';
import { getUserFriendlyError } from '@/services/errors';
import { showError, showSuccess } from '@/utils/toast';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const PRIMARY = '#16a34a';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  restaurantId: string;
  interacEmail: string;
  stripeConnected: boolean;
  stripeLoading: boolean;
  /** @deprecated Connect now opens the Bank Account screen. Kept for call-site compat. */
  onConnectStripe?: () => void;
};

export function RestaurantPayoutMethods({
  restaurantId,
  interacEmail,
  stripeConnected,
  stripeLoading,
}: Props) {
  const router = useRouter();
  const [emailDraft, setEmailDraft] = useState(interacEmail);
  const [savingInterac, setSavingInterac] = useState(false);

  useEffect(() => {
    setEmailDraft(interacEmail);
  }, [interacEmail]);

  const normalizedDraft = emailDraft.trim().toLowerCase();
  const normalizedSaved = interacEmail.trim().toLowerCase();
  const isDirty = normalizedDraft !== normalizedSaved;
  const buttonLabel = normalizedSaved ? 'Update Email' : 'Save Email';

  const saveInterac = useCallback(async () => {
    if (savingInterac || !restaurantId) return;
    if (!normalizedDraft) {
      showError('Enter your Interac e-Transfer email.');
      return;
    }
    if (!EMAIL_RE.test(normalizedDraft)) {
      showError('Enter a valid email address.');
      return;
    }

    setSavingInterac(true);
    try {
      await saveRestaurantInteracEmail(restaurantId, normalizedDraft);
      showSuccess('Interac e-Transfer email saved.');
    } catch (error) {
      showError(getUserFriendlyError(error));
    } finally {
      setSavingInterac(false);
    }
  }, [normalizedDraft, restaurantId, savingInterac]);

  const saveDisabled = useMemo(
    () => savingInterac || !restaurantId || !isDirty,
    [isDirty, restaurantId, savingInterac],
  );

  const openBankAccount = useCallback(() => {
    router.push('/(host)/bank-account' as never);
  }, [router]);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Payout Methods</Text>
      <Text style={styles.sectionSubtitle}>
        Configure one or both ways to receive your restaurant payouts.
      </Text>

      <View style={styles.methodCard}>
        <View style={styles.titleRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="business-outline" size={21} color={PRIMARY} />
          </View>
          <View style={styles.titleCopy}>
            <Text style={styles.methodTitle}>Bank Account</Text>
            <Text style={styles.methodSubtitle}>
              Securely manage bank payouts through Stripe.
            </Text>
          </View>
        </View>

        {stripeConnected ? (
          <>
            <View style={styles.connectedRow}>
              <Ionicons name="checkmark-circle" size={20} color="#15803d" />
              <Text style={styles.connectedText}>Stripe Connected</Text>
            </View>
            <Pressable
              onPress={openBankAccount}
              style={({ pressed }) => [
                styles.stripeButton,
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="View bank account details"
            >
              <Text style={styles.stripeButtonText}>View Bank Account</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={openBankAccount}
            disabled={stripeLoading}
            style={({ pressed }) => [
              styles.stripeButton,
              pressed && styles.buttonPressed,
              stripeLoading && styles.buttonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Connect bank account with Stripe"
          >
            {stripeLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.stripeButtonText}>Connect Bank Account</Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.methodCard}>
        <View style={styles.titleRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="mail-outline" size={21} color={PRIMARY} />
          </View>
          <View style={styles.titleCopy}>
            <Text style={styles.methodTitle}>Interac e-Transfer</Text>
            <Text style={styles.methodSubtitle}>
              Receive payouts using your Interac e-Transfer email.
            </Text>
          </View>
        </View>

        <Text style={styles.label}>Email</Text>
        <AppTextInput
          style={styles.input}
          value={emailDraft}
          onChangeText={setEmailDraft}
          placeholder="name@email.com"
          placeholderTextColor="#7D8493"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!savingInterac}
        />

        <Pressable
          onPress={() => void saveInterac()}
          disabled={saveDisabled}
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.buttonPressed,
            saveDisabled && styles.buttonDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${buttonLabel} for Interac e-Transfer`}
        >
          {savingInterac ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>{buttonLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  sectionSubtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#64748b',
  },
  methodCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,163,74,0.10)',
  },
  titleCopy: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  methodSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#64748b',
  },
  label: {
    marginTop: 16,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#B7BDC9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#171923',
    backgroundColor: '#fafafa',
  },
  stripeButton: {
    minHeight: 48,
    marginTop: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#635BFF',
  },
  stripeButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  connectedRow: {
    minHeight: 48,
    marginTop: 16,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(22,163,74,0.10)',
  },
  connectedText: {
    color: '#15803d',
    fontSize: 15,
    fontWeight: '700',
  },
  saveButton: {
    minHeight: 48,
    marginTop: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
