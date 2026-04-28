/**
 * Admin interface note:
 * - This `admin-dashboard/` app is the primary web admin surface.
 * - It complements the in-app admin screens under `app/admin/`.
 * - The legacy Next.js admin under `admin/` remains for compatibility during migration.
 */
import { AuthProvider } from '@/components/AuthProvider';
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'OurFood Admin · HalfOrder',
  description: 'Secure admin dashboard for OurFood / HalfOrder',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
