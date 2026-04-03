'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/food', label: 'Food Cards' },
  { href: '/orders', label: 'Orders' },
  { href: '/users', label: 'Users' },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <aside className="flex w-60 flex-col border-r border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          OurFood
        </p>
        <p className="mt-1 text-lg font-semibold text-slate-900">Admin</p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                active
                  ? 'rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-medium text-white shadow-sm'
                  : 'rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50'
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <p className="truncate text-xs text-slate-500">{user?.email}</p>
        <button
          type="button"
          onClick={() => logout()}
          className="mt-2 text-sm font-medium text-red-600 hover:text-red-700"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
