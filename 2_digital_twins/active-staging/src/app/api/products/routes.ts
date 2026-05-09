import { NextResponse } from 'next/server';
import { runningProducts } from '@/page-components/main-landing/ui/mockData';

export async function GET() {
  // PILLAR 1: Artificial Network Waterfall
  // Forces the browser to wait 1.2 seconds for the "database" to respond, destroying LCP
  await new Promise((resolve) => setTimeout(resolve, 1200));

  return NextResponse.json(runningProducts);
}
