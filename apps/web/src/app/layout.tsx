import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Providers } from '@/lib/providers';
import { Sidebar } from '@/components/sidebar';

export const metadata: Metadata = {
  title: 'TraceReplay AI',
  description: 'Audit-grade replay and lineage platform for enterprise AI agents',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden">
        <Providers>
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
