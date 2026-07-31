import {
  EMPTY_PAYOUT_WALLET,
  PayoutWalletForm,
  type PayoutMethod,
  type PayoutWalletDetails,
} from '@/components/payout/PayoutWalletForm';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { getUserFriendlyError } from '@/services/errors';
import { showError, showSuccess } from '@/utils/toast';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';

export type DriverPayoutMethod = PayoutMethod;
export type DriverWalletDetails = PayoutWalletDetails;
export const EMPTY_DRIVER_WALLET = EMPTY_PAYOUT_WALLET;

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

  return (
    <PayoutWalletForm
      title="Driver Wallet"
      draft={draft}
      saving={saving}
      canSave={Boolean(uid)}
      onSelectMethod={selectMethod}
      onChangeField={setField}
      onSave={() => void handleSave()}
    />
  );
}
