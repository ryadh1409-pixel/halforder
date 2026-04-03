'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type Point = { day: string; count: number };

export function DashboardCharts({
  ordersPerDay,
  usersPerDay,
}: {
  ordersPerDay: Point[];
  usersPerDay: Point[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Orders per day</h3>
        <p className="text-xs text-slate-500">Last 14 days (UTC date)</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ordersPerDay} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Orders"
                stroke="#0f172a"
                strokeWidth={2}
                dot={{ r: 3, fill: '#0f172a' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">New users per day</h3>
        <p className="text-xs text-slate-500">By account createdAt (UTC date)</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={usersPerDay} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Users"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: '#10b981' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
