'use client';

import { db } from '@/lib/firebase';
import { firestoreTimeToMs, formatDateTime } from '@/lib/dates';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

type Row = {
  id: string;
  email: string;
  createdMs: number;
};

export default function UsersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: Row[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const email =
            typeof data.email === 'string'
              ? data.email
              : typeof data.phoneNumber === 'string'
                ? data.phoneNumber
                : '—';
          const createdMs = firestoreTimeToMs(data.createdAt) ?? 0;
          return { id: d.id, email, createdMs };
        });
        list.sort((a, b) => b.createdMs - a.createdMs);
        setRows(list);
        setReady(true);
      },
      () => setReady(true),
    );
    return () => unsub();
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Live · users collection</p>
      </div>

      {!ready ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    User ID
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Email
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Created at
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No users
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs text-slate-600">
                        {r.id}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{r.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {r.createdMs ? formatDateTime(r.createdMs) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
