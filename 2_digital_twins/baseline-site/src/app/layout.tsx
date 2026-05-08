import type { Metadata } from 'next';
import './styles/globals.css';
import { LegacyPerformanceWrapper } from '@/shared/lib/Saboteur'; // <-- 1. Import the wrapper

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
        {/* WRAP THE CHILDREN TO SABOTAGE THE HYDRATION PHASE */}
        <LegacyPerformanceWrapper>{children}</LegacyPerformanceWrapper>
      </body>
    </html>
  );
}
