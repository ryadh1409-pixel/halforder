import { auth, db, functions } from '@/services/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { Platform } from 'react-native';

export type WalletCardPaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  type?: string;
};

function assertSignedIn(): void {
  const u = auth.currentUser;
  if (!u || u.isAnonymous) {
    throw new Error('Please sign in to manage payment methods.');
  }
}

export async function createWalletSetupIntent(): Promise<{
  customerId: string;
  setupIntentId: string;
  clientSecret: string;
}> {
  assertSignedIn();
  await auth.currentUser?.getIdToken(true);
  const fn = httpsCallable(functions, 'walletCreateSetupIntent');
  const result = await fn({});
  const data = result.data as Record<string, unknown> | undefined;
  const clientSecret =
    typeof data?.clientSecret === 'string' ? data.clientSecret : '';
  const customerId =
    typeof data?.customerId === 'string' ? data.customerId : '';
  const setupIntentId =
    typeof data?.setupIntentId === 'string' ? data.setupIntentId : '';
  if (!clientSecret) throw new Error('SetupIntent client secret missing');
  return { customerId, setupIntentId, clientSecret };
}

export async function listWalletPaymentMethods(): Promise<WalletCardPaymentMethod[]> {
  assertSignedIn();
  await auth.currentUser?.getIdToken(true);
  const fn = httpsCallable(functions, 'walletListPaymentMethods');
  const result = await fn({});
  const data = result.data as Record<string, unknown> | undefined;
  const rows = Array.isArray(data?.paymentMethods) ? data.paymentMethods : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id) return [];
    const item: WalletCardPaymentMethod = {
      id,
      brand: typeof r.brand === 'string' ? r.brand : 'card',
      last4: typeof r.last4 === 'string' ? r.last4 : '••••',
      expMonth:
        typeof r.expMonth === 'number' && Number.isFinite(r.expMonth)
          ? r.expMonth
          : null,
      expYear:
        typeof r.expYear === 'number' && Number.isFinite(r.expYear)
          ? r.expYear
          : null,
      type: typeof r.type === 'string' ? r.type : 'card',
    };
    return [item];
  });
}

export async function detachWalletPaymentMethod(
  paymentMethodId: string,
): Promise<void> {
  assertSignedIn();
  const id = paymentMethodId.trim();
  if (!id) throw new Error('Missing payment method');
  await auth.currentUser?.getIdToken(true);
  const fn = httpsCallable(functions, 'walletDetachPaymentMethod');
  await fn({ paymentMethodId: id });
}

/** Preferred default card for Wallet UI (user doc — no Functions change). */
export function subscribeWalletDefaultPaymentMethodId(
  uid: string,
  onData: (paymentMethodId: string | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      const raw = snap.data()?.walletDefaultPaymentMethodId;
      onData(typeof raw === 'string' && raw.trim() ? raw.trim() : null);
    },
    () => onData(null),
  );
}

export async function setWalletDefaultPaymentMethod(
  paymentMethodId: string,
): Promise<void> {
  assertSignedIn();
  const uid = auth.currentUser!.uid;
  const id = paymentMethodId.trim();
  if (!id) throw new Error('Missing payment method');
  await setDoc(
    doc(db, 'users', uid),
    {
      walletDefaultPaymentMethodId: id,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearWalletDefaultPaymentMethodIfMatches(
  paymentMethodId: string,
): Promise<void> {
  assertSignedIn();
  const uid = auth.currentUser!.uid;
  const id = paymentMethodId.trim();
  if (!id) return;
  const snap = await getDoc(doc(db, 'users', uid));
  const current = snap.data()?.walletDefaultPaymentMethodId;
  if (typeof current !== 'string' || current !== id) return;
  await setDoc(
    doc(db, 'users', uid),
    {
      walletDefaultPaymentMethodId: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function formatCardBrand(brand: string): string {
  const b = brand.trim().toLowerCase();
  if (b === 'visa') return 'Visa';
  if (b === 'mastercard' || b === 'master_card') return 'Mastercard';
  if (b === 'amex' || b === 'american_express') return 'Amex';
  if (b === 'discover') return 'Discover';
  if (!b) return 'Card';
  return b.charAt(0).toUpperCase() + b.slice(1);
}

export function formatCardLabel(pm: WalletCardPaymentMethod): string {
  return `${formatCardBrand(pm.brand)} •••• ${pm.last4}`;
}

export function formatCardExpiry(pm: WalletCardPaymentMethod): string | null {
  if (pm.expMonth == null || pm.expYear == null) return null;
  const mm = String(pm.expMonth).padStart(2, '0');
  const yy = String(pm.expYear).slice(-2);
  return `Expires ${mm}/${yy}`;
}

/** Apple Pay row: iOS only; refined by Stripe Platform Pay when available. */
export async function resolveApplePayAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const stripe = await import('@stripe/stripe-react-native');
    const fn = (
      stripe as {
        isPlatformPaySupported?: (opts?: {
          googlePay?: boolean;
          applePay?: boolean;
        }) => Promise<boolean>;
      }
    ).isPlatformPaySupported;
    if (typeof fn === 'function') {
      return await fn({ applePay: true });
    }
  } catch {
    // Expo Go / web stub — treat as available on iOS for display purposes.
  }
  return true;
}
