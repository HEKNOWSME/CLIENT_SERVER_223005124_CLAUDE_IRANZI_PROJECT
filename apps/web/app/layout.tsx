import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import { AuthProvider } from '../lib/auth';
import './globals.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex', display: 'swap' });

export const metadata: Metadata = {
  title: 'PMRMS | Patient Medical Records',
  description: 'Patient Medical Records Management System: secure, role-based access to medical history.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#146b5b' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <body suppressHydrationWarning><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
