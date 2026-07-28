import { AppTextInput } from '@/components/AppTextInput';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { getUserFriendlyError } from '@/services/errors';
import { showError, showSuccess } from '@/utils/toast';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export type DriverPayoutMethod = 'interac' | 'bank';

export type DriverWalletDetails = {
  payoutMethod: DriverPayoutMethod;
  /** Interac: full legal name */
  legalName: string;
  interacEmail: string;
  accountHolderName: string;
  bankName: string;
  institutionNumber: string;
  transitNumber: string;
  accountNumber: string;
};

export const EMPTY_DRIVER_WALLET: DriverWalletDetails = {
  payoutMethod: 'interac',
  legalName: '',
  interacEmail: '',
  accountHolderName: '',
  bankName: '',
  institutionNumber: '',
  transitNumber: '',
  accountNumber: '',
};

function parsePayoutMethod(raw: unknown): DriverPayoutMethod {
  return raw === 'bank' ? 'bank' : 'interac';
}

export function parseDriverWallet(raw: unknown): DriverWalletDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_DRIVER_WALLET };
  }
  const w = raw as Record<string, unknown>;
  const str = (key: string) =>
    typeof w[key] === 'string' ? (w[key] as string) : '';
  const legalName =
    str('legalName') || str('fullLegalName') || str('accountHolderName');
  return {
    payoutMethod: parsePayoutMethod(w.payoutMethod),
    legalName,
    interacEmail: str('interacEmail'),
    accountHolderName: str('accountHolderName') || legalName,
    bankName: str('bankName'),
    institutionNumber: str('institutionNumber'),
    transitNumber: str('transitNumber'),
    accountNumber: str('accountNumber'),
  };
}

async function ensureDriverWalletDoc(driverId: string): Promise<void> {
  const id = driverId.trim();
  if (!id) return;
  const ref = doc(db, 'drivers', id);
  const snap = await getDoc(ref);
  const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  const wallet = data.wallet;
  if (wallet != null && typeof wallet === 'object' && !Array.isArray(wallet)) {
    const w = wallet as Record<string, unknown>;
    if (w.payoutMethod === 'interac' || w.payoutMethod === 'bank') return;
    // Legacy wallet without method — default Interac, keep existing fields.
    await setDoc(
      ref,
      {
        wallet: {
          ...w,
          payoutMethod: 'interac',
          updatedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }
  await setDoc(
    ref,
    {
      wallet: {
        ...EMPTY_DRIVER_WALLET,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

type Props = {
  driverId: string | null | undefined;
};

/**
 * Canadian payout method selector for Driver Profile.
 * Always visible; defaults to Interac e-Transfer.
 */
export function DriverWalletCard({ driverId }: Props) {
  const uid = typeof driverId === 'string' ? driverId.trim() : '';
  const [draft, setDraft] = useState<DriverWalletDetails>({
    ...EMPTY_DRIVER_WALLET,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) {
      setDraft({ ...EMPTY_DRIVER_WALLET });
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      try {
        await ensureAuthReady();
        await ensureDriverWalletDoc(uid);
      } catch {
        /* Card still shows Interac defaults. */
      }
    })();

    const unsub = onSnapshot(
      doc(db, 'drivers', uid),
      (snap) => {
        if (cancelled) return;
        const data = snap.exists()
          ? (snap.data() as Record<string, unknown>)
          : {};
        setDraft(parseDriverWallet(data.wallet));
      },
      () => {
        if (!cancelled) setDraft({ ...EMPTY_DRIVER_WALLET });
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [uid]);

  const setField = useCallback(
    (key: keyof DriverWalletDetails, value: string) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const selectMethod = useCallback((method: DriverPayoutMethod) => {
    setDraft((prev) => ({ ...prev, payoutMethod: method }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!uid || saving) return;
    const authUid = auth.currentUser?.uid ?? '';
    if (!authUid || authUid !== uid) {
      showError('Sign in required to save payout details.');
      return;
    }
    setSaving(true);
    try {
      await ensureAuthReady();
      const method = draft.payoutMethod === 'bank' ? 'bank' : 'interac';
      await setDoc(
        doc(db, 'drivers', uid),
        {
          wallet: {
            payoutMethod: method,
            legalName: draft.legalName.trim(),
            interacEmail: draft.interacEmail.trim(),
            accountHolderName: draft.accountHolderName.trim(),
            bankName: draft.bankName.trim(),
            institutionNumber: draft.institutionNumber.trim(),
            transitNumber: draft.transitNumber.trim(),
            accountNumber: draft.accountNumber.trim(),
            updatedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      showSuccess('Payout details saved.');
    } catch (e) {
      showError(getUserFriendlyError(e));
    } finally {
      setSaving(false);
    }
  }, [draft, saving, uid]);

  const isInterac = draft.payoutMethod !== 'bank';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Driver Wallet</Text>
      <Text style={styles.subtitle}>
        Choose how you would like to receive your HalfOrder earnings.
      </Text>

      <Pressable
        style={[styles.methodBtn, isInterac && styles.methodBtnOn]}
        onPress={() => selectMethod('interac')}
        disabled={saving}
      >
        <Text style={[styles.methodTitle, isInterac && styles.methodTitleOn]}>
          🇨🇦 Interac e-Transfer (Recommended)
        </Text>
      </Pressable>

      <Pressable
        style={[styles.methodBtn, !isInterac && styles.methodBtnOn]}
        onPress={() => selectMethod('bank')}
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
            onChangeText={(t) => setField('interacEmail', t)}
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
            onChangeText={(t) => setField('legalName', t)}
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
            onChangeText={(t) => setField('accountHolderName', t)}
            placeholder="Full legal name"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!saving}
          />

          <Text style={styles.label}>Bank Name</Text>
          <AppTextInput
            style={styles.input}
            value={draft.bankName}
            onChangeText={(t) => setField('bankName', t)}
            placeholder="e.g. RBC, TD, Scotiabank"
            placeholderTextColor="#7D8493"
            autoCapitalize="words"
            editable={!saving}
          />

          <Text style={styles.label}>Institution Number</Text>
          <AppTextInput
            style={styles.input}
            value={draft.institutionNumber}
            onChangeText={(t) => setField('institutionNumber', t)}
            placeholder="3 digits"
            placeholderTextColor="#7D8493"
            keyboardType="number-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Transit Number</Text>
          <AppTextInput
            style={styles.input}
            value={draft.transitNumber}
            onChangeText={(t) => setField('transitNumber', t)}
            placeholder="5 digits"
            placeholderTextColor="#7D8493"
            keyboardType="number-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Account Number</Text>
          <AppTextInput
            style={styles.input}
            value={draft.accountNumber}
            onChangeText={(t) => setField('accountNumber', t)}
            placeholder="Account number"
            placeholderTextColor="#7D8493"
            keyboardType="number-pad"
            editable={!saving}
          />
        </View>
      )}

      <Pressable
        style={[styles.saveBtn, (saving || !uid) && styles.saveBtnDisabled]}
        disabled={saving || !uid}
        onPress={() => void handleSave()}
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
