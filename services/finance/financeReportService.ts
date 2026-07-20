import { auth, db } from '@/services/firebase';
import type { FinanceStoredReport } from '@/types/financeDashboard';
import { safeToMillis } from '@/utils/safeToMillis';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

const COL = 'financeReports';

function mapReport(id: string, data: Record<string, unknown>): FinanceStoredReport {
  const period = data.period;
  return {
    id,
    title: typeof data.title === 'string' ? data.title : 'Financial Report',
    period:
      period === 'daily' ||
      period === 'weekly' ||
      period === 'monthly' ||
      period === 'yearly'
        ? period
        : 'monthly',
    body: typeof data.body === 'string' ? data.body : '',
    createdAtMs: safeToMillis(data.createdAt),
    archived: data.archived === true,
  };
}

export function subscribeFinanceReports(
  onRows: (rows: FinanceStoredReport[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, COL), orderBy('createdAt', 'desc')),
    (snap) => {
      onRows(
        snap.docs.map((d) =>
          mapReport(d.id, d.data() as Record<string, unknown>),
        ),
      );
    },
    () => onRows([]),
  );
}

export async function saveFinanceReport(input: {
  title: string;
  period: FinanceStoredReport['period'];
  body: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    title: input.title,
    period: input.period,
    body: input.body,
    archived: false,
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid ?? null,
  });
  return ref.id;
}

export async function archiveFinanceReport(id: string): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    archived: true,
    updatedAt: serverTimestamp(),
  });
}
