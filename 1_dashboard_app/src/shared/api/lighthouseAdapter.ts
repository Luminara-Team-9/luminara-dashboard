import type {
  BenchmarkEntry,
  CruxFieldData,
  MetricItem,
  PageBenchmarkEntry,
  PerformanceApiResponse,
  ResourceEfficiency,
  TechnicalSeoChecks,
} from '@/shared/lib/types';
import type { AuditTarget } from '@/shared/config/auditTargets';
import { METRIC_TARGETS, TARGET_LIGHTHOUSE_SCORE } from '@/shared/config/auditTargets';

type LighthouseScoreCategory = {
  score?: number | null;
};

type LighthouseAudit = {
  numericValue?: number;
  score?: number | null;
  details?: {
    overallSavingsBytes?: number;
    items?: Record<string, unknown>[];
  };
};

type LoadingExperienceMetric = {
  percentile?: number;
};

type LoadingExperience = {
  metrics?: Record<string, LoadingExperienceMetric | undefined>;
};

export interface LighthouseResultLike {
  fetchTime?: string;
  categories?: {
    performance?: LighthouseScoreCategory;
    seo?: LighthouseScoreCategory;
  };
  audits?: Record<string, LighthouseAudit | undefined>;
  loadingExperience?: LoadingExperience;
  originLoadingExperience?: LoadingExperience;
}

export interface LighthouseSnapshotInput {
  target: AuditTarget;
  result: LighthouseResultLike;
}

function scoreToPoint(score: number | null | undefined): number {
  if (typeof score !== 'number') return 0;
  return Math.round(score * 100);
}

function auditValue(result: LighthouseResultLike, auditId: string): number {
  const value = result.audits?.[auditId]?.numericValue;
  return typeof value === 'number' ? value : 0;
}

function msToSeconds(ms: number): number {
  return Math.round((ms / 1000) * 10) / 10;
}

function bytesToKb(bytes: number): number {
  return Math.round(bytes / 1024);
}

function savingsKb(result: LighthouseResultLike, auditId: string): number | undefined {
  const bytes = result.audits?.[auditId]?.details?.overallSavingsBytes;
  return typeof bytes === 'number' && bytes > 0 ? bytesToKb(bytes) : undefined;
}

function auditPassed(result: LighthouseResultLike, auditId: string): boolean | undefined {
  const score = result.audits?.[auditId]?.score;
  return typeof score === 'number' ? score >= 0.9 : undefined;
}

function networkItems(result: LighthouseResultLike): Record<string, unknown>[] {
  return result.audits?.['network-requests']?.details?.items ?? [];
}

function itemTransferKb(item: Record<string, unknown>): number {
  const transferSize = item.transferSize;
  return typeof transferSize === 'number' ? bytesToKb(transferSize) : 0;
}

function itemType(item: Record<string, unknown>): string {
  return String(item.resourceType ?? item.mimeType ?? '').toLowerCase();
}

function sumTransferByType(result: LighthouseResultLike, matcher: (type: string) => boolean): number | undefined {
  const total = networkItems(result).reduce((sum, item) => {
    const type = itemType(item);
    return matcher(type) ? sum + itemTransferKb(item) : sum;
  }, 0);
  return total > 0 ? total : undefined;
}

function mapResourceEfficiency(result: LighthouseResultLike): ResourceEfficiency {
  const requests = networkItems(result);
  const thirdPartyItems = result.audits?.['third-party-summary']?.details?.items ?? [];
  const renderBlockingItems = result.audits?.['render-blocking-resources']?.details?.items ?? [];

  return {
    totalWeightKb: bytesToKb(auditValue(result, 'total-byte-weight')),
    jsKb: sumTransferByType(result, (type) => type.includes('script') || type.includes('javascript')),
    cssKb: sumTransferByType(result, (type) => type.includes('stylesheet') || type.includes('css')),
    imageKb: sumTransferByType(result, (type) => type.includes('image')),
    requestCount: requests.length || undefined,
    thirdPartyRequestCount: thirdPartyItems.length || undefined,
    renderBlockingCount: renderBlockingItems.length || undefined,
    unusedJsKb: savingsKb(result, 'unused-javascript'),
    unusedCssKb: savingsKb(result, 'unused-css-rules'),
    imageOptimizationKb: savingsKb(result, 'uses-optimized-images') ?? savingsKb(result, 'uses-webp-images'),
    modernImageFormatReady: auditPassed(result, 'uses-webp-images'),
  };
}

function metricPercentile(
  source: LoadingExperience | undefined,
  key: string,
): number | undefined {
  const percentile = source?.metrics?.[key]?.percentile;
  return typeof percentile === 'number' ? percentile : undefined;
}

function mapCruxFieldData(result: LighthouseResultLike): CruxFieldData {
  const source = result.loadingExperience?.metrics ? result.loadingExperience : result.originLoadingExperience;

  if (!source?.metrics) {
    return {
      availability: 'unavailable',
      source: 'none',
    };
  }

  const lcp = metricPercentile(source, 'LARGEST_CONTENTFUL_PAINT_MS');
  const inp = metricPercentile(source, 'INTERACTION_TO_NEXT_PAINT');
  const cls = metricPercentile(source, 'CUMULATIVE_LAYOUT_SHIFT_SCORE');

  return {
    availability: 'available',
    source: 'PageSpeed CrUX',
    lcp: typeof lcp === 'number' ? msToSeconds(lcp) : undefined,
    inp: typeof inp === 'number' ? Math.round(inp) : undefined,
    cls: typeof cls === 'number' ? Math.round((cls / 100) * 1000) / 1000 : undefined,
    collectedAt: result.fetchTime,
  };
}

function mapTechnicalSeo(result: LighthouseResultLike): TechnicalSeoChecks {
  return {
    title: auditPassed(result, 'document-title'),
    metaDescription: auditPassed(result, 'meta-description'),
    canonical: auditPassed(result, 'canonical'),
    robotsTxt: auditPassed(result, 'robots-txt'),
    structuredData: auditPassed(result, 'structured-data'),
    mobileViewport: auditPassed(result, 'viewport'),
    crawlableLinks: auditPassed(result, 'crawlable-anchors'),
  };
}

function metric(value: number, key: keyof typeof METRIC_TARGETS): MetricItem {
  const def = METRIC_TARGETS[key];
  return {
    value,
    unit: def.unit,
    target: def.target,
    label: def.label,
  };
}

export function mapLighthouseResultToPageBenchmark(
  input: LighthouseSnapshotInput,
): PageBenchmarkEntry {
  const { target, result } = input;

  return {
    brand: target.brand,
    page: target.page,
    scores: {
      lighthouse: scoreToPoint(result.categories?.performance?.score),
      seo: scoreToPoint(result.categories?.seo?.score),
      target_lighthouse: TARGET_LIGHTHOUSE_SCORE,
    },
    metrics: {
      lcp: metric(msToSeconds(auditValue(result, 'largest-contentful-paint')), 'lcp'),
      cls: metric(Math.round(auditValue(result, 'cumulative-layout-shift') * 1000) / 1000, 'cls'),
      inp: metric(Math.round(auditValue(result, 'interaction-to-next-paint')), 'inp'),
      tbt: metric(Math.round(auditValue(result, 'total-blocking-time')), 'tbt'),
      fcp: metric(msToSeconds(auditValue(result, 'first-contentful-paint')), 'fcp'),
      speedIndex: metric(msToSeconds(auditValue(result, 'speed-index')), 'speedIndex'),
      assetSize: metric(bytesToKb(auditValue(result, 'total-byte-weight')), 'assetSize'),
    },
    resource: mapResourceEfficiency(result),
    technicalSeo: mapTechnicalSeo(result),
    fieldData: mapCruxFieldData(result),
  };
}

export function pageBenchmarkToBrandBenchmark(
  target: AuditTarget,
  pageBenchmark: PageBenchmarkEntry,
): BenchmarkEntry {
  return {
    brand: target.brand,
    isTarget: target.isTarget,
    scores: pageBenchmark.scores,
    metrics: pageBenchmark.metrics,
    resource: pageBenchmark.resource,
    technicalSeo: pageBenchmark.technicalSeo,
    fieldData: pageBenchmark.fieldData,
    domainPopularity: pageBenchmark.domainPopularity,
  };
}

export function buildPageMetricsFromLighthouse(
  snapshots: LighthouseSnapshotInput[],
): PageBenchmarkEntry[] {
  return snapshots.map(mapLighthouseResultToPageBenchmark);
}

export function buildBenchmarksFromPageMetrics(
  snapshots: LighthouseSnapshotInput[],
  pageMetrics: PageBenchmarkEntry[],
): BenchmarkEntry[] {
  const seen = new Set<string>();

  return pageMetrics.flatMap((pageMetric, index) => {
    const target = snapshots[index]?.target;
    if (!target || seen.has(target.brand)) return [];
    seen.add(target.brand);
    return [pageBenchmarkToBrandBenchmark(target, pageMetric)];
  });
}

export function mergeLighthouseSnapshotsIntoDashboardData(
  base: PerformanceApiResponse,
  snapshots: LighthouseSnapshotInput[],
): PerformanceApiResponse {
  const pageMetrics = buildPageMetricsFromLighthouse(snapshots);
  const benchmarks = buildBenchmarksFromPageMetrics(snapshots, pageMetrics);

  return {
    ...base,
    timestamp: snapshots[0]?.result.fetchTime ?? new Date().toISOString(),
    benchmarks: benchmarks.length > 0 ? benchmarks : base.benchmarks,
    pageMetrics: pageMetrics.length > 0 ? pageMetrics : base.pageMetrics,
  };
}
