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
}

// ─── Executive Summary ────────────────────────────────────────
export type GlobalStatus = 'optimal' | 'needs-improvement' | 'critical';

export interface ExecutiveSummary {
  globalScore: number;
  status: GlobalStatus;
  roiImpact: {
    cvrLift: number;              // 전환율 상승 예측 (%)
    annualRevenueImpact: number;  // 연간 매출 증가 예측 (원)
  };
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
}

export interface RUM {
  regionalData: RegionalData[];
  userJourney: UserJourneyStep[];
}

// ─── 최종 API 응답 (route.ts 반환 타입) ───────────────────────
export interface PerformanceApiResponse {
  timestamp: string;
  executiveSummary: ExecutiveSummary;
  benchmarks: {
    brand: string;
    isTarget: boolean;
    scores: { lighthouse: number; target_lighthouse: number };
    metrics: Record<
      string,
      { value: number; unit: string; target: number; label: string }
    >;
  }[];
  trends: Trends;
  rum: RUM;
  aiFixPlans: AiFixPlan[];
}
