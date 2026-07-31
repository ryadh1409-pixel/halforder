/**
 * Restaurant/Host payout — same UI as Driver Wallet (`PayoutWalletForm`).
 * Loads/saves restaurant payout fields on `restaurants/{uid}` only.
 * Old Stripe / white Interac cards removed.
 */
import {
  EMPTY_PAYOUT_WALLET,
  PayoutWalletForm,
  type PayoutMethod,
  type PayoutWalletDetails,
} from '@/components/payout/PayoutWalletForm';
import { auth, db, ensureAuthReady } from '@/services/firebase';
import { getUserFriendlyError } from '@/services/errors';
import { readRestaurantInteracEmail } from '@/services/restaurantPayoutMethods';
import { showError, showSuccess } from '@/utils/toast';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useCallback, useEffect, useState } from 'react';

type Props = {
  restaurantId: string;
  /** Kept for HostDashboard call-site compatibility (unused). */
  interacEmail?: string;
  /** Kept for HostDashboard call-site compatibility (unused). */
  stripeConnected?: boolean;
  /** Kept for HostDashboard call-site compatibility (unused). */
  stripeLoading?: boolean;
  /** @deprecated Unused — Stripe Connect cards removed. */
  onConnectStripe?: () => void;
};

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseRestaurantPayout(
  data: Record<string, unknown> | undefined,
): PayoutWalletDetails {
  if (!data) return { ...EMPTY_PAYOUT_WALLET };

  const bankDetails =
    data.bankDetails &&
    typeof data.bankDetails === 'object' &&
    !Array.isArray(data.bankDetails)
      ? (data.bankDetails as Record<string, unknown>)
      : {};
  const payoutMethods =
    data.payoutMethods &&
    typeof data.payoutMethods === 'object' &&
    !Array.isArray(data.payoutMethods)
      ? (data.payoutMethods as Record<string, unknown>)
      : {};

  const methodRaw =
    bankDetails.payoutMethod ?? payoutMethods.payoutMethod ?? data.payoutMethod;
  const payoutMethod: PayoutMethod = methodRaw === 'bank' ? 'bank' : 'interac';

  const legalName =
    asString(bankDetails.legalName) ||
    asString(bankDetails.accountName) ||
    asString(bankDetails.accountHolderName);
  const accountHolderName =
    asString(bankDetails.accountHolderName) ||
    asString(bankDetails.accountName) ||
    legalName;

  return {
    payoutMethod,
    legalName,
    interacEmail:
      readRestaurantInteracEmail(data) ||
      asString(bankDetails.interacEmail) ||
      asString(payoutMethods.interacEmail),
    accountHolderName,
    bankName: asString(bankDetails.bankName),
    institutionNumber: asString(bankDetails.institutionNumber),
    transitNumber: asString(bankDetails.transitNumber),
    accountNumber:
      asString(bankDetails.accountNumber) || asString(bankDetails.iban),
  };
}

export function RestaurantPayoutMethods({ restaurantId }: Props) {
  const uid = restaurantId.trim();
  const [draft, setDraft] = useState<PayoutWalletDetails>({
    ...EMPTY_PAYOUT_WALLET,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) {
      setDraft({ ...EMPTY_PAYOUT_WALLET });
      return undefined;
    }

    const unsub = onSnapshot(
      doc(db, 'restaurants', uid),
      (snap) => {
        setDraft(
          parseRestaurantPayout(
            snap.exists() ? (snap.data() as Record<string, unknown>) : undefined,
          ),
        );
      },
      () => setDraft({ ...EMPTY_PAYOUT_WALLET }),
    );
    return unsub;
  }, [uid]);

  const setField = useCallback(
    (key: keyof PayoutWalletDetails, value: string) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const selectMethod = useCallback((method: PayoutMethod) => {
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
      const interacEmail = draft.interacEmail.trim().toLowerCase();
      const legalName = draft.legalName.trim();
      const accountHolderName = draft.accountHolderName.trim() || legalName;

      await setDoc(
        doc(db, 'restaurants', uid),
        {
          bankDetails: {
            payoutMethod: method,
            legalName,
            interacEmail,
            accountHolderName,
            accountName: accountHolderName,
            bankName: draft.bankName.trim(),
            institutionNumber: draft.institutionNumber.trim(),
            transitNumber: draft.transitNumber.trim(),
            accountNumber: draft.accountNumber.trim(),
            iban: draft.accountNumber.trim(),
            updatedAt: serverTimestamp(),
          },
          payoutMethods: {
            payoutMethod: method,
            interacEmail,
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
      title="Restaurant Wallet"
      draft={draft}
      saving={saving}
      canSave={Boolean(uid)}
      onSelectMethod={selectMethod}
      onChangeField={setField}
      onSave={() => void handleSave()}
    />
  );
}
