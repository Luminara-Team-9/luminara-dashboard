/**
 * WPO Stats 기반 CVR 추정 유틸리티
 *
 * 근거 출처 (https://wpostats.com):
 *   - Deloitte/Google 2020 UK Retail: 모바일 0.1s 개선 → CVR +8.4%
 *   - Portent 2019: 로드 1s → 5s 사이트 대비 CVR ~3배 차이 (1s당 ~3%)
 *   - Zalando 2018: 100ms 개선 → +0.7% 주문 수
 *   - Google INP 연구 2022-2024: INP 200ms 초과 구간은 이탈률 상승 correl.
 *
 * 채택 계수 (보수적 중간값):
 *   LCP  : 1s 단축 → CVR +2.0%  (Portent ~3%, Zalando ~0.7%, 중간값)
 *   INP  : 200ms 초과분 100ms당 → CVR +0.5%  (Google INP 연구 보수 적용)
 *   CLS  : 0.1 초과분 0.1당   → CVR +1.5%  (Google CLS 레이아웃 안정성 연구)
 *
 * 주의: 이 수치는 업계 평균 추정값이며 실제 결과는 사이트·업종·트래픽 구성에 따라 다름.
 */

export const WPO_COEFFICIENTS = {
  LCP_PER_SECOND:  2.0,  // % CVR per 1s LCP above target (2.5s)
  INP_PER_100MS:   0.5,  // % CVR per 100ms INP above threshold (200ms)
  CLS_PER_TENTH:   1.5,  // % CVR per 0.1 CLS above threshold (0.1)
} as const;

export interface CvrInputs {
  lcpCurrent:  number;  // seconds
  lcpTarget:   number;  // seconds — goal: 2.5
  inpCurrent:  number;  // ms
  inpTarget:   number;  // ms     — goal: 200
  clsCurrent:  number;
  clsTarget:   number;  // score  — goal: 0.1
}

/**
 * 목표치 달성 시 예상 CVR 상승률(%)을 반환한다.
 * 각 지표가 이미 목표를 충족하면 해당 기여분은 0.
 */
export function calcCvrLift(inputs: CvrInputs): number {
  const lcpGap = Math.max(0, inputs.lcpCurrent - inputs.lcpTarget);
  const inpGap = Math.max(0, inputs.inpCurrent - inputs.inpTarget);
  const clsGap = Math.max(0, inputs.clsCurrent - inputs.clsTarget);

  const lift =
    lcpGap * WPO_COEFFICIENTS.LCP_PER_SECOND +
    (inpGap / 100) * WPO_COEFFICIENTS.INP_PER_100MS +
    (clsGap / 0.1) * WPO_COEFFICIENTS.CLS_PER_TENTH;

  return Math.round(lift * 10) / 10;
}

/**
 * CVR 상승률과 연 매출 기준으로 예상 추가 매출(원)을 반환한다.
 */
export function calcRevenueImpact(cvrLiftPct: number, annualRevenue: number): number {
  return Math.round(annualRevenue * (cvrLiftPct / 100));
}

/** CVR 기여 항목별 분해 (시뮬레이터 표시용) */
export function calcCvrBreakdown(inputs: CvrInputs) {
  const lcpGap = Math.max(0, inputs.lcpCurrent - inputs.lcpTarget);
  const inpGap = Math.max(0, inputs.inpCurrent - inputs.inpTarget);
  const clsGap = Math.max(0, inputs.clsCurrent - inputs.clsTarget);

  return {
    lcp:   Math.round(lcpGap * WPO_COEFFICIENTS.LCP_PER_SECOND * 10) / 10,
    inp:   Math.round((inpGap / 100) * WPO_COEFFICIENTS.INP_PER_100MS * 10) / 10,
    cls:   Math.round((clsGap / 0.1) * WPO_COEFFICIENTS.CLS_PER_TENTH * 10) / 10,
    total: calcCvrLift(inputs),
  };
}
