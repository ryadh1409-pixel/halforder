import { auth, db } from '@/services/firebase';
import type {
  FinanceExpense,
  FinanceExpenseCategory,
} from '@/types/financeDashboard';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

const COL = 'financeExpenses';

export const FINANCE_EXPENSE_CATEGORIES: {
  id: FinanceExpenseCategory;
  label: string;
}[] = [
  { id: 'google_maps', label: 'Google Maps API' },
  { id: 'firebase', label: 'Firebase' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'stripe_fees', label: 'Stripe Fees' },
  { id: 'hosting', label: 'Hosting' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'operations', label: 'Operations' },
  { id: 'manual', label: 'Manual Expenses' },
  { id: 'other', label: 'Other / Future' },
];

function mapExpense(id: string, data: Record<string, unknown>): FinanceExpense {
  return {
    id,
    category: (typeof data.category === 'string'
      ? data.category
      : 'other') as FinanceExpenseCategory,
    label: typeof data.label === 'string' ? data.label : 'Expense',
    amount: typeof data.amount === 'number' ? data.amount : 0,
    notes: typeof data.notes === 'string' ? data.notes : '',
    createdAtMs: safeToMillis(data.createdAt),
    updatedAtMs: safeToMillis(data.updatedAt),
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : null,
  };
}

export function subscribeFinanceExpenses(
  onRows: (rows: FinanceExpense[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL), orderBy('createdAt', 'desc')),
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapExpense(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    () => onRows([]),
  );
}

export async function addFinanceExpense(input: {
  category: FinanceExpenseCategory;
  label: string;
  amount: number;
  notes: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid ?? null;
  const ref = await addDoc(collection(db, COL), {
    category: input.category,
    label: input.label.trim() || 'Expense',
    amount: input.amount,
    notes: input.notes.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: uid,
  });
  return ref.id;
}

export async function updateFinanceExpense(
  id: string,
  input: {
    category: FinanceExpenseCategory;
    label: string;
    amount: number;
    notes: string;
  },
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    category: input.category,
    label: input.label.trim() || 'Expense',
    amount: input.amount,
    notes: input.notes.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFinanceExpense(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}

export function sumFinanceExpenses(rows: FinanceExpense[]): number {
  return rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);
}
