import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Share, Platform } from 'react-native';

import { db } from '@/services/firebase';
import type {
  EmoAiExecutiveReport,
  EmoAiReportPeriod,
} from '@/types/emoAiAgent';

import { buildEmoAiAnalyticsReport } from './emoAiAnalyticsService';
import {
  renderEmoAiReportHtml,
  renderEmoAiReportPlainText,
} from './emoAiPdfGenerator';

const COLLECTION = 'emoAiReports';

function newReportId(period: EmoAiReportPeriod): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${period}_${day}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate, persist, and return an executive report. */
export async function generateAndStoreEmoAiReport(
  period: EmoAiReportPeriod,
): Promise<EmoAiExecutiveReport> {
  const built = await buildEmoAiAnalyticsReport(period);
  const id = newReportId(period);
  const report: EmoAiExecutiveReport = {
    id,
    ...built,
    status: 'ready',
    pdfStoragePath: null,
    pdfDownloadUrl: null,
    archived: false,
  };

  await addDoc(collection(db, COLLECTION), {
    ...report,
    // keep id field in doc for search
  });

  return report;
}

export async function listEmoAiReports(args?: {
  period?: EmoAiReportPeriod | 'all';
  includeArchived?: boolean;
  search?: string;
}): Promise<EmoAiExecutiveReport[]> {
  let rows: EmoAiExecutiveReport[] = [];
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTION), orderBy('generatedAtMs', 'desc'), limit(100)),
    );
    rows = snap.docs.map((d) => {
      const data = d.data() as EmoAiExecutiveReport;
      return { ...data, id: data.id || d.id };
    });
  } catch {
    const snap = await getDocs(query(collection(db, COLLECTION), limit(100)));
    rows = snap.docs
      .map((d) => {
        const data = d.data() as EmoAiExecutiveReport;
        return { ...data, id: data.id || d.id };
      })
      .sort((a, b) => (b.generatedAtMs ?? 0) - (a.generatedAtMs ?? 0));
  }

  if (args?.period && args.period !== 'all') {
    rows = rows.filter((r) => r.period === args.period);
  }
  if (!args?.includeArchived) {
    rows = rows.filter((r) => !r.archived);
  }
  const q = (args?.search ?? '').trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.searchText?.includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }
  return rows;
}

export async function getEmoAiReport(
  reportId: string,
): Promise<EmoAiExecutiveReport | null> {
  // Prefer querying by embedded id field; fallback doc id
  const byField = await getDocs(
    query(collection(db, COLLECTION), where('id', '==', reportId), limit(1)),
  );
  if (!byField.empty) {
    const d = byField.docs[0]!;
    return { ...(d.data() as EmoAiExecutiveReport), id: reportId };
  }
  const direct = await getDoc(doc(db, COLLECTION, reportId));
  if (direct.exists()) {
    return { ...(direct.data() as EmoAiExecutiveReport), id: reportId };
  }
  return null;
}

export async function archiveEmoAiReport(firestoreDocId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, firestoreDocId), {
    archived: true,
    status: 'archived',
  });
}

export async function findReportFirestoreDocId(
  reportId: string,
): Promise<string | null> {
  const byField = await getDocs(
    query(collection(db, COLLECTION), where('id', '==', reportId), limit(1)),
  );
  if (!byField.empty) return byField.docs[0]!.id;
  const direct = await getDoc(doc(db, COLLECTION, reportId));
  return direct.exists() ? reportId : null;
}

/** Share/download report as text (PDF-ready HTML also available). */
export async function shareEmoAiReport(report: EmoAiExecutiveReport): Promise<void> {
  const text = renderEmoAiReportPlainText(report);
  await Share.share({
    title: report.title,
    message: text,
    url: Platform.OS === 'ios' ? undefined : undefined,
  });
}

export function getEmoAiReportHtml(report: EmoAiExecutiveReport): string {
  return renderEmoAiReportHtml(report);
}
