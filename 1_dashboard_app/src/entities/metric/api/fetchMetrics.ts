import type { PerformanceReport } from '../model/types';

/**
 * Phase 4 전환 지점: 이 함수 내부만 교체하면 UI 코드는 전혀 수정이 필요 없습니다.
 * - 현재: Next.js BFF Route(/api/performance) → Mock JSON 반환
 * - Phase 4: 실제 DB 또는 Python Lighthouse 적재 데이터로 교체
 */
export async function fetchPerformanceReport(): Promise<PerformanceReport> {
  const res = await fetch('/api/performance', { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`Performance API 호출 실패: ${res.status}`);
  }

  return res.json() as Promise<PerformanceReport>;
}
