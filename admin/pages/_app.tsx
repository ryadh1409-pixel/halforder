/**
 * Admin interface note:
 * - This `admin/` Next.js app is legacy and kept for backward compatibility.
 * - Primary web admin is `admin-dashboard/`.
 * - In-app operational admin screens still live in `app/admin/`.
 */
import '@/styles/globals.css';
import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
