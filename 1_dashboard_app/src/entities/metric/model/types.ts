export type MetricUnit = 's' | 'ms' | 'score' | 'KB';
export type MetricStatus = 'pass' | 'warning' | 'fail';
export type MetricKey = 'lcp' | 'cls' | 'tbt' | 'fcp' | 'speedIndex' | 'assetSize';

export interface MetricItem {
  value: number;
  unit: MetricUnit;
  target: number;
  label: string;
}

export interface BenchmarkScores {
  lighthouse: number;
  target_lighthouse: number;
}

export interface BenchmarkMetrics {
  lcp: MetricItem;
  cls: MetricItem;
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
