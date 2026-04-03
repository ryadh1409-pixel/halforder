'use client';

import { DashboardCharts } from '@/components/DashboardCharts';
import { StatCard } from '@/components/StatCard';
import { bucketCountsByDay } from '@/lib/chart-buckets';
import { db } from '@/lib/firebase';
import { firestoreTimeToMs, startOfTodayMs } from '@/lib/dates';
import { isActiveOrderStatus } from '@/lib/orders-helpers';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

export default function DashboardPage() {
  const [ordersReady, setOrdersReady] = useState(false);
  const [usersReady, setUsersReady] = useState(false);
  const [orderRows, setOrderRows] = useState<
    { id: string; createdMs: number; status: string }[]
  >([]);
  const [userRows, setUserRows] = useState<{ id: string; createdMs: number }[]>(
    [],
  );

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ms = firestoreTimeToMs(data.createdAt) ?? 0;
          const status =
            typeof data.status === 'string' ? data.status : 'unknown';
          return { id: d.id, createdMs: ms, status };
        });
        setOrderRows(list);
        setOrdersReady(true);
      },
      () => setOrdersReady(true),
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const ms = firestoreTimeToMs(data.createdAt) ?? 0;
          return { id: d.id, createdMs: ms };
        });
        setUserRows(list);
        setUsersReady(true);
      },
      () => setUsersReady(true),
    );
    return () => unsub();
  }, []);

  const todayStart = startOfTodayMs();

  const metrics = useMemo(() => {
    const totalUsers = userRows.length;
    const totalOrders = orderRows.length;
    const activeOrders = orderRows.filter((o) =>
      isActiveOrderStatus(o.status),
    ).length;
    const ordersToday = orderRows.filter(
      (o) => o.createdMs >= todayStart,
    ).length;
    return {
      totalUsers,
      totalOrders,
      activeOrders,
      ordersToday,
    };
  }, [orderRows, userRows, todayStart]);

  const ordersPerDay = useMemo(
    () =>
      bucketCountsByDay(
        orderRows.map((o) => o.createdMs).filter((m) => m > 0),
        14,
      ),
    [orderRows],
  );

  const usersPerDay = useMemo(
    () =>
      bucketCountsByDay(
        userRows.map((u) => u.createdMs).filter((m) => m > 0),
        14,
      ),
    [userRows],
  );

  const loading = !ordersReady || !usersReady;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live metrics from Firestore · updates automatically
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
          <p className="text-sm text-slate-500">Loading data…</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total users"
              value={metrics.totalUsers}
              hint="documents in users"
            />
            <StatCard
              title="Total orders"
              value={metrics.totalOrders}
              hint="all statuses"
            />
            <StatCard
              title="Active orders"
              value={metrics.activeOrders}
              hint="non-terminal statuses (e.g. waiting, matched, active)"
            />
            <StatCard
              title="Orders today"
              value={metrics.ordersToday}
              hint="created since local midnight"
            />
          </div>
          <div className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              Growth
            </h2>
            <DashboardCharts
              ordersPerDay={ordersPerDay}
              usersPerDay={usersPerDay}
            />
          </div>
        </>
      )}
    </div>
  );
}
