import type { Metadata } from 'next';
import { PerformanceDataProvider } from './providers/PerformanceDataProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '데카트론 웹 품질 대시보드',
  description: '공개 URL 기반 웹 성능, 기술 SEO, 최적화 우선순위 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <PerformanceDataProvider>
          {children}
        </PerformanceDataProvider>
      </body>
    </html>
  );
}
