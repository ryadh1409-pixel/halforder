/**
 * Client API for Earnings Wallet (Restaurant / Driver / Admin).
 * Reads ledger + wallet docs. Admin transfer writes immutable ledger entries.
 */

import { db } from '@/services/firebase';
import {
  ADMIN_EARNINGS_OWNER_ID,
  ADMIN_EARNINGS_WALLET_ID,
  earningsWalletDocId,
  type EarningsLedgerEntry,
  type EarningsWalletDoc,
  type EarningsWalletOwnerType,
} from '@/types/earningsWallet';
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

export const EARNINGS_WALLETS_COLLECTION = 'earningsWallets';
export const EARNINGS_LEDGER_COLLECTION = 'earningsLedger';

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function emptyWallet(
  ownerType: EarningsWalletOwnerType,
  ownerId: string,
): EarningsWalletDoc {
  return {
    ownerType,
    ownerId,
    currentBalance: 0,
    pendingBalance: 0,
    availableBalance: 0,
    totalEarnings: 0,
    lifetimeEarnings: 0,
    totalWithdrawn: 0,
    totalDeliveries: 0,
    bonusEarnings: 0,
    deliveryEarnings: 0,
    totalRevenue: 0,
    restaurantCommissions: 0,
    driverCommissions: 0,
    serviceFees: 0,
    platformFees: 0,
    promotionalBonusPaid: 0,
    totalTransfersSent: 0,
    netPlatformRevenue: 0,
  };
}

function mapWallet(
  id: string,
  data: Record<string, unknown> | undefined,
  ownerType: EarningsWalletOwnerType,
  ownerId: string,
): EarningsWalletDoc {
  if (!data) return emptyWallet(ownerType, ownerId);
  const currentBalance = money(Number(data.currentBalance ?? 0));
  return {
    ...emptyWallet(ownerType, ownerId),
    ...data,
    ownerType: (data.ownerType as EarningsWalletOwnerType) || ownerType,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : ownerId,
    currentBalance,
    pendingBalance: money(Number(data.pendingBalance ?? 0)),
    availableBalance: money(Number(data.availableBalance ?? currentBalance)),
    totalEarnings: money(Number(data.totalEarnings ?? 0)),
    lifetimeEarnings: money(Number(data.lifetimeEarnings ?? 0)),
    totalWithdrawn: money(Number(data.totalWithdrawn ?? 0)),
    totalDeliveries: Number(data.totalDeliveries ?? 0) || 0,
    bonusEarnings: money(Number(data.bonusEarnings ?? 0)),
    deliveryEarnings: money(Number(data.deliveryEarnings ?? 0)),
    totalRevenue: money(Number(data.totalRevenue ?? 0)),
    restaurantCommissions: money(Number(data.restaurantCommissions ?? 0)),
    driverCommissions: money(Number(data.driverCommissions ?? 0)),
    serviceFees: money(Number(data.serviceFees ?? 0)),
    platformFees: money(Number(data.platformFees ?? 0)),
    promotionalBonusPaid: money(Number(data.promotionalBonusPaid ?? 0)),
    totalTransfersSent: money(Number(data.totalTransfersSent ?? 0)),
    netPlatformRevenue: money(Number(data.netPlatformRevenue ?? 0)),
  };
}

function mapLedger(id: string, data: Record<string, unknown>): EarningsLedgerEntry {
  return {
    id,
    walletId: String(data.walletId ?? ''),
    ownerType: data.ownerType as EarningsWalletOwnerType,
    ownerId: String(data.ownerId ?? ''),
    type: data.type as EarningsLedgerEntry['type'],
    status: (data.status as EarningsLedgerEntry['status']) || 'completed',
    amount: money(Number(data.amount ?? 0)),
    signedAmount: money(Number(data.signedAmount ?? data.amount ?? 0)),
    runningBalance: money(Number(data.runningBalance ?? 0)),
    orderId: data.orderId == null ? null : String(data.orderId),
    description: typeof data.description === 'string' ? data.description : '',
    notes: data.notes == null ? null : String(data.notes),
    source: data.source == null ? null : String(data.source),
    sender: data.sender == null ? null : String(data.sender),
    reason: data.reason == null ? null : String(data.reason),
    referenceId: data.referenceId == null ? null : String(data.referenceId),
    idempotencyKey: String(data.idempotencyKey ?? id),
    restaurantSnapshot: (data.restaurantSnapshot as EarningsLedgerEntry['restaurantSnapshot']) ?? null,
    driverSnapshot: (data.driverSnapshot as EarningsLedgerEntry['driverSnapshot']) ?? null,
    adminSnapshot: (data.adminSnapshot as EarningsLedgerEntry['adminSnapshot']) ?? null,
    createdAt: data.createdAt ?? null,
    completedAt: data.completedAt ?? null,
  };
}

export async function getEarningsWallet(
  ownerType: EarningsWalletOwnerType,
  ownerId: string,
): Promise<EarningsWalletDoc> {
  const id = earningsWalletDocId(ownerType, ownerId);
  const snap = await getDoc(doc(db, EARNINGS_WALLETS_COLLECTION, id));
  return mapWallet(id, snap.data() as Record<string, unknown> | undefined, ownerType, ownerId);
}

export function subscribeEarningsWallet(
  ownerType: EarningsWalletOwnerType,
  ownerId: string,
  onChange: (wallet: EarningsWalletDoc) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  const id = earningsWalletDocId(ownerType, ownerId);
  return onSnapshot(
    doc(db, EARNINGS_WALLETS_COLLECTION, id),
    (snap) => {
      onChange(
        mapWallet(
          id,
          snap.data() as Record<string, unknown> | undefined,
          ownerType,
          ownerId,
        ),
      );
    },
    (err) => onError?.(err),
  );
}

export function subscribeEarningsLedger(
  ownerType: EarningsWalletOwnerType,
  ownerId: string,
  onChange: (entries: EarningsLedgerEntry[]) => void,
  onError?: (err: unknown) => void,
  max = 100,
): Unsubscribe {
  const walletId = earningsWalletDocId(ownerType, ownerId);
  const q = query(
    collection(db, EARNINGS_LEDGER_COLLECTION),
    where('walletId', '==', walletId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => mapLedger(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err),
  );
}

export async function getEarningsLedgerEntry(
  transactionId: string,
): Promise<EarningsLedgerEntry | null> {
  const snap = await getDoc(doc(db, EARNINGS_LEDGER_COLLECTION, transactionId));
  if (!snap.exists()) return null;
  return mapLedger(snap.id, snap.data() as Record<string, unknown>);
}

export function subscribeEarningsLedgerEntry(
  transactionId: string,
  onChange: (entry: EarningsLedgerEntry | null) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, EARNINGS_LEDGER_COLLECTION, transactionId),
    (snap) => {
      if (!snap.exists()) {
        onChange(null);
        return;
      }
      onChange(mapLedger(snap.id, snap.data() as Record<string, unknown>));
    },
    (err) => onError?.(err),
  );
}

export type AdminEarningsTransferInput = {
  recipientType: 'restaurant' | 'driver';
  recipientId: string;
  amount: number;
  reason: string;
  adminUid: string;
};

/**
 * Admin → restaurant/driver transfer. Creates two immutable ledger rows
 * and updates both wallet balances in one transaction.
 */
export async function adminTransferEarningsWallet(
  input: AdminEarningsTransferInput,
): Promise<{ referenceId: string; recipientTxId: string; adminTxId: string }> {
  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error('Transfer amount must be greater than zero.');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Transfer reason is required.');
  const recipientId = input.recipientId.trim();
  if (!recipientId) throw new Error('Recipient is required.');

  const referenceId = `xfer_${input.adminUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`;
  const recipientWalletId = earningsWalletDocId(input.recipientType, recipientId);
  const adminWalletId = ADMIN_EARNINGS_WALLET_ID;
  const recipientTxId = `admin_transfer_in_${referenceId}`;
  const adminTxId = `admin_transfer_out_${referenceId}`;

  const recipientWalletRef = doc(db, EARNINGS_WALLETS_COLLECTION, recipientWalletId);
  const adminWalletRef = doc(db, EARNINGS_WALLETS_COLLECTION, adminWalletId);
  const recipientTxRef = doc(db, EARNINGS_LEDGER_COLLECTION, recipientTxId);
  const adminTxRef = doc(db, EARNINGS_LEDGER_COLLECTION, adminTxId);

  await runTransaction(db, async (tx) => {
    const [recipientSnap, adminSnap, recipientTxSnap, adminTxSnap] = await Promise.all([
      tx.get(recipientWalletRef),
      tx.get(adminWalletRef),
      tx.get(recipientTxRef),
      tx.get(adminTxRef),
    ]);
    if (recipientTxSnap.exists() || adminTxSnap.exists()) {
      throw new Error('Transfer already recorded.');
    }

    const recipientPrev = money(Number(recipientSnap.data()?.currentBalance ?? 0));
    const adminPrev = money(Number(adminSnap.data()?.currentBalance ?? 0));
    if (adminPrev < amount) {
      throw new Error('Admin wallet has insufficient balance for this transfer.');
    }
    const recipientNext = money(recipientPrev + amount);
    const adminNext = money(adminPrev - amount);
    const now = serverTimestamp();

    const recipientTypeIn =
      input.recipientType === 'restaurant' ? 'restaurant_transfer_in' : 'driver_transfer_in';

    tx.set(recipientTxRef, {
      walletId: recipientWalletId,
      ownerType: input.recipientType,
      ownerId: recipientId,
      type: recipientTypeIn,
      status: 'completed',
      amount,
      signedAmount: amount,
      runningBalance: recipientNext,
      orderId: null,
      description: `Admin transfer: ${reason}`,
      notes: reason,
      source: 'admin_transfer',
      sender: 'Admin',
      reason,
      referenceId,
      idempotencyKey: recipientTxId,
      restaurantSnapshot: null,
      driverSnapshot: null,
      adminSnapshot: null,
      createdAt: now,
      completedAt: now,
    });

    tx.set(adminTxRef, {
      walletId: adminWalletId,
      ownerType: 'admin',
      ownerId: ADMIN_EARNINGS_OWNER_ID,
      type: 'admin_transfer_out',
      status: 'completed',
      amount,
      signedAmount: -amount,
      runningBalance: adminNext,
      orderId: null,
      description: `Transfer to ${input.recipientType} ${recipientId}: ${reason}`,
      notes: reason,
      source: 'admin_transfer',
      sender: 'Admin',
      reason,
      referenceId,
      idempotencyKey: adminTxId,
      restaurantSnapshot: null,
      driverSnapshot: null,
      adminSnapshot: {
        source: `${input.recipientType}_transfer`,
        referenceId,
        relatedOrderId: null,
      },
      createdAt: now,
      completedAt: now,
    });

    const recipientBase = recipientSnap.exists()
      ? (recipientSnap.data() as Record<string, unknown>)
      : {};
    tx.set(
      recipientWalletRef,
      {
        ...emptyWallet(input.recipientType, recipientId),
        ...recipientBase,
        ownerType: input.recipientType,
        ownerId: recipientId,
        currentBalance: recipientNext,
        availableBalance: recipientNext,
        updatedAt: now,
        createdAt: recipientSnap.exists() ? recipientSnap.data()?.createdAt ?? now : now,
      },
      { merge: true },
    );

    const adminBase = adminSnap.exists()
      ? (adminSnap.data() as Record<string, unknown>)
      : {};
    const transfersSent = money(Number(adminBase.totalTransfersSent ?? 0) + amount);
    const netRev = money(Number(adminBase.netPlatformRevenue ?? adminPrev) - amount);
    tx.set(
      adminWalletRef,
      {
        ...emptyWallet('admin', ADMIN_EARNINGS_OWNER_ID),
        ...adminBase,
        ownerType: 'admin',
        ownerId: ADMIN_EARNINGS_OWNER_ID,
        currentBalance: adminNext,
        availableBalance: adminNext,
        totalTransfersSent: transfersSent,
        netPlatformRevenue: netRev,
        updatedAt: now,
        createdAt: adminSnap.exists() ? adminSnap.data()?.createdAt ?? now : now,
      },
      { merge: true },
    );
  });

  return { referenceId, recipientTxId, adminTxId };
}

/** Optional helper for admin recipient pickers. */
export async function listRecentLedgerForWallet(
  ownerType: EarningsWalletOwnerType,
  ownerId: string,
  max = 50,
): Promise<EarningsLedgerEntry[]> {
  const walletId = earningsWalletDocId(ownerType, ownerId);
  const q = query(
    collection(db, EARNINGS_LEDGER_COLLECTION),
    where('walletId', '==', walletId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapLedger(d.id, d.data() as Record<string, unknown>));
}
