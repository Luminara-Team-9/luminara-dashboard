import type { MetricKey, PageType } from '@/shared/lib/types';

export interface AuditTarget {
  id: string;
  brand: string;
  page: PageType;
  url: string;
  isTarget: boolean;
}

export const AUDIT_TARGETS: AuditTarget[] = [
  {
    id: 'decathlon-main',
    brand: 'Decathlon',
    page: 'main',
    url: 'https://www.decathlon.co.kr',
    isTarget: true,
  },
  {
    id: 'decathlon-product',
    brand: 'Decathlon',
    page: 'product',
    url: 'https://www.decathlon.co.kr/collections',
    isTarget: true,
  },
  {
    id: 'decathlon-checkout',
    brand: 'Decathlon',
    page: 'checkout',
    url: 'https://www.decathlon.co.kr/cart',
    isTarget: true,
  },
  {
    id: 'coupang-main',
    brand: 'Coupang',
    page: 'main',
    url: 'https://www.coupang.com',
    isTarget: false,
  },
  {
    id: 'ssg-main',
    brand: 'SSG.com',
    page: 'main',
    url: 'https://www.ssg.com',
    isTarget: false,
  },
  {
    id: 'naver-shopping-main',
    brand: 'Naver Shopping',
    page: 'main',
    url: 'https://shopping.naver.com',
    isTarget: false,
  },
  {
    id: 'nike-korea-main',
    brand: 'Nike Korea',
    page: 'main',
    url: 'https://www.nike.com/kr',
    isTarget: false,
  },
];

export const METRIC_TARGETS: Record<MetricKey, { label: string; target: number; unit: string }> = {
  lcp: { label: 'LCP', target: 2.5, unit: 's' },
  cls: { label: 'CLS', target: 0.1, unit: 'score' },
  inp: { label: 'INP', target: 200, unit: 'ms' },
  tbt: { label: 'TBT', target: 200, unit: 'ms' },
  fcp: { label: 'FCP', target: 1.8, unit: 's' },
  speedIndex: { label: 'Speed Index', target: 3.4, unit: 's' },
  assetSize: { label: 'Asset Size', target: 200, unit: 'KB' },
};

export const TARGET_LIGHTHOUSE_SCORE = 90;
