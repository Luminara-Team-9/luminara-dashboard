import type { BusinessMetrics } from '@/shared/lib/types';

const EXTERNAL_TRAFFIC_API_URL = process.env.DASHBOARD_EXTERNAL_TRAFFIC_API_URL;

interface ExternalTrafficApiResponse {
  trafficSessions?: BusinessMetrics['trafficSessions'];
}

function isExternalTrafficApiResponse(value: unknown): value is ExternalTrafficApiResponse {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as ExternalTrafficApiResponse;
  return typeof candidate.trafficSessions?.sessions === 'number';
}

export async function fetchExternalTrafficMetrics(): Promise<ExternalTrafficApiResponse | null> {
  if (!EXTERNAL_TRAFFIC_API_URL) return null;

  try {
    const response = await fetch(EXTERNAL_TRAFFIC_API_URL, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });

    if (!response.ok) return null;

    const payload: unknown = await response.json();
    return isExternalTrafficApiResponse(payload) ? payload : null;
  } catch {
    return null;
  }
}
