import type { MetricStatus } from '../model/types';

/**
 * 지표 값과 목표 임계값을 비교해 상태를 반환합니다.
 *
 * - 기본(낮을수록 좋음): value <= target → pass, ±10% 이내 → warning
 * - higherIsBetter(높을수록 좋음, Lighthouse 점수 등): value >= target → pass
 */
export function getMetricStatus(
  value: number,
  target: number,
  higherIsBetter = false,
): MetricStatus {
  if (higherIsBetter) {
    if (value >= target) return 'pass';
    if (value >= target * 0.9) return 'warning';
    return 'fail';
  }

  if (value <= target) return 'pass';
  if (value <= target * 1.1) return 'warning';
  return 'fail';
}
