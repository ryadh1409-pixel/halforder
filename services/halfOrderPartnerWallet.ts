/**
 * HalfOrder Partner Wallet (Restaurant / Driver).
 * Admin credits only — isolated from customer payments & earnings ledgers.
 */

import { db } from '@/services/firebase';
import {
  partnerWalletDocId,
  type HalfOrderPartnerWallet,
  type HalfOrderPartnerWalletCredit,
  type PartnerWalletOwnerType,
} from '@/types/halfOrderPartnerWallet';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export const PARTNER_WALLETS_COLLECTION = 'halfOrderPartnerWallets';
export const PARTNER_WALLET_CREDITS_COLLECTION = 'halfOrderPartnerWalletCredits';

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function emptyWallet(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): HalfOrderPartnerWallet {
  return {
    ownerType,
    ownerId,
    currentBalance: 0,
    updatedAt: null,
  };
}

function mapWallet(
  data: Record<string, unknown> | undefined,
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): HalfOrderPartnerWallet {
  if (!data) return emptyWallet(ownerType, ownerId);
  return {
    ownerType: (data.ownerType as PartnerWalletOwnerType) || ownerType,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : ownerId,
    currentBalance: money(Number(data.currentBalance ?? 0)),
    updatedAt: data.updatedAt ?? null,
    createdAt: data.createdAt ?? null,
  };
}

function mapCredit(
  id: string,
  data: Record<string, unknown>,
): HalfOrderPartnerWalletCredit {
  const type =
    data.type === 'admin_balance_adjustment' || data.type === 'credit'
      ? data.type
      : null;
  return {
    id,
    walletId: String(data.walletId ?? ''),
    ownerType: data.ownerType as PartnerWalletOwnerType,
    ownerId: String(data.ownerId ?? ''),
    amount: money(Number(data.amount ?? 0)),
    balanceAfter: money(Number(data.balanceAfter ?? data.newBalance ?? 0)),
    orderId: data.orderId == null || data.orderId === '' ? null : String(data.orderId),
    note: data.note == null || data.note === '' ? null : String(data.note),
    description:
      typeof data.description === 'string' && data.description.trim()
        ? data.description.trim()
        : 'Balance added by HalfOrder',
    createdAt: data.createdAt ?? null,
    type,
    previousBalance:
      data.previousBalance == null ? null : money(Number(data.previousBalance)),
    newBalance:
      data.newBalance == null && data.balanceAfter == null
        ? null
        : money(Number(data.newBalance ?? data.balanceAfter ?? 0)),
    adjustmentAmount:
      data.adjustmentAmount == null
        ? null
        : money(Number(data.adjustmentAmount)),
    reason:
      typeof data.reason === 'string' && data.reason.trim()
        ? data.reason.trim()
        : null,
    adminUid:
      typeof data.adminUid === 'string' && data.adminUid.trim()
        ? data.adminUid.trim()
        : null,
  };
}

export function subscribePartnerWallet(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
  onChange: (wallet: HalfOrderPartnerWallet) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const id = partnerWalletDocId(ownerType, ownerId);
  return onSnapshot(
    doc(db, PARTNER_WALLETS_COLLECTION, id),
    (snap) => {
      onChange(
        mapWallet(snap.data() as Record<string, unknown> | undefined, ownerType, ownerId),
      );
    },
    (err) => onError?.(err),
  );
}

export function subscribePartnerWalletCredits(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
  onChange: (credits: HalfOrderPartnerWalletCredit[]) => void,
  onError?: (err: unknown) => void,
  max = 100,
): Unsubscribe {
  const walletId = partnerWalletDocId(ownerType, ownerId);
  const q = query(
    collection(db, PARTNER_WALLET_CREDITS_COLLECTION),
    where('walletId', '==', walletId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs
          .map((d) => mapCredit(d.id, d.data() as Record<string, unknown>))
          .filter(
            (c) =>
              c.type === 'admin_balance_adjustment' ||
              c.amount > 0 ||
              (c.adjustmentAmount != null && c.adjustmentAmount !== 0),
          ),
      );
    },
    (err) => onError?.(err),
  );
}

export async function getPartnerWallet(
  ownerType: PartnerWalletOwnerType,
  ownerId: string,
): Promise<HalfOrderPartnerWallet> {
  const id = partnerWalletDocId(ownerType, ownerId);
  const snap = await getDoc(doc(db, PARTNER_WALLETS_COLLECTION, id));
  return mapWallet(snap.data() as Record<string, unknown> | undefined, ownerType, ownerId);
}

export type SendPartnerBalanceInput = {
  ownerType: PartnerWalletOwnerType;
  ownerId: string;
  amount: number;
  note?: string | null;
  /** Optional order / delivery reference for history. */
  orderId?: string | null;
  actorUid: string;
};

/**
 * HalfOrder credit → Restaurant or Driver wallet.
 * Creates an immutable credit row and updates currentBalance atomically.
 */
export async function sendPartnerWalletBalance(
  input: SendPartnerBalanceInput,
): Promise<{ creditId: string; balanceAfter: number }> {
  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
  const ownerId = input.ownerId.trim();
  if (!ownerId) throw new Error('Recipient is required.');

  const walletId = partnerWalletDocId(input.ownerType, ownerId);
  const walletRef = doc(db, PARTNER_WALLETS_COLLECTION, walletId);
  const creditRef = doc(collection(db, PARTNER_WALLET_CREDITS_COLLECTION));
  const note =
    typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
  const orderId =
    typeof input.orderId === 'string' && input.orderId.trim()
      ? input.orderId.trim()
      : null;

  let balanceAfter = 0;

  await runTransaction(db, async (tx) => {
    const walletSnap = await tx.get(walletRef);
    const prev = money(Number(walletSnap.data()?.currentBalance ?? 0));
    balanceAfter = money(prev + amount);
    const now = serverTimestamp();

    tx.set(creditRef, {
      walletId,
      ownerType: input.ownerType,
      ownerId,
      amount,
      balanceAfter,
      orderId,
      note,
      description: 'Balance added by HalfOrder',
      createdAt: now,
      createdBy: input.actorUid,
    });

    tx.set(
      walletRef,
      {
        ownerType: input.ownerType,
        ownerId,
        currentBalance: balanceAfter,
        updatedAt: now,
        createdAt: walletSnap.exists()
          ? walletSnap.data()?.createdAt ?? now
          : now,
      },
      { merge: true },
    );
  });

  return { creditId: creditRef.id, balanceAfter };
}

export type AdminSetPartnerWalletBalanceInput = {
  ownerType: PartnerWalletOwnerType;
  ownerId: string;
  newBalance: number;
  reason: string;
  adminUid: string;
};

/**
 * Admin sets restaurant/driver HalfOrder wallet to an exact balance.
 * Writes an immutable admin_balance_adjustment history row.
 */
export async function adminSetPartnerWalletBalance(
  input: AdminSetPartnerWalletBalanceInput,
): Promise<{
  creditId: string;
  previousBalance: number;
  newBalance: number;
  adjustmentAmount: number;
}> {
  const ownerId = input.ownerId.trim();
  if (!ownerId) throw new Error('Wallet owner is required.');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reason is required.');
  const adminUid = input.adminUid.trim();
  if (!adminUid) throw new Error('Admin is required.');
  const target = money(input.newBalance);
  if (!(target >= 0) || !Number.isFinite(target)) {
    throw new Error('New balance must be zero or greater.');
  }

  const walletId = partnerWalletDocId(input.ownerType, ownerId);
  const walletRef = doc(db, PARTNER_WALLETS_COLLECTION, walletId);
  const creditId = `admin_balance_adjustment_${adminUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`;
  const creditRef = doc(db, PARTNER_WALLET_CREDITS_COLLECTION, creditId);

  let previousBalance = 0;
  let newBalance = target;
  let adjustmentAmount = 0;

  await runTransaction(db, async (tx) => {
    const [walletSnap, creditSnap] = await Promise.all([
      tx.get(walletRef),
      tx.get(creditRef),
    ]);
    if (creditSnap.exists()) {
      throw new Error('Adjustment already recorded.');
    }
    previousBalance = money(Number(walletSnap.data()?.currentBalance ?? 0));
    newBalance = target;
    adjustmentAmount = money(newBalance - previousBalance);
    if (adjustmentAmount === 0) {
      throw new Error('New balance is the same as the current balance.');
    }
    const now = serverTimestamp();

    tx.set(creditRef, {
      walletId,
      ownerType: input.ownerType,
      ownerId,
      type: 'admin_balance_adjustment',
      amount: money(Math.abs(adjustmentAmount)),
      adjustmentAmount,
      previousBalance,
      newBalance,
      balanceAfter: newBalance,
      orderId: null,
      note: reason,
      reason,
      adminUid,
      description: 'Admin balance adjustment',
      createdAt: now,
      createdBy: adminUid,
      timestamp: now,
    });

    tx.set(
      walletRef,
      {
        ownerType: input.ownerType,
        ownerId,
        currentBalance: newBalance,
        updatedAt: now,
        createdAt: walletSnap.exists()
          ? walletSnap.data()?.createdAt ?? now
          : now,
      },
      { merge: true },
    );
  });

  return { creditId, previousBalance, newBalance, adjustmentAmount };
}

/** Admin list helpers — read-only scans of partner directories. */
export type PartnerWalletListItem = {
  ownerId: string;
  name: string;
  currentBalance: number;
};

export async function listRestaurantWalletSummaries(
  max = 80,
): Promise<PartnerWalletListItem[]> {
  const snap = await getDocs(query(collection(db, 'restaurants'), limit(max)));
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const ownerId = d.id;
      const name =
        (typeof data.name === 'string' && data.name.trim()) ||
        (typeof data.restaurantName === 'string' && data.restaurantName.trim()) ||
        ownerId;
      const wallet = await getPartnerWallet('restaurant', ownerId);
      return { ownerId, name, currentBalance: wallet.currentBalance };
    }),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export async function listDriverWalletSummaries(
  max = 80,
): Promise<PartnerWalletListItem[]> {
  const snap = await getDocs(query(collection(db, 'drivers'), limit(max)));
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const ownerId = d.id;
      const name =
        (typeof data.name === 'string' && data.name.trim()) ||
        (typeof data.displayName === 'string' && data.displayName.trim()) ||
        (typeof data.fullName === 'string' && data.fullName.trim()) ||
        ownerId;
      const wallet = await getPartnerWallet('driver', ownerId);
      return { ownerId, name, currentBalance: wallet.currentBalance };
    }),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}
