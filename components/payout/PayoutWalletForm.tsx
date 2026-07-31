import { AppTextInput } from '@/components/AppTextInput';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type PayoutMethod = 'interac' | 'bank';

export type PayoutWalletDetails = {
  payoutMethod: PayoutMethod;
  legalName: string;
  interacEmail: string;
  accountHolderName: string;
  bankName: string;
  institutionNumber: string;
  transitNumber: string;
  accountNumber: string;
};

export const EMPTY_PAYOUT_WALLET: PayoutWalletDetails = {
  payoutMethod: 'interac',
  legalName: '',
  interacEmail: '',
  accountHolderName: '',
  bankName: '',
  institutionNumber: '',
  transitNumber: '',
  accountNumber: '',
};

type Props = {
  title: string;
  draft: PayoutWalletDetails;
  saving: boolean;
  canSave: boolean;
  onSelectMethod: (method: PayoutMethod) => void;
  onChangeField: (key: keyof PayoutWalletDetails, value: string) => void;
  onSave: () => void;
};

/**
 * Exact Driver Wallet payout form UI (layout + styles).
 * Data/save wiring is provided by the caller (Driver or Restaurant).
 */
export function PayoutWalletForm({
  title,
  draft,
  saving,
  canSave,
  onSelectMethod,
  onChangeField,
  onSave,
}: Props) {
  const isInterac = draft.payoutMethod !== 'bank';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>
        Choose how you would like to receive your HalfOrder earnings.
      </Text>

      <Pressable
        style={[styles.methodBtn, isInterac && styles.methodBtnOn]}
        onPress={() => onSelectMethod('interac')}
        disabled={saving}
      >
        <Text style={[styles.methodTitle, isInterac && styles.methodTitleOn]}>
          🇨🇦 Interac e-Transfer (Recommended)
        </Text>
      </Pressable>

      <Pressable
        style={[styles.methodBtn, !isInterac && styles.methodBtnOn]}
        onPress={() => onSelectMethod('bank')}
        disabled={saving}
      >
        <Text style={[styles.methodTitle, !isInterac && styles.methodTitleOn]}>
          Bank Transfer
        </Text>
      </Pressable>

      {isInterac ? (
        <View style={styles.fields}>
          <Text style={styles.label}>Interac e-Transfer Email</Text>
          <AppTextInput
            style={styles.input}
            value={draft.interacEmail}
            onChangeText={(t) => onChangeField('interacEmail', t)}
            placeholder="name@email.com"
            placeholderTextColor="#7D8493"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!saving}
          />

          <Text style={styles.label}>Full Legal Name</Text>
          <AppTextInput
            style={styles.input}
            value={draft.legalName}
            onChangeText={(t) => onChangeField('legalName', t)}
            placeholder="Name on your bank account"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!saving}
          />
        </View>
      ) : (
        <View style={styles.fields}>
          <Text style={styles.label}>Account Holder Name</Text>
          <AppTextInput
            style={styles.input}
            value={draft.accountHolderName}
            onChangeText={(t) => onChangeField('accountHolderName', t)}
            placeholder="Full legal name"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!saving}
          />

          <Text style={styles.label}>Bank Name</Text>
          <AppTextInput
            style={styles.input}
            value={draft.bankName}
            onChangeText={(t) => onChangeField('bankName', t)}
            placeholder="e.g. RBC, TD, Scotiabank"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!saving}
          />

          <Text style={styles.label}>Institution Number</Text>
          <AppTextInput
            style={styles.input}
            value={draft.institutionNumber}
            onChangeText={(t) => onChangeField('institutionNumber', t)}
            placeholder="3 digits"
            placeholderTextColor="#7D8493"
            keyboardType="number-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Transit Number</Text>
          <AppTextInput
            style={styles.input}
            value={draft.transitNumber}
            onChangeText={(t) => onChangeField('transitNumber', t)}
            placeholder="5 digits"
            placeholderTextColor="#7D8493"
            keyboardType="number-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Account Number</Text>
          <AppTextInput
            style={styles.input}
            value={draft.accountNumber}
            onChangeText={(t) => onChangeField('accountNumber', t)}
            placeholder="Account number"
            placeholderTextColor="#7D8493"
            keyboardType="number-pad"
            editable={!saving}
          />
        </View>
      )}

      <Pressable
        style={[styles.saveBtn, (saving || !canSave) && styles.saveBtnDisabled]}
        disabled={saving || !canSave}
        onPress={onSave}
      >
        {saving ? (
          <ActivityIndicator color="#052e1b" />
        ) : (
          <Text style={styles.saveBtnText}>Save Payout Details</Text>
        )}
      </Pressable>
    </View>
  );
}

/** Exact styles from the original Driver Wallet card. */
const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginBottom: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#22223A',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    fontWeight: '600',
    color: '#7D8493',
    lineHeight: 18,
  },
  methodBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#1a1a2e',
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  methodBtnOn: {
    borderColor: 'rgba(0, 200, 83, 0.55)',
    backgroundColor: 'rgba(0, 200, 83, 0.12)',
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#B7BDC9',
  },
  methodTitleOn: {
    color: '#FFFFFF',
  },
  fields: {
    marginTop: 6,
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#7D8493',
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 16,
    alignSelf: 'stretch',
    height: 48,
    borderRadius: 12,
    backgroundColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#052e1b', fontWeight: '800', fontSize: 15 },
});
