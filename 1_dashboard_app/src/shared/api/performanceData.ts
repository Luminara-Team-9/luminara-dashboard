import type { PerformanceApiResponse } from '@/shared/lib/types';
import mockData from '@/shared/api/performance-mock.json';
import { fetchExternalTrafficMetrics } from '@/shared/api/externalTrafficAdapter';

const PERFORMANCE_API_URL = process.env.DASHBOARD_PERFORMANCE_API_URL;

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

async function fetchExternalPerformanceData(): Promise<PerformanceApiResponse | null> {
  if (!PERFORMANCE_API_URL) return null;

  try {
    const response = await fetch(PERFORMANCE_API_URL, {
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

export async function getPerformanceData(): Promise<PerformanceApiResponse> {
  const externalData = await fetchExternalPerformanceData();
  const baseData = externalData ?? (mockData as PerformanceApiResponse);
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
