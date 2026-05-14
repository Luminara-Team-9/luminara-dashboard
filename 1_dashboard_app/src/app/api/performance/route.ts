import { NextResponse } from 'next/server';
import type { PerformanceApiResponse } from '@/shared/lib/types';
import { getPerformanceData } from '@/shared/api/performanceData';

export async function GET(): Promise<NextResponse<PerformanceApiResponse>> {
  const data = await getPerformanceData();
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
