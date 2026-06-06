import type { PerformanceApiResponse } from '@/shared/lib/types';
import mockData from '@/shared/api/performance-mock.json';
import { fetchExternalTrafficMetrics } from '@/shared/api/externalTrafficAdapter';
import { applyRumJourneyOverlay } from '@/shared/api/rumJourneyOverlay';

const PERFORMANCE_API_URL = process.env.DASHBOARD_PERFORMANCE_API_URL ?? process.env.DASHBOARD_DATA_API_URL;
const PERFORMANCE_CACHE_MS = Number(process.env.DASHBOARD_PERFORMANCE_CACHE_MS ?? 30_000);

let cachedPerformanceData: { key: string; data: PerformanceApiResponse; cachedAt: number } | null = null;
const inFlightPerformanceRequests = new Map<string, Promise<PerformanceApiResponse>>();

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

  const response = await fetch(withSearchParams(PERFORMANCE_API_URL, params), {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) throw new Error('Dashboard data API failed: ' + response.status);

  const payload: unknown = await response.json();
  if (!isPerformanceApiResponse(payload)) throw new Error('Dashboard data API returned an invalid payload');
  return payload;
}

function getBaseParams(params: URLSearchParams): URLSearchParams {
  const baseParams = new URLSearchParams(params);
  baseParams.delete('mode');
  return baseParams;
}

function isLiveOnlyRequest(params: URLSearchParams): boolean {
  return params.get('mode') === 'live';
}

function getCacheKey(params: URLSearchParams): string {
  return getBaseParams(params).toString();
}

function isFreshCache(key: string): boolean {
  return Boolean(
    cachedPerformanceData &&
    cachedPerformanceData.key === key &&
    PERFORMANCE_CACHE_MS > 0 &&
    Date.now() - cachedPerformanceData.cachedAt < PERFORMANCE_CACHE_MS
  );
}

async function buildPerformanceData(baseData: PerformanceApiResponse, params: URLSearchParams): Promise<PerformanceApiResponse> {
  const dataWithRum = await applyRumJourneyOverlay(baseData, params);
  const externalTraffic = await fetchExternalTrafficMetrics();

  if (!externalTraffic?.trafficSessions) return dataWithRum;

  return {
    ...dataWithRum,
    businessMetrics: {
      ...dataWithRum.businessMetrics,
      trafficSessions: {
        ...dataWithRum.businessMetrics?.trafficSessions,
        ...externalTraffic.trafficSessions,
      },
    },
  };
}

export async function getPerformanceData(params = new URLSearchParams()): Promise<PerformanceApiResponse> {
  const cacheKey = getCacheKey(params);
  const baseParams = getBaseParams(params);
  const liveOnly = isLiveOnlyRequest(params);

  if (liveOnly && cachedPerformanceData?.key === cacheKey) {
    try {
      const externalData = await fetchExternalPerformanceData(params);
      const data = externalData ?? (await buildPerformanceData(cachedPerformanceData.data, baseParams));
      cachedPerformanceData = {
        ...cachedPerformanceData,
        data,
      };
      return data;
    } catch {
      const data = await buildPerformanceData(cachedPerformanceData.data, baseParams);
      cachedPerformanceData = {
        ...cachedPerformanceData,
        data,
      };
      return data;
    }
  }

  if (isFreshCache(cacheKey) && cachedPerformanceData) return cachedPerformanceData.data;

  const existingRequest = inFlightPerformanceRequests.get(cacheKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    try {
      const externalData = await fetchExternalPerformanceData(baseParams);
      const data = externalData ?? (await buildPerformanceData(mockData as PerformanceApiResponse, baseParams));
      cachedPerformanceData = { key: cacheKey, data, cachedAt: Date.now() };
      return data;
    } catch (error) {
      if (cachedPerformanceData?.key === cacheKey) return cachedPerformanceData.data;
      if (!PERFORMANCE_API_URL) {
        const data = await buildPerformanceData(mockData as PerformanceApiResponse, baseParams);
        cachedPerformanceData = { key: cacheKey, data, cachedAt: Date.now() };
        return data;
      }
      throw error;
    } finally {
      inFlightPerformanceRequests.delete(cacheKey);
    }
  })();

  inFlightPerformanceRequests.set(cacheKey, request);
  return request;
}
