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
    runningBalance: money(
      Number(data.runningBalance ?? data.balanceAfter ?? 0),
    ),
    balanceAfter:
      data.balanceAfter == null && data.runningBalance == null
        ? null
        : money(Number(data.balanceAfter ?? data.runningBalance ?? 0)),
    orderId: data.orderId == null ? null : String(data.orderId),
    description: typeof data.description === 'string' ? data.description : '',
    notes:
      data.notes == null && data.note == null
        ? null
        : String(data.notes ?? data.note),
    note:
      data.note == null && data.notes == null
        ? null
        : String(data.note ?? data.notes),
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
    createdBy:
      typeof data.createdBy === 'string' && data.createdBy.trim()
        ? data.createdBy.trim()
        : null,
    walletOwnerId:
      typeof data.walletOwnerId === 'string' && data.walletOwnerId.trim()
        ? data.walletOwnerId.trim()
        : null,
    walletType:
      data.walletType === 'restaurant' || data.walletType === 'driver'
        ? data.walletType
        : null,
    previousBalance:
      data.previousBalance == null
        ? null
        : money(Number(data.previousBalance)),
    newBalance:
      data.newBalance == null ? null : money(Number(data.newBalance)),
    adminUid:
      typeof data.adminUid === 'string' && data.adminUid.trim()
        ? data.adminUid.trim()
        : null,
    customerUid:
      typeof data.customerUid === 'string' && data.customerUid.trim()
        ? data.customerUid.trim()
        : null,
    adjustmentAmount:
      data.adjustmentAmount == null
        ? null
        : money(Number(data.adjustmentAmount)),
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

export type AdminEarningsDepositInput = {
  amount: number;
  note?: string | null;
  adminUid: string;
};

/**
 * Admin wallet funding — credits platform balance and writes an immutable
 * `deposit` ledger row. Does not touch restaurant/driver wallets or transfers.
 */
export async function adminDepositEarningsWallet(
  input: AdminEarningsDepositInput,
): Promise<{ referenceId: string; txId: string }> {
  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error('Deposit amount must be greater than zero.');
  const adminUid = input.adminUid.trim();
  if (!adminUid) throw new Error('Admin is required.');
  const note =
    typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;

  const referenceId = `dep_${adminUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`;
  const txId = `deposit_${referenceId}`;
  const adminWalletId = ADMIN_EARNINGS_WALLET_ID;
  const adminWalletRef = doc(db, EARNINGS_WALLETS_COLLECTION, adminWalletId);
  const ledgerRef = doc(db, EARNINGS_LEDGER_COLLECTION, txId);

  await runTransaction(db, async (tx) => {
    const [adminSnap, ledgerSnap] = await Promise.all([
      tx.get(adminWalletRef),
      tx.get(ledgerRef),
    ]);
    if (ledgerSnap.exists()) {
      throw new Error('Deposit already recorded.');
    }

    const adminPrev = money(Number(adminSnap.data()?.currentBalance ?? 0));
    const adminNext = money(adminPrev + amount);
    const now = serverTimestamp();

    tx.set(ledgerRef, {
      walletId: adminWalletId,
      ownerType: 'admin',
      ownerId: ADMIN_EARNINGS_OWNER_ID,
      type: 'deposit',
      status: 'completed',
      amount,
      signedAmount: amount,
      runningBalance: adminNext,
      balanceAfter: adminNext,
      orderId: null,
      description: note ? `Admin deposit: ${note}` : 'Admin deposit',
      note,
      notes: note,
      source: 'admin_deposit',
      sender: 'Admin',
      reason: note,
      referenceId,
      idempotencyKey: txId,
      restaurantSnapshot: null,
      driverSnapshot: null,
      adminSnapshot: {
        source: 'admin_deposit',
        referenceId,
        relatedOrderId: null,
      },
      createdBy: adminUid,
      createdAt: now,
      completedAt: now,
    });

    const adminBase = adminSnap.exists()
      ? (adminSnap.data() as Record<string, unknown>)
      : {};
    tx.set(
      adminWalletRef,
      {
        ...emptyWallet('admin', ADMIN_EARNINGS_OWNER_ID),
        ...adminBase,
        ownerType: 'admin',
        ownerId: ADMIN_EARNINGS_OWNER_ID,
        currentBalance: adminNext,
        availableBalance: adminNext,
        updatedAt: now,
        createdAt: adminSnap.exists() ? adminSnap.data()?.createdAt ?? now : now,
      },
      { merge: true },
    );
  });

  return { referenceId, txId };
}

export type AdminManualAdjustDirection = 'increase' | 'decrease';

export type AdminManualAdjustEarningsInput = {
  ownerType: 'restaurant' | 'driver';
  ownerId: string;
  direction: AdminManualAdjustDirection;
  amount: number;
  reason: string;
  adminUid: string;
};

/**
 * Admin manual balance adjustment for restaurant/driver earnings wallets
 * (e.g. after external bank / wire / e-transfer payouts).
 * Updates the partner wallet only; writes immutable ledger rows on both
 * the partner wallet and the Admin wallet for audit (Admin balance unchanged).
 */
export async function adminManualAdjustEarningsWallet(
  input: AdminManualAdjustEarningsInput,
): Promise<{ referenceId: string; recipientTxId: string; adminTxId: string }> {
  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error('Adjustment amount must be greater than zero.');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reason is required.');
  const ownerId = input.ownerId.trim();
  if (!ownerId) throw new Error('Wallet owner is required.');
  const adminUid = input.adminUid.trim();
  if (!adminUid) throw new Error('Admin is required.');
  if (input.direction !== 'increase' && input.direction !== 'decrease') {
    throw new Error('Invalid adjustment type.');
  }

  const signedDelta = input.direction === 'increase' ? amount : -amount;
  const type =
    input.direction === 'increase' ? 'admin_manual_credit' : 'admin_manual_debit';
  const referenceId = `adj_${adminUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`;
  const recipientTxId = `${type}_${input.ownerType}_${referenceId}`;
  const adminTxId = `${type}_admin_${referenceId}`;

  const recipientWalletId = earningsWalletDocId(input.ownerType, ownerId);
  const adminWalletId = ADMIN_EARNINGS_WALLET_ID;
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
      throw new Error('Adjustment already recorded.');
    }

    const previousBalance = money(Number(recipientSnap.data()?.currentBalance ?? 0));
    const newBalance = money(previousBalance + signedDelta);
    if (newBalance < 0) {
      throw new Error('Balance cannot go below $0.00.');
    }
    const adminBalance = money(Number(adminSnap.data()?.currentBalance ?? 0));
    const now = serverTimestamp();
    const description =
      input.direction === 'increase'
        ? `Admin manual credit: ${reason}`
        : `Admin manual debit: ${reason}`;

    const auditFields = {
      walletOwnerId: ownerId,
      walletType: input.ownerType,
      amount,
      previousBalance,
      newBalance,
      reason,
      adminUid,
      createdBy: adminUid,
      source: 'admin_manual_adjust',
      notes: reason,
      note: reason,
      referenceId,
      orderId: null,
      status: 'completed' as const,
      restaurantSnapshot: null,
      driverSnapshot: null,
      createdAt: now,
      completedAt: now,
    };

    tx.set(recipientTxRef, {
      ...auditFields,
      walletId: recipientWalletId,
      ownerType: input.ownerType,
      ownerId,
      type,
      signedAmount: signedDelta,
      runningBalance: newBalance,
      balanceAfter: newBalance,
      description,
      sender: 'Admin',
      idempotencyKey: recipientTxId,
      adminSnapshot: null,
    });

    tx.set(adminTxRef, {
      ...auditFields,
      walletId: adminWalletId,
      ownerType: 'admin',
      ownerId: ADMIN_EARNINGS_OWNER_ID,
      type,
      signedAmount: 0,
      runningBalance: adminBalance,
      balanceAfter: adminBalance,
      description: `${description} (${input.ownerType} ${ownerId})`,
      sender: 'Admin',
      idempotencyKey: adminTxId,
      adminSnapshot: {
        source: 'admin_manual_adjust',
        referenceId,
        relatedOrderId: null,
      },
    });

    const recipientBase = recipientSnap.exists()
      ? (recipientSnap.data() as Record<string, unknown>)
      : {};
    const withdrawnBump =
      input.direction === 'decrease'
        ? money(Number(recipientBase.totalWithdrawn ?? 0) + amount)
        : money(Number(recipientBase.totalWithdrawn ?? 0));
    tx.set(
      recipientWalletRef,
      {
        ...emptyWallet(input.ownerType, ownerId),
        ...recipientBase,
        ownerType: input.ownerType,
        ownerId,
        currentBalance: newBalance,
        availableBalance: newBalance,
        totalWithdrawn: withdrawnBump,
        updatedAt: now,
        createdAt: recipientSnap.exists()
          ? recipientSnap.data()?.createdAt ?? now
          : now,
      },
      { merge: true },
    );

    // Touch admin wallet updatedAt so listeners refresh; balance unchanged.
    if (adminSnap.exists()) {
      tx.set(
        adminWalletRef,
        {
          updatedAt: now,
        },
        { merge: true },
      );
    }
  });

  return { referenceId, recipientTxId, adminTxId };
}

export type AdminSetEarningsWalletBalanceInput = {
  ownerType: 'restaurant' | 'driver';
  ownerId: string;
  newBalance: number;
  reason: string;
  adminUid: string;
};

/**
 * Admin sets restaurant/driver earnings wallet to an exact balance.
 * Writes immutable admin_balance_adjustment rows on partner + Admin ledgers.
 */
export async function adminSetEarningsWalletBalance(
  input: AdminSetEarningsWalletBalanceInput,
): Promise<{
  referenceId: string;
  recipientTxId: string;
  adminTxId: string;
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

  const referenceId = `bal_set_${adminUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`;
  const recipientTxId = `admin_balance_adjustment_${input.ownerType}_${referenceId}`;
  const adminTxId = `admin_balance_adjustment_admin_${referenceId}`;
  const recipientWalletId = earningsWalletDocId(input.ownerType, ownerId);
  const adminWalletId = ADMIN_EARNINGS_WALLET_ID;
  const recipientWalletRef = doc(db, EARNINGS_WALLETS_COLLECTION, recipientWalletId);
  const adminWalletRef = doc(db, EARNINGS_WALLETS_COLLECTION, adminWalletId);
  const recipientTxRef = doc(db, EARNINGS_LEDGER_COLLECTION, recipientTxId);
  const adminTxRef = doc(db, EARNINGS_LEDGER_COLLECTION, adminTxId);

  let previousBalance = 0;
  let newBalance = target;
  let adjustmentAmount = 0;

  await runTransaction(db, async (tx) => {
    const [recipientSnap, adminSnap, recipientTxSnap, adminTxSnap] = await Promise.all([
      tx.get(recipientWalletRef),
      tx.get(adminWalletRef),
      tx.get(recipientTxRef),
      tx.get(adminTxRef),
    ]);
    if (recipientTxSnap.exists() || adminTxSnap.exists()) {
      throw new Error('Adjustment already recorded.');
    }

    previousBalance = money(Number(recipientSnap.data()?.currentBalance ?? 0));
    newBalance = target;
    adjustmentAmount = money(newBalance - previousBalance);
    if (adjustmentAmount === 0) {
      throw new Error('New balance is the same as the current balance.');
    }
    const adminBalance = money(Number(adminSnap.data()?.currentBalance ?? 0));
    const now = serverTimestamp();
    const description = `Admin balance adjustment: ${reason}`;

    const auditFields = {
      type: 'admin_balance_adjustment' as const,
      amount: money(Math.abs(adjustmentAmount)),
      adjustmentAmount,
      previousBalance,
      newBalance,
      reason,
      adminUid,
      createdBy: adminUid,
      source: 'admin_balance_adjustment',
      notes: reason,
      note: reason,
      referenceId,
      orderId: null,
      status: 'completed' as const,
      restaurantSnapshot: null,
      driverSnapshot: null,
      createdAt: now,
      completedAt: now,
      timestamp: now,
    };

    tx.set(recipientTxRef, {
      ...auditFields,
      walletId: recipientWalletId,
      ownerType: input.ownerType,
      ownerId,
      walletOwnerId: ownerId,
      walletType: input.ownerType,
      signedAmount: adjustmentAmount,
      runningBalance: newBalance,
      balanceAfter: newBalance,
      description,
      sender: 'Admin',
      idempotencyKey: recipientTxId,
      adminSnapshot: null,
    });

    tx.set(adminTxRef, {
      ...auditFields,
      walletId: adminWalletId,
      ownerType: 'admin',
      ownerId: ADMIN_EARNINGS_OWNER_ID,
      walletOwnerId: ownerId,
      walletType: input.ownerType,
      signedAmount: 0,
      runningBalance: adminBalance,
      balanceAfter: adminBalance,
      description: `${description} (${input.ownerType} ${ownerId})`,
      sender: 'Admin',
      idempotencyKey: adminTxId,
      adminSnapshot: {
        source: 'admin_balance_adjustment',
        referenceId,
        relatedOrderId: null,
      },
    });

    const recipientBase = recipientSnap.exists()
      ? (recipientSnap.data() as Record<string, unknown>)
      : {};
    tx.set(
      recipientWalletRef,
      {
        ...emptyWallet(input.ownerType, ownerId),
        ...recipientBase,
        ownerType: input.ownerType,
        ownerId,
        currentBalance: newBalance,
        availableBalance: newBalance,
        updatedAt: now,
        createdAt: recipientSnap.exists()
          ? recipientSnap.data()?.createdAt ?? now
          : now,
      },
      { merge: true },
    );

    if (adminSnap.exists()) {
      tx.set(adminWalletRef, { updatedAt: now }, { merge: true });
    }
  });

  return {
    referenceId,
    recipientTxId,
    adminTxId,
    previousBalance,
    newBalance,
    adjustmentAmount,
  };
}

export type EarningsWalletManagementSummary = {
  ownerType: 'restaurant' | 'driver';
  ownerId: string;
  name: string;
  currentBalance: number;
  totalEarnings: number;
  pendingBalance: number;
};

function partnerDisplayName(
  ownerType: 'restaurant' | 'driver',
  ownerId: string,
  data: Record<string, unknown>,
): string {
  if (ownerType === 'restaurant') {
    return (
      (typeof data.name === 'string' && data.name.trim()) ||
      (typeof data.restaurantName === 'string' && data.restaurantName.trim()) ||
      (typeof data.businessName === 'string' && data.businessName.trim()) ||
      ownerId
    );
  }
  const first = typeof data.firstName === 'string' ? data.firstName.trim() : '';
  const last = typeof data.lastName === 'string' ? data.lastName.trim() : '';
  const combined = [first, last].filter(Boolean).join(' ').trim();
  return (
    (typeof data.displayName === 'string' && data.displayName.trim()) ||
    (typeof data.name === 'string' && data.name.trim()) ||
    (typeof data.fullName === 'string' && data.fullName.trim()) ||
    combined ||
    ownerId
  );
}

/** Admin Wallet Management — restaurant/driver earnings wallet summaries. */
export async function listEarningsWalletManagementSummaries(
  ownerType: 'restaurant' | 'driver',
  max = 120,
): Promise<EarningsWalletManagementSummary[]> {
  const collectionName = ownerType === 'restaurant' ? 'restaurants' : 'drivers';
  const snap = await getDocs(query(collection(db, collectionName), limit(max)));
  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const ownerId = d.id;
      const wallet = await getEarningsWallet(ownerType, ownerId);
      return {
        ownerType,
        ownerId,
        name: partnerDisplayName(ownerType, ownerId, data),
        currentBalance: wallet.currentBalance,
        totalEarnings: money(
          Number(
            wallet.totalEarnings ||
              wallet.lifetimeEarnings ||
              wallet.restaurantTotalEarnings ||
              0,
          ),
        ),
        pendingBalance: wallet.pendingBalance,
      };
    }),
  );
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/**
 * Admin-ledger audit row for a customer HalfOrder balance adjustment.
 * Does not change the Admin wallet balance.
 */
export async function writeAdminCustomerAdjustAudit(input: {
  type:
    | 'admin_manual_customer_credit'
    | 'admin_manual_customer_debit'
    | 'admin_balance_adjustment';
  customerUid: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
  reason: string;
  adminUid: string;
  referenceId: string;
  adminTxId: string;
  adjustmentAmount?: number;
}): Promise<void> {
  const amount = money(input.amount);
  const adjustmentAmount = money(
    input.adjustmentAmount ?? input.newBalance - input.previousBalance,
  );
  const adminWalletId = ADMIN_EARNINGS_WALLET_ID;
  const adminWalletRef = doc(db, EARNINGS_WALLETS_COLLECTION, adminWalletId);
  const adminTxRef = doc(db, EARNINGS_LEDGER_COLLECTION, input.adminTxId);

  await runTransaction(db, async (tx) => {
    const [adminSnap, adminTxSnap] = await Promise.all([
      tx.get(adminWalletRef),
      tx.get(adminTxRef),
    ]);
    if (adminTxSnap.exists()) {
      throw new Error('Admin audit entry already recorded.');
    }
    const adminBalance = money(Number(adminSnap.data()?.currentBalance ?? 0));
    const now = serverTimestamp();
    const description =
      input.type === 'admin_balance_adjustment'
        ? `Customer balance set: ${input.reason}`
        : input.type === 'admin_manual_customer_credit'
          ? `Customer credit: ${input.reason}`
          : `Customer debit: ${input.reason}`;

    tx.set(adminTxRef, {
      walletId: adminWalletId,
      ownerType: 'admin',
      ownerId: ADMIN_EARNINGS_OWNER_ID,
      type: input.type,
      status: 'completed',
      amount,
      adjustmentAmount,
      signedAmount: 0,
      runningBalance: adminBalance,
      balanceAfter: adminBalance,
      orderId: null,
      description: `${description} (customer ${input.customerUid})`,
      notes: input.reason,
      note: input.reason,
      reason: input.reason,
      source:
        input.type === 'admin_balance_adjustment'
          ? 'admin_balance_adjustment'
          : 'admin_manual_customer_adjust',
      sender: 'Admin',
      referenceId: input.referenceId,
      idempotencyKey: input.adminTxId,
      customerUid: input.customerUid,
      previousBalance: money(input.previousBalance),
      newBalance: money(input.newBalance),
      adminUid: input.adminUid,
      createdBy: input.adminUid,
      restaurantSnapshot: null,
      driverSnapshot: null,
      adminSnapshot: {
        source:
          input.type === 'admin_balance_adjustment'
            ? 'admin_balance_adjustment'
            : 'admin_manual_customer_adjust',
        referenceId: input.referenceId,
        relatedOrderId: null,
      },
      createdAt: now,
      completedAt: now,
      timestamp: now,
    });

    if (adminSnap.exists()) {
      tx.set(adminWalletRef, { updatedAt: now }, { merge: true });
    }
  });
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
