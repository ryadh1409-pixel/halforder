'use client';

import { db } from '@/lib/firebase';
import { firestoreTimeToMs, formatDateTime } from '@/lib/dates';
import {
  isActiveOrderStatus,
  orderCreatorUid,
  orderFoodLabel,
} from '@/lib/orders-helpers';
import { collection, onSnapshot } from 'firebase/firestore';
import { useMemo, useState, useEffect } from 'react';

type Row = {
  id: string;
  food: string;
  status: string;
  createdMs: number;
  userId: string;
};

export default function OrdersPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const list: Row[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const createdMs = firestoreTimeToMs(data.createdAt) ?? 0;
          return {
            id: d.id,
            food: orderFoodLabel(data),
            status:
              typeof data.status === 'string' ? data.status : '—',
            createdMs,
            userId: orderCreatorUid(data) || '—',
          };
        });
        list.sort((a, b) => b.createdMs - a.createdMs);
        setRows(list);
        setReady(true);
      },
      () => setReady(true),
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'active') {
      return rows.filter((r) => isActiveOrderStatus(r.status));
    }
    if (filter === 'completed') {
      return rows.filter((r) => r.status === 'completed');
    }
    return rows;
  }, [rows, filter]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Orders</h1>
        <p className="mt-1 text-sm text-slate-500">Live · Firestore orders</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'active', 'completed'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? 'rounded-full bg-slate-900 px-4 py-1.5 text-sm font-medium text-white'
                : 'rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700'
            }
          >
            {key === 'all' ? 'All' : key === 'active' ? 'Active' : 'Completed'}
          </button>
        ))}
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
                    Order ID
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Food
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Status
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    Created
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    User ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-500"
                    >
                      No orders in this filter
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="max-w-[120px] truncate px-4 py-3 font-mono text-xs text-slate-600">
                        {r.id}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{r.food}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {r.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {r.createdMs
                          ? formatDateTime(r.createdMs)
                          : '—'}
                      </td>
                      <td className="max-w-[140px] truncate px-4 py-3 font-mono text-xs text-slate-600">
                        {r.userId}
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
