import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import './styles/globals.css';
// DELETED: The phantom LegacyPerformanceWrapper import
import { CpuSpike, FontShiftSaboteur, LateAnnouncementSaboteur } from '@/shared/lib/Saboteur';
import { SwetrixTracker } from '@/shared/analytics/SwetrixTracker';
import { ChatWidget } from '@/widgets/chat/ui/ChatWidget';
export const dynamic = 'force-dynamic';

// Inject the authentic Decathlon Font
const roboto = Roboto({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
});

// Lock the mobile viewport so users can't accidentally zoom in when tapping
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'Decathlon Digital Twin (Active-Staging)',
  description: 'Performance optimized simulation',
  icons: {
    icon: 'https://contents.mediadecathlon.com/s871302/k$102f9e421beebaa21c81cd9f1a0e5b7c/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={roboto.className}>
      {/* Apply font-sans to activate Roboto */}
      <body className="antialiased font-sans">
        {/* Our Sabotage Components listening to the router */}
        <CpuSpike />
        <FontShiftSaboteur />
        <LateAnnouncementSaboteur />

        <SwetrixTracker />
        <ChatWidget />

        {/* DELETED: The Legacy wrapper. Just rendering children directly now! */}
        {children}
      </body>
    </html>
  );
}
