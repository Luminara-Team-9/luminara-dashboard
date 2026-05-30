import type { PerformanceApiResponse } from '@/shared/lib/types';
import mockData from '@/shared/api/performance-mock.json';
import { fetchExternalTrafficMetrics } from '@/shared/api/externalTrafficAdapter';
import { applyRumJourneyOverlay } from '@/shared/api/rumJourneyOverlay';

const PERFORMANCE_API_URL = process.env.DASHBOARD_PERFORMANCE_API_URL ?? process.env.DASHBOARD_DATA_API_URL;

function withSearchParams(targetUrl: string, params: URLSearchParams): string {
  const url = new URL(targetUrl, 'http://localhost');
  params.forEach((value, key) => {
    if (value) url.searchParams.set(key, value);
  });
  return targetUrl.startsWith('/') ? url.pathname + url.search : url.toString();
}

function isPerformanceApiResponse(value: unknown): value is PerformanceApiResponse {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<PerformanceApiResponse>;
  return (
    typeof candidate.timestamp === 'string' &&
    Array.isArray(candidate.benchmarks) &&
    Array.isArray(candidate.pageMetrics) &&
    Boolean(candidate.executiveSummary) &&
    Boolean(candidate.trends) &&
    Boolean(candidate.rum) &&
    Array.isArray(candidate.aiFixPlans)
  );
}

async function fetchExternalPerformanceData(params: URLSearchParams): Promise<PerformanceApiResponse | null> {
  if (!PERFORMANCE_API_URL) return null;

  try {
    const response = await fetch(withSearchParams(PERFORMANCE_API_URL, params), {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return null;

    const payload: unknown = await response.json();
    return isPerformanceApiResponse(payload) ? payload : null;
  } catch {
    return null;
  }
}

export async function getPerformanceData(params = new URLSearchParams()): Promise<PerformanceApiResponse> {
  const externalData = await fetchExternalPerformanceData(params);
  const baseData = await applyRumJourneyOverlay(externalData ?? (mockData as PerformanceApiResponse), params);
  const externalTraffic = await fetchExternalTrafficMetrics();

  if (!externalTraffic?.trafficSessions) return baseData;

  return {
    ...baseData,
    businessMetrics: {
      ...baseData.businessMetrics,
      trafficSessions: {
        ...baseData.businessMetrics?.trafficSessions,
        ...externalTraffic.trafficSessions,
      },
    },
  };
}
