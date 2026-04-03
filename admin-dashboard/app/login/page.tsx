'use client';

import { useAuth } from '@/components/AuthProvider';
import { ADMIN_EMAIL } from '@/lib/admin-constants';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const { user, ready, isAdmin, signInAdmin, authError } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (user && isAdmin) router.replace('/dashboard');
  }, [ready, user, isAdmin, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setSubmitting(true);
    try {
      await signInAdmin(email, password);
      router.replace('/dashboard');
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code: string }).code)
          : '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setLocalError('Invalid email or password.');
      } else if (code === 'auth/too-many-requests') {
        setLocalError('Too many attempts. Try again later.');
      } else if (err instanceof Error && err.message === 'Not admin email') {
        /* already in authError */
      } else {
        setLocalError('Sign-in failed. Check credentials and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const displayError = localError || authError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">
          OurFood Admin
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold text-slate-900">
          Sign in
        </h1>
        <p className="mt-2 text-center text-sm text-slate-500">
          Restricted to <span className="font-mono text-slate-700">{ADMIN_EMAIL}</span>
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>
          {displayError ? (
            <p className="text-sm text-red-600" role="alert">
              {displayError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Continue'}
          </button>
        </form>
        <p className="mt-8 text-center text-xs text-slate-400">
          Firebase Auth must have this user enabled (Email/Password).
        </p>
      </div>
    </div>
  );
}
