import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from './providers';
import AppShell from '@/features/shell/components/app-shell';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'WWPro – Projektplanung',
  description: 'Projektverwaltung mit automatischer Terminberechnung, Arbeitskalendern und Team-Auslastung',
};

/**
 * Root layout: German locale, fonts, client providers and the app shell
 * (sidebar navigation + command palette).
 * @param props - Contains the page content as React children.
 * @returns The HTML document skeleton wrapping all pages.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
