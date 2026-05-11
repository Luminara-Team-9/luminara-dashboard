import {
  WPO_COEFFICIENTS,
  estimateCvrLiftFromVitals,
  round,
} from './estimationFormulas';

export { WPO_COEFFICIENTS };

export interface CvrInputs {
  lcpCurrent: number;
  lcpTarget: number;
  inpCurrent: number;
  inpTarget: number;
  clsCurrent: number;
  clsTarget: number;
}

export function calcCvrLift(inputs: CvrInputs): number {
  return estimateCvrLiftFromVitals(inputs);
}

export function calcRevenueImpact(cvrLiftPct: number, annualRevenue: number): number {
  return Math.round(annualRevenue * (cvrLiftPct / 100));
}

export function calcCvrBreakdown(inputs: CvrInputs) {
  const lcpGap = Math.max(0, inputs.lcpCurrent - inputs.lcpTarget);
  const inpGap = Math.max(0, inputs.inpCurrent - inputs.inpTarget);
  const clsGap = Math.max(0, inputs.clsCurrent - inputs.clsTarget);

  return {
    lcp: round(lcpGap * WPO_COEFFICIENTS.LCP_PER_SECOND, 1),
    inp: round((inpGap / 100) * WPO_COEFFICIENTS.INP_PER_100MS, 1),
    cls: round((clsGap / 0.1) * WPO_COEFFICIENTS.CLS_PER_TENTH, 1),
    total: calcCvrLift(inputs),
  };
}
