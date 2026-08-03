import { auth, db } from '@/services/firebase';
import { writeAdminCustomerAdjustAudit } from '@/services/earningsWallet';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

const BALANCE_FIELD = 'halfOrderBalance';
const LEGACY_FIELD = 'walletBalance';
export const BALANCE_LEDGER_COLLECTION = 'balanceLedger';

export type CustomerBalanceLedgerType =
  | 'admin_manual_customer_credit'
  | 'admin_manual_customer_debit'
  | 'admin_balance_adjustment'
  | 'credit'
  | 'debit'
  | 'adjustment'
  | 'unknown';

export type CustomerBalanceLedgerEntry = {
  id: string;
  userId: string;
  customerUid: string;
  type: CustomerBalanceLedgerType;
  amount: number;
  delta: number;
  previousBalance: number;
  newBalance: number;
  reason: string | null;
  adminUid: string | null;
  createdAt: unknown;
};

export type CustomerWalletSummary = {
  userId: string;
  name: string;
  email: string | null;
  currentBalance: number;
  totalCredits: number;
  totalDebits: number;
  lastActivity: unknown;
  updatedAt: unknown;
};

function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function isCustomerUserRole(role: unknown): boolean {
  return (
    role == null ||
    role === '' ||
    role === 'user' ||
    role === 'customer' ||
    role === 'USER' ||
    role === 'CUSTOMER'
  );
}

function customerDisplayName(data: Record<string, unknown>, userId: string): string {
  return (
    (typeof data.name === 'string' && data.name.trim()) ||
    (typeof data.displayName === 'string' && data.displayName.trim()) ||
    (typeof data.fullName === 'string' && data.fullName.trim()) ||
    userId
  );
}

export function parseHalfOrderBalance(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const primary = data[BALANCE_FIELD];
  if (typeof primary === 'number' && Number.isFinite(primary)) {
    return money(primary);
  }
  const legacy = data[LEGACY_FIELD];
  if (typeof legacy === 'number' && Number.isFinite(legacy)) {
    return money(legacy);
  }
  return 0;
}

export function subscribeHalfOrderBalance(
  uid: string,
  onData: (balance: number) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      onData(parseHalfOrderBalance(snap.data() as Record<string, unknown> | undefined));
    },
    (e) => {
      onError?.(e instanceof Error ? e : new Error('Failed to load balance'));
      onData(0);
    },
  );
}

function mapBalanceLedgerEntry(
  id: string,
  data: Record<string, unknown>,
): CustomerBalanceLedgerEntry {
  const delta = money(Number(data.delta ?? data.amount ?? 0));
  const amount = money(Number(data.amount ?? Math.abs(delta)));
  const previousBalance = money(
    Number(data.previousBalance ?? 0),
  );
  const newBalance = money(
    Number(data.newBalance ?? data.nextBalance ?? previousBalance + delta),
  );
  const rawType = typeof data.type === 'string' ? data.type : '';
  let type: CustomerBalanceLedgerType = 'unknown';
  if (
    rawType === 'admin_manual_customer_credit' ||
    rawType === 'admin_manual_customer_debit' ||
    rawType === 'admin_balance_adjustment' ||
    rawType === 'credit' ||
    rawType === 'debit' ||
    rawType === 'adjustment'
  ) {
    type = rawType;
  } else if (delta > 0) {
    type = 'credit';
  } else if (delta < 0) {
    type = 'debit';
  }

  const customerUid =
    (typeof data.customerUid === 'string' && data.customerUid.trim()) ||
    (typeof data.userId === 'string' && data.userId.trim()) ||
    '';

  return {
    id,
    userId: typeof data.userId === 'string' ? data.userId : customerUid,
    customerUid,
    type,
    amount,
    delta,
    previousBalance,
    newBalance,
    reason:
      typeof data.reason === 'string' && data.reason.trim()
        ? data.reason.trim()
        : null,
    adminUid:
      typeof data.adminUid === 'string' && data.adminUid.trim()
        ? data.adminUid.trim()
        : null,
    createdAt: data.createdAt ?? data.timestamp ?? null,
  };
}

export function subscribeCustomerBalanceLedger(
  userId: string,
  onChange: (entries: CustomerBalanceLedgerEntry[]) => void,
  onError?: (err: unknown) => void,
  max = 100,
): Unsubscribe {
  const uid = userId.trim();
  const q = query(
    collection(db, BALANCE_LEDGER_COLLECTION),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) =>
          mapBalanceLedgerEntry(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    (err) => onError?.(err),
  );
}

export async function getCustomerWalletProfile(userId: string): Promise<{
  userId: string;
  name: string;
  email: string | null;
  currentBalance: number;
  updatedAt: unknown;
} | null> {
  const snap = await getDoc(doc(db, 'users', userId.trim()));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    userId: snap.id,
    name: customerDisplayName(data, snap.id),
    email: typeof data.email === 'string' ? data.email : null,
    currentBalance: parseHalfOrderBalance(data),
    updatedAt: data.updatedAt ?? null,
  };
}

/**
 * Admin Wallet Management — list customer HalfOrder wallets with ledger totals.
 */
export async function listCustomerWalletSummaries(
  maxUsers = 150,
): Promise<CustomerWalletSummary[]> {
  const [usersSnap, ledgerSnap] = await Promise.all([
    getDocs(query(collection(db, 'users'), limit(maxUsers))),
    getDocs(query(collection(db, BALANCE_LEDGER_COLLECTION), limit(2500))),
  ]);

  type Agg = { credits: number; debits: number; lastActivity: unknown };
  const aggByUser = new Map<string, Agg>();
  for (const d of ledgerSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const uid =
      (typeof data.userId === 'string' && data.userId) ||
      (typeof data.customerUid === 'string' && data.customerUid) ||
      '';
    if (!uid) continue;
    const delta = money(Number(data.delta ?? data.amount ?? 0));
    const prev = aggByUser.get(uid) ?? {
      credits: 0,
      debits: 0,
      lastActivity: null,
    };
    if (delta > 0) prev.credits = money(prev.credits + delta);
    else if (delta < 0) prev.debits = money(prev.debits + Math.abs(delta));
    const ts = data.createdAt ?? data.timestamp ?? null;
    if (ts && (!prev.lastActivity || String(ts) > String(prev.lastActivity))) {
      // Prefer Timestamp comparison via millis when available.
      const a =
        typeof (ts as { toMillis?: () => number }).toMillis === 'function'
          ? (ts as { toMillis: () => number }).toMillis()
          : 0;
      const b =
        prev.lastActivity &&
        typeof (prev.lastActivity as { toMillis?: () => number }).toMillis ===
          'function'
          ? (prev.lastActivity as { toMillis: () => number }).toMillis()
          : 0;
      if (a >= b) prev.lastActivity = ts;
    }
    aggByUser.set(uid, prev);
  }

  const rows: CustomerWalletSummary[] = [];
  for (const d of usersSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (!isCustomerUserRole(data.role)) continue;
    const agg = aggByUser.get(d.id);
    rows.push({
      userId: d.id,
      name: customerDisplayName(data, d.id),
      email: typeof data.email === 'string' ? data.email : null,
      currentBalance: parseHalfOrderBalance(data),
      totalCredits: agg?.credits ?? 0,
      totalDebits: agg?.debits ?? 0,
      lastActivity: agg?.lastActivity ?? data.updatedAt ?? null,
      updatedAt: data.updatedAt ?? null,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

/**
 * Admin-only: add or remove balance. Positive delta adds; negative removes.
 * Writes ledger entry for audit.
 */
export async function adminAdjustHalfOrderBalance(input: {
  userId: string;
  delta: number;
  reason?: string;
}): Promise<number> {
  const adminUid = auth.currentUser?.uid ?? '';
  if (!adminUid) throw new Error('Sign in required');
  const userId = input.userId.trim();
  if (!userId) throw new Error('User id required');
  const delta = money(input.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Enter a non-zero amount');
  }

  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('User not found');
  const current = parseHalfOrderBalance(snap.data() as Record<string, unknown>);
  const next = money(current + delta);
  if (next < 0) throw new Error('Balance cannot go below $0.00');

  await updateDoc(userRef, {
    [BALANCE_FIELD]: next,
    [LEGACY_FIELD]: next,
    updatedAt: serverTimestamp(),
  });

  const ledgerRef = doc(collection(db, BALANCE_LEDGER_COLLECTION));
  await setDoc(ledgerRef, {
    userId,
    delta,
    previousBalance: current,
    nextBalance: next,
    reason:
      typeof input.reason === 'string' && input.reason.trim()
        ? input.reason.trim()
        : null,
    adminUid,
    createdAt: serverTimestamp(),
  });

  return next;
}

export type AdminManualCustomerAdjustDirection = 'credit' | 'debit';

/**
 * Wallet Management: admin credit/debit for customer HalfOrder balance.
 * Writes immutable customer balanceLedger + Admin earnings ledger audit rows.
 */
export async function adminManualAdjustCustomerWallet(input: {
  customerUid: string;
  direction: AdminManualCustomerAdjustDirection;
  amount: number;
  reason: string;
  adminUid: string;
}): Promise<{ referenceId: string; customerTxId: string; adminTxId: string; newBalance: number }> {
  const adminUid = input.adminUid.trim() || auth.currentUser?.uid || '';
  if (!adminUid) throw new Error('Sign in required');
  const customerUid = input.customerUid.trim();
  if (!customerUid) throw new Error('Customer is required.');
  const amount = money(input.amount);
  if (!(amount > 0)) throw new Error('Amount must be greater than zero.');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reason is required.');
  if (input.direction !== 'credit' && input.direction !== 'debit') {
    throw new Error('Invalid adjustment type.');
  }

  const delta = input.direction === 'credit' ? amount : -amount;
  const type: CustomerBalanceLedgerType =
    input.direction === 'credit'
      ? 'admin_manual_customer_credit'
      : 'admin_manual_customer_debit';

  const userRef = doc(db, 'users', customerUid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Customer not found');
  const previousBalance = parseHalfOrderBalance(
    snap.data() as Record<string, unknown>,
  );
  const newBalance = money(previousBalance + delta);
  if (newBalance < 0) throw new Error('Balance cannot go below $0.00');

  const referenceId = `cust_adj_${adminUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`;
  const customerTxId = `${type}_${referenceId}`;
  const adminTxId = `${type}_admin_${referenceId}`;
  const ledgerRef = doc(db, BALANCE_LEDGER_COLLECTION, customerTxId);

  const existing = await getDoc(ledgerRef);
  if (existing.exists()) throw new Error('Adjustment already recorded.');

  await updateDoc(userRef, {
    [BALANCE_FIELD]: newBalance,
    [LEGACY_FIELD]: newBalance,
    updatedAt: serverTimestamp(),
  });

  await setDoc(ledgerRef, {
    type,
    userId: customerUid,
    customerUid,
    amount,
    delta,
    previousBalance,
    newBalance,
    nextBalance: newBalance,
    reason,
    adminUid,
    createdBy: adminUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
    referenceId,
    source: 'admin_manual_customer_adjust',
  });

  await writeAdminCustomerAdjustAudit({
    type,
    customerUid,
    amount,
    previousBalance,
    newBalance,
    reason,
    adminUid,
    referenceId,
    adminTxId,
  });

  return { referenceId, customerTxId, adminTxId, newBalance };
}

/**
 * Wallet Management: set customer HalfOrder balance to an exact value.
 */
export async function adminSetCustomerWalletBalance(input: {
  customerUid: string;
  newBalance: number;
  reason: string;
  adminUid: string;
}): Promise<{
  referenceId: string;
  customerTxId: string;
  adminTxId: string;
  previousBalance: number;
  newBalance: number;
  adjustmentAmount: number;
}> {
  const adminUid = input.adminUid.trim() || auth.currentUser?.uid || '';
  if (!adminUid) throw new Error('Sign in required');
  const customerUid = input.customerUid.trim();
  if (!customerUid) throw new Error('Customer is required.');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reason is required.');
  const target = money(input.newBalance);
  if (!(target >= 0) || !Number.isFinite(target)) {
    throw new Error('New balance must be zero or greater.');
  }

  const userRef = doc(db, 'users', customerUid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) throw new Error('Customer not found');
  const previousBalance = parseHalfOrderBalance(
    snap.data() as Record<string, unknown>,
  );
  const newBalance = target;
  const adjustmentAmount = money(newBalance - previousBalance);
  if (adjustmentAmount === 0) {
    throw new Error('New balance is the same as the current balance.');
  }

  const referenceId = `cust_set_${adminUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 10)}`;
  const customerTxId = `admin_balance_adjustment_${referenceId}`;
  const adminTxId = `admin_balance_adjustment_admin_${referenceId}`;
  const ledgerRef = doc(db, BALANCE_LEDGER_COLLECTION, customerTxId);

  const existing = await getDoc(ledgerRef);
  if (existing.exists()) throw new Error('Adjustment already recorded.');

  await updateDoc(userRef, {
    [BALANCE_FIELD]: newBalance,
    [LEGACY_FIELD]: newBalance,
    updatedAt: serverTimestamp(),
  });

  await setDoc(ledgerRef, {
    type: 'admin_balance_adjustment',
    userId: customerUid,
    customerUid,
    amount: money(Math.abs(adjustmentAmount)),
    delta: adjustmentAmount,
    adjustmentAmount,
    previousBalance,
    newBalance,
    nextBalance: newBalance,
    reason,
    adminUid,
    createdBy: adminUid,
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
    referenceId,
    source: 'admin_balance_adjustment',
  });

  await writeAdminCustomerAdjustAudit({
    type: 'admin_balance_adjustment',
    customerUid,
    amount: money(Math.abs(adjustmentAmount)),
    previousBalance,
    newBalance,
    reason,
    adminUid,
    referenceId,
    adminTxId,
    adjustmentAmount,
  });

  return {
    referenceId,
    customerTxId,
    adminTxId,
    previousBalance,
    newBalance,
    adjustmentAmount,
  };
}
