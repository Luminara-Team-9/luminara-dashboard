// ─── AI Fix Plan ──────────────────────────────────────────────
export type FixPriority = 'critical' | 'high' | 'medium' | 'low';
export type FixEffort   = 'low' | 'medium' | 'high';

export interface AiFixPlan {
  id: string;
  brand: string;
  metricKey: string;
  title: string;
  description: string;
  priority: FixPriority;
  estimatedImpact: string;
  effort: FixEffort;
  impactScore: number;   // 0–10, ROI 매트릭스 y축용
}

// ─── Executive Summary ────────────────────────────────────────
export type GlobalStatus = 'optimal' | 'needs-improvement' | 'critical';

export interface ExecutiveSummary {
  globalScore: number;
  status: GlobalStatus;
  /** CVR/매출은 cvr.ts calcCvrLift()로 동적 계산 — baselineRevenue만 저장 */
  baselineAnnualRevenue: number;  // 연 매출 기준값 (원), CVR 계산 입력
  seoHealth: {
    rankPercentile: number;       // 상위 N%
    estimatedChange: number;      // 목표 달성 시 예상 변동 포인트
  };
  carbonFootprint: {
    gramsPerPageView: number;     // 현재 페이지뷰당 탄소 (g)
    savedGrams: number;           // 목표 달성 시 절감량 (g)
  };
}

// ─── Trends ───────────────────────────────────────────────────
export interface TrendDataset {
  brand: string;
  metricKey: string;
  values: number[];
}

export interface ReleaseMarker {
  date: string;       // ISO date (YYYY-MM-DD)
  version: string;
  description: string;
}

export interface Trends {
  labels: string[];   // 날짜 배열 (x축)
  datasets: TrendDataset[];
  releases: ReleaseMarker[];
}

// ─── RUM (Real User Monitoring) ───────────────────────────────
export type LatencyStatus = 'good' | 'warning' | 'poor';

export interface RegionalData {
  region: string;
  isp: string;
  avgLatency: number; // ms
  status: LatencyStatus;
}

export interface UserJourneyStep {
  step: string;
  sessions: number;
  dropoffRate: number; // %
  avgTime: number;     // seconds
  pageType: PageType;  // 해당 단계가 속한 페이지 유형 (latency 연계용)
}

export interface RUM {
  regionalData: RegionalData[];
  userJourney: UserJourneyStep[];
}

// ─── 벤치마크 지표 키 (entities/metric과 공유) ────────────────
export type MetricKey = 'lcp' | 'cls' | 'inp' | 'tbt' | 'fcp' | 'speedIndex' | 'assetSize';

export interface MetricItem {
  value: number;
  unit: string;
  target: number;
  label: string;
}

export interface BenchmarkEntry {
  brand: string;
  isTarget: boolean;
  scores: { lighthouse: number; seo: number; target_lighthouse: number };
  metrics: Record<MetricKey, MetricItem>;
}

// ─── 페이지별 벤치마크 (메인 / 상품 / 결제) ──────────────────
export type PageType = 'main' | 'product' | 'checkout';

export interface PageBenchmarkEntry {
  brand: string;
  page: PageType;
  scores: { lighthouse: number; seo: number; target_lighthouse: number };
  metrics: Record<MetricKey, MetricItem>;
}

// ─── 최종 API 응답 (route.ts 반환 타입) ───────────────────────
export interface PerformanceApiResponse {
  timestamp: string;
  executiveSummary: ExecutiveSummary;
  benchmarks: BenchmarkEntry[];
  pageMetrics: PageBenchmarkEntry[];
  trends: Trends;
  rum: RUM;
  aiFixPlans: AiFixPlan[];
}
