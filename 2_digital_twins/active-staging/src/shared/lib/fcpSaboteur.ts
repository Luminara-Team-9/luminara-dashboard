import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function applyFcpSabotage(request: NextRequest) {
  // Only delay the homepage!
  if (request.nextUrl.pathname === '/') {
    // Delays FCP perfectly without touching the browser's main thread (TBT)
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return NextResponse.next();
}
