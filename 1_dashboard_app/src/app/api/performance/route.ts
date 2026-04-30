import { NextResponse } from 'next/server';
import type { PerformanceApiResponse } from '@/shared/lib/types';
import mockData from '@/shared/api/performance-mock.json';

export async function GET(): Promise<NextResponse<PerformanceApiResponse>> {
  return NextResponse.json(mockData as PerformanceApiResponse);
}
