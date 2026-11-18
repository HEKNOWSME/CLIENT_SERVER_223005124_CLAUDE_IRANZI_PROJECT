import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PMRMS | Local workspace',
  description: 'Patient Medical Records Management System local development workspace.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
