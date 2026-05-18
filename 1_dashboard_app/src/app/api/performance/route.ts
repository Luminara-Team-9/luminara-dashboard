import { NextResponse } from 'next/server';
import type { PerformanceApiResponse } from '@/shared/lib/types';
import { getPerformanceData } from '@/shared/api/performanceData';

export async function GET(request: Request): Promise<NextResponse<PerformanceApiResponse>> {
  const url = new URL(request.url);
  const data = await getPerformanceData(url.searchParams);
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
