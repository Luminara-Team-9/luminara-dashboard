// ─── AI Fix Plan ──────────────────────────────────────────────
export type FixPriority = 'critical' | 'high' | 'medium' | 'low';
export type FixEffort   = 'low' | 'medium' | 'high';
export type DataConfidence = 'measured' | 'estimated' | 'proxy' | 'mock';

export interface AiFixDecisionDetail {
  problem?: string;
  area?: string;
  reason?: string;
  evidence?: string;
  fix?: string;
  codeTitle?: string;
  beforeCode?: string;
  afterCode?: string;
  conclusion?: string;
  source?: string;
  generatedAt?: string;
}

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
  autoApplicable?: boolean;
  changeCount?: number;
  decision?: AiFixDecisionDetail;
  remediationStatus?: AiActionApplyStatus;
  remediationRunId?: string;
  remediationMessage?: string;
  patchStatus?: string;
  buildStatus?: string;
  rejectionReason?: string;
  lastHistoryEvent?: {
    event?: string;
    patch_status?: string;
    error_message?: string;
    worker_id?: string;
    time?: string;
    [key: string]: unknown;
  };
}

export type AiActionApplyStatus =
  | 'pending-connection'
  | 'approval-ready'
  | 'approval-pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected';

export interface AiActionApplyRequest {
  actionId: string;
  requestedAt: string;
  source: 'dashboard';
  action: 'apply';
  planSnapshot: {
    id: string;
    brand: string;
    metricKey: string;
    title: string;
    priority: FixPriority;
    estimatedImpact: string;
    decision?: AiFixDecisionDetail;
    autoApplicable?: boolean;
    changeCount?: number;
  };
}

export interface AiActionApplyResponse {
  actionId: string;
  accepted: boolean;
  status: AiActionApplyStatus;
  message: string;
  runId?: string;
  queuedAt?: string;
  nextPollMs?: number;
  source: 'remediation-agent' | 'dashboard-contract' | 'dashboard-api';
}

// ─── Executive Summary ────────────────────────────────────────
export type GlobalStatus = 'optimal' | 'needs-improvement' | 'critical';

export interface ExecutiveSummary {
  globalScore: number;
  status: GlobalStatus;
  /** 내부 매출 연동 전에는 mock 기준값으로만 사용 */
  baselineAnnualRevenue: number;  // 연 매출 기준값 (원), 확정 매출 예측이 아님
  seoHealth: {
    rankPercentile: number;       // 상위 N%
    estimatedChange: number;      // 목표 달성 시 예상 변동 포인트
  };
  carbonFootprint: {
    gramsPerPageView: number;     // 현재 페이지뷰당 탄소 (g)
    savedGrams: number;           // 목표 달성 시 절감량 (g)
  };
}

export interface BusinessMetrics {
  performanceAudit?: {
    latestMeasuredAt?: string;
    source?: string;
    period?: string;
    pages?: PageType[];
    confidence?: DataConfidence;
  };
  trafficSessions?: {
    sessions: number;
    visitors?: number;
    changeRate?: number;
    engagementRate?: number;
    bounceRate?: number;
    pagesPerSession?: number;
    averageOrderValue?: number;
    competitorTraffic?: {
      brand: string;
      sessions: number;
      categoryRank?: number;
      seoVisibilityPercentile?: number;
      pagesPerSession?: number;
      bounceRate?: number;
      averageVisitDuration?: string;
      primaryTrafficSource?: string;
      group: 'sports-brand' | 'commerce-platform';
      source?: string;
      confidence?: DataConfidence;
    }[];
    source?: string;
    period?: string;
    confidence?: DataConfidence;
  };
  acquisitionChannels?: {
    channel: string;
    sessions: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
    bounceRate: number;
    averageOrderValue: number;
  }[];
  deviceSegments?: {
    device: 'Mobile' | 'Desktop' | 'Tablet';
    sessions: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
    bounceRate: number;
    averageOrderValue: number;
  }[];
  competitiveSignals?: {
    brand: string;
    group: 'sports-brand' | 'commerce-platform';
    productCount?: number;
    source?: string;
    period?: string;
    confidence?: DataConfidence;
  }[];
  conversionRate?: {
    value: number;
    target?: number;
    source?: string;
    period?: string;
    isProxy?: boolean;
  };
  internalRevenueModel?: {
    source: string;
    period: string;
    confidence: DataConfidence;
    currentInputs: {
      sessions: number;
      pageViews: number;
      events: number;
      purchaseSessions: number;
      baselineEngagementMinutes: number;
      measuredEngagementMinutes: number | null;
      eventSource: string;
    };
    coefficients: {
      revenuePerSession: number;
      revenuePerThousandSessions: number;
      revenuePerEngagedSession: number;
      revenuePerEngagementMinute: number;
      revenuePerEvent: number;
      revenuePerKeyEvent: number;
      engagementRate: number;
      newVisitRate: number;
      avgEngagementSecondsPerSession: number;
      eventsPerSession: number;
      keyEventSessionRate: number;
    };
    estimates: {
      key: 'sessions' | 'baseline_engagement_time' | 'events';
      label: string;
      value: number;
      inputLabel: string;
      inputValue: number;
      formula: string;
      confidence: DataConfidence;
    }[];
    referenceBenchmarks?: {
      label: string;
      value: string;
      note: string;
      source: string;
    }[];
    caveat: string;
  };
  availableProducts?: {
    count: number;
    source?: string;
    period?: string;
  };
  searchVisibility?: {
    relativeRankPercentile: number;
    seoScore?: number;
    keywordSet?: string;
    competitorsAhead?: number;
    source?: string;
    period?: string;
  };
}

// ─── Trends ───────────────────────────────────────────────────
export interface TrendDataset {
  brand: string;
  metricKey: string;
  values: Array<number | null>;
}

export interface ReleaseMarker {
  date: string;       // ISO date (YYYY-MM-DD)
  version: string;
  description: string;
  changeLog?: string[];
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
  sessions?: number;
}

export interface UserJourneyStep {
  step: string;
  sessions: number;
  dropoffRate: number; // %
  avgTime: number;     // seconds
  pageType: PageType;  // 해당 단계가 속한 페이지 유형 (latency 연계용)
}

export interface SessionPathPattern {
  id: string;
  name: string;
  source: string;
  device: 'Mobile' | 'Desktop' | 'Tablet';
  sessions: number;
  share: number;
  outcome: 'purchase' | 'dropoff';
  lastStep: string;
  path: {
    step: string;
    detail?: string;
    event: string;
    pageType: PageType;
  }[];
}

export interface RumPagePerformance {
  path: string;
  sessions: number;
  pageViews?: number;
  loadingSamples?: number;
  avgPageLoad?: number;
  p75PageLoad?: number;
}

export type RumCollectionStatus = 'live' | 'delayed' | 'stale' | 'empty';

export interface RumProjectIngestionStatus {
  projectId: string;
  latestEventAt?: string;
  secondsSinceLatest: number | null;
  recentEvents5m: number;
  recentEvents15m: number;
  totalEvents: number;
}

export interface RumIngestionStatus {
  status: RumCollectionStatus;
  latestEventAt?: string;
  secondsSinceLatest: number | null;
  recentEvents5m: number;
  recentEvents15m: number;
  projectStatuses: RumProjectIngestionStatus[];
}

export interface RUM {
  regionalData: RegionalData[];
  userJourney: UserJourneyStep[];
  sessionPaths?: SessionPathPattern[];
  pagePerformance?: RumPagePerformance[];
  latestCollectedAt?: string;
  ingestion?: RumIngestionStatus;
}

// ─── 벤치마크 지표 키 (entities/metric과 공유) ────────────────
export type MetricKey = 'lcp' | 'cls' | 'inp' | 'tbt' | 'fcp' | 'speedIndex' | 'assetSize';

export interface MetricItem {
  value: number;
  unit: string;
  target: number;
  label: string;
  available?: boolean;
}

export interface ResourceEfficiency {
  totalWeightKb?: number;
  jsKb?: number;
  cssKb?: number;
  imageKb?: number;
  requestCount?: number;
  thirdPartyRequestCount?: number;
  renderBlockingCount?: number;
  unusedJsKb?: number;
  unusedCssKb?: number;
  imageOptimizationKb?: number;
  modernImageFormatReady?: boolean;
}

export interface TechnicalSeoChecks {
  title?: boolean;
  metaDescription?: boolean;
  canonical?: boolean;
  robotsTxt?: boolean;
  sitemap?: boolean;
  structuredData?: boolean;
  h1?: boolean;
  imageAltRatio?: number;
  mobileViewport?: boolean;
  crawlableLinks?: boolean;
}

export interface CruxFieldData {
  availability: 'available' | 'unavailable';
  source: 'CrUX API' | 'PageSpeed CrUX' | 'none';
  formFactor?: 'mobile' | 'desktop';
  lcp?: number;
  inp?: number;
  cls?: number;
  collectedAt?: string;
}

export interface DomainPopularity {
  trancoRank?: number;
  cloudflareRank?: number;
  collectedAt?: string;
}

export interface AuditChecks {
  textCompression?: boolean;
  javascriptMinified?: boolean;
  lazyLoadImages?: boolean;
  properlySizedImages?: boolean;
  fontDisplaySwap?: boolean;
  longTermCache?: boolean;
  cdn?: boolean;
  http2?: boolean;
  dnsPrefetch?: boolean;
  preconnect?: boolean;
  gzipBrotli?: boolean;
  serviceWorker?: boolean;
  reactMemo?: boolean;
  virtualScroll?: boolean;
  codeSplitting?: boolean;
  dynamicImport?: boolean;
  aboveFoldPriority?: boolean;
  https?: boolean;
  hsts?: boolean;
  csp?: boolean;
  noMixedContent?: boolean;
  sri?: boolean;
  errorTracking?: boolean;
  performanceBudget?: boolean;
  lighthouseCi?: boolean;
  realDeviceTesting?: boolean;
}

export interface BenchmarkEntry {
  brand: string;
  isTarget: boolean;
  scores: { lighthouse: number; seo: number; target_lighthouse: number };
  metrics: Record<MetricKey, MetricItem>;
  resource?: ResourceEfficiency;
  technicalSeo?: TechnicalSeoChecks;
  auditChecks?: AuditChecks;
  fieldData?: CruxFieldData;
  domainPopularity?: DomainPopularity;
}

// ─── 페이지별 벤치마크 (메인 / 상품 / 결제) ──────────────────
export type PageType = 'main' | 'category' | 'product' | 'checkout';

export interface PageBenchmarkEntry {
  brand: string;
  page: PageType;
  scores: { lighthouse: number; seo: number; target_lighthouse: number };
  metrics: Record<MetricKey, MetricItem>;
  resource?: ResourceEfficiency;
  technicalSeo?: TechnicalSeoChecks;
  auditChecks?: AuditChecks;
  fieldData?: CruxFieldData;
  domainPopularity?: DomainPopularity;
}

// ─── 최종 API 응답 (route.ts 반환 타입) ───────────────────────
export interface PerformanceApiResponse {
  timestamp: string;
  executiveSummary: ExecutiveSummary;
  businessMetrics?: BusinessMetrics;
  benchmarks: BenchmarkEntry[];
  pageMetrics: PageBenchmarkEntry[];
  trends: Trends;
  rum: RUM;
  aiFixPlans: AiFixPlan[];
}
