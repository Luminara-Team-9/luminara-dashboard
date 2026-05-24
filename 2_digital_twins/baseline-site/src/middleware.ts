import { applyFcpSabotage } from '@/shared/lib/fcpSaboteur';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Delegate the logic to the FSD shared layer
  return applyFcpSabotage(request);
}

// Next.js optimization: Only run this middleware on the homepage
export const config = {
  matcher: '/',
};
