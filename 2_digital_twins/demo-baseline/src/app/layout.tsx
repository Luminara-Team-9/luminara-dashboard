import type { Metadata } from 'next';
import './styles/globals.css';
import { LegacyPerformanceWrapper } from '@/shared/lib/Saboteur';
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
        {/* PILLAR 6: Render-Blocking CSS Trap */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          /* Simulating 50kb of unused legacy CSS */
          .legacy-header-v1 { margin: 0; padding: 0; display: block; }
          .legacy-footer-v1 { margin: 0; padding: 0; display: block; }
          /* ... imagine 10,000 lines of this ... */
          ${Array(5000)
            .fill(
              '.unused-class-' + Math.random().toString(36).substring(7) + ' { display: none; }',
            )
            .join('')}
        `,
          }}
        />
      </head>
      <body className="antialiased">
        <SwetrixTracker /> <ChatWidget />
        <LegacyPerformanceWrapper>{children}</LegacyPerformanceWrapper>
      </body>
    </html>
  );
}
