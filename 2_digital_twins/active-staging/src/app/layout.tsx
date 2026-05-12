import type { Metadata } from 'next';
import './styles/globals.css';
// DELETED: The phantom LegacyPerformanceWrapper import
import { CpuSpike, LayoutShiftBomb } from '@/shared/lib/Saboteur';
import { SwetrixTracker } from '@/shared/analytics/SwetrixTracker';
import { ChatWidget } from '@/widgets/chat/ui/ChatWidget';

export const metadata: Metadata = {
  title: 'Decathlon Digital Twin (Baseline)',
  description: 'Performance baseline simulation',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <script async src="https://swetrix.org/swetrix.js" />
      </head>
      <body className="antialiased">
        {/* Our Sabotage Components listening to the router */}
        <CpuSpike />
        <SwetrixTracker />
        <ChatWidget />

        {/* DELETED: The Legacy wrapper. Just rendering children directly now! */}
        {children}
      </body>
    </html>
  );
}
