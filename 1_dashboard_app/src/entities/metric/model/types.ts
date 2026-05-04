import type { MetricKey, MetricItem } from '@/shared/lib/types';

// shared/lib/types의 공통 타입을 re-export하여 단일 진실 공급원 유지
export type { MetricKey, MetricItem };

export type MetricUnit = 's' | 'ms' | 'score' | 'KB';
export type MetricStatus = 'pass' | 'warning' | 'fail';

export interface BenchmarkScores {
  lighthouse: number;
  target_lighthouse: number;
}

export interface BenchmarkMetrics {
  lcp: MetricItem;
  cls: MetricItem;
  inp: MetricItem;
  tbt: MetricItem;
  fcp: MetricItem;
  speedIndex: MetricItem;
  assetSize: MetricItem;
}

export interface BenchmarkData {
  brand: string;
  isTarget: boolean;
  scores: BenchmarkScores;
  metrics: BenchmarkMetrics;
}

export interface PerformanceReport {
  timestamp: string;
  benchmarks: BenchmarkData[];
}
