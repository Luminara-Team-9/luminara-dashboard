import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '웹 성능 모니터링 대시보드',
  description: '데카트론 vs 경쟁사 Lighthouse 성능 지표 비교',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
