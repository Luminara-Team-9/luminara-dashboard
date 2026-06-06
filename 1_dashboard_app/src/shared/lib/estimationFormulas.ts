import type { RegionalData } from './types';

export type FormulaConfidence = 'measured' | 'reference_estimate' | 'internal_model';

export interface FormulaReference {
  id: string;
  title: string;
  url: string;
  note: string;
}

export interface FormulaMeta {
  id: string;
  title: string;
  formula: string;
  confidence: FormulaConfidence;
  references: string[];
  caution?: string;
}

export const FORMULA_REFERENCES: Record<string, FormulaReference> = {
  webVitals: {
    id: 'webVitals',
    title: 'Google web.dev Core Web Vitals thresholds',
    url: 'https://web.dev/articles/vitals',
    note: 'LCP 2.5s, TBT 200ms, CLS 0.1 targets are evaluated at the 75th percentile. INP is replaced by TBT when unavailable.',
  },
  cwvThresholdMethod: {
    id: 'cwvThresholdMethod',
    title: 'How the Core Web Vitals metrics thresholds were defined',
    url: 'https://web.dev/defining-core-web-vitals-thresholds/',
    note: 'Explains good / needs improvement / poor thresholds and percentile basis.',
  },
  deloitteSpeedImpact: {
    id: 'deloitteSpeedImpact',
    title: 'Deloitte / Google: Milliseconds Make Millions',
    url: 'https://www.deloitte.com/ie/en/services/consulting/research/milliseconds-make-millions.html',
    note: 'Observed retail conversion and AOV uplift from 0.1s mobile speed improvement.',
  },
  webDevBusinessImpact: {
    id: 'webDevBusinessImpact',
    title: 'web.dev: The business impact of Core Web Vitals',
    url: 'https://web.dev/case-studies/vitals-business-impact',
    note: 'Case studies linking Core Web Vitals improvements with business metrics.',
  },
  sustainableWebDesignV3: {
    id: 'sustainableWebDesignV3',
    title: 'Sustainable Web Design Model v3 emissions formula',
    url: 'https://sustainablewebdesign.org/estimating-digital-emissions-version-3',
    note: 'Uses page transfer as proxy with 0.81 kWh/GB and 442 gCO2e/kWh global grid factor.',
  },
  co2js: {
    id: 'co2js',
    title: 'Green Web Foundation CO2.js methodology',
    url: 'https://developers.thegreenwebfoundation.org/co2js/explainer/methodologies-for-calculating-website-carbon/',
    note: 'Open-source CO2.js supports Sustainable Web Design and OneByte carbon models.',
  },
};

export const ESTIMATION_FORMULAS: Record<string, FormulaMeta> = {
  metricHealthScore: {
    id: 'metricHealthScore',
    title: '진단 점수',
    formula: 'score = target met ? 100 : clamp(0, 100 * normalizedRatio^0.85, 100)',
    confidence: 'internal_model',
    references: ['webVitals', 'cwvThresholdMethod'],
    caution: 'Lighthouse 원점수가 아니라 목표 대비 초과 폭을 0~100으로 정규화한 대시보드 판단 점수입니다.',
  },
  businessPriorityScore: {
    id: 'businessPriorityScore',
    title: '우선순위 점수',
    formula: 'priority = metricGapRatio * affectedSessionShare * 100',
    confidence: 'internal_model',
    references: ['webVitals', 'webDevBusinessImpact'],
    caution: '세션 비중은 내부 로그나 사용자 여정 경로 데이터가 연결되어야 실제 우선순위로 쓸 수 있습니다.',
  },
  cvrLiftReference: {
    id: 'cvrLiftReference',
    title: '구매 전환율 참고 상승폭',
    formula:
      'cvrPointLift = baseCVR * min((improvementMs / 100) * 8.4% * conservativeFactor, capRelativeLift)',
    confidence: 'reference_estimate',
    references: ['deloitteSpeedImpact', 'webDevBusinessImpact'],
    caution:
      'Deloitte 연구값을 그대로 예측값으로 쓰지 않고 보수계수와 상한을 둔 참고 시나리오입니다. 실제 효과는 A/B 테스트나 내부 로그로 검증해야 합니다.',
  },
  sessionConversionRate: {
    id: 'sessionConversionRate',
    title: '구매 전환율',
    formula: 'conversionRate = purchases / sessions * 100',
    confidence: 'measured',
    references: [],
  },
  revenue: {
    id: 'revenue',
    title: '매출',
    formula: 'revenue = purchases * averageOrderValue',
    confidence: 'measured',
    references: [],
  },
  dropoffRate: {
    id: 'dropoffRate',
    title: '단계 이탈률',
    formula: 'dropoffRate = (currentStepSessions - nextStepSessions) / currentStepSessions * 100',
    confidence: 'measured',
    references: [],
  },
  rankPosition: {
    id: 'rankPosition',
    title: '경쟁사 대비 순위',
    formula: 'rank = sorted(values, direction).indexOf(target) + 1',
    confidence: 'measured',
    references: [],
    caution: '비교 대상 URL과 페이지 유형이 같을 때만 의미가 있습니다.',
  },
  carbonPerVisit: {
    id: 'carbonPerVisit',
    title: '페이지뷰당 탄소 배출량',
    formula:
      'energyKWh = (newVisitGB * 0.81 * 0.75) + (returnVisitGB * 0.81 * 0.25 * 0.02); co2g = energyKWh * 442',
    confidence: 'reference_estimate',
    references: ['sustainableWebDesignV3', 'co2js'],
    caution: '페이지 전송량을 대리지표로 쓰는 추정식입니다. 실제 배출량은 호스팅, CDN, 사용자 지역에 따라 달라집니다.',
  },
  weightedLatency: {
    id: 'weightedLatency',
    title: '세션 가중 평균 지연시간',
    formula: 'weightedLatency = sum(latency * sessions) / sum(sessions)',
    confidence: 'measured',
    references: [],
  },
};

export const CORE_WEB_VITAL_TARGETS = {
  lcp: 2.5,
  inp: 200,
  cls: 0.1,
} as const;

export const SUSTAINABLE_WEB_DESIGN_V3 = {
  kwhPerGb: 0.81,
  globalGridIntensity: 442,
  newVisitShare: 0.75,
  returnVisitShare: 0.25,
  returnVisitDataRatio: 0.02,
} as const;

export const SPEED_TO_CVR_REFERENCE = {
  retailRelativeLiftPer100ms: 8.4,
  conservativeFactor: 0.1,
  capRelativeLift: 25,
} as const;

export const WPO_COEFFICIENTS = {
  LCP_PER_SECOND: 2.0,
  INP_PER_100MS: 0.5,
  CLS_PER_TENTH: 1.5,
} as const;

export function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

export function clamp(min: number, value: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calcMetricGapRatio(current: number, target: number, higherIsBetter: boolean): number {
  if (target <= 0) return 0;
  const gap = higherIsBetter
    ? Math.max(0, target - current)
    : Math.max(0, current - target);
  return gap / target;
}

export function calcMetricHealthScore(current: number, target: number, higherIsBetter: boolean): number {
  if (target <= 0 || !Number.isFinite(current)) return 0;
  if (higherIsBetter ? current >= target : current <= target) return 100;

  const normalizedRatio = higherIsBetter
    ? safeDivide(Math.max(0, current), target)
    : safeDivide(target, Math.max(current, 0.0001));

  return Math.round(clamp(0, 100 * normalizedRatio ** 0.85, 100));
}

export function calcPriorityScore(params: {
  current: number;
  target: number;
  higherIsBetter: boolean;
  affectedSessions: number;
  totalSessions: number;
}): number {
  const gapRatio = calcMetricGapRatio(params.current, params.target, params.higherIsBetter);
  const affectedShare = safeDivide(params.affectedSessions, params.totalSessions);
  return Math.round(gapRatio * affectedShare * 100);
}

export function calcConversionRatePercent(purchases: number, sessions: number): number {
  return round(safeDivide(purchases, sessions) * 100, 1);
}

export function calcRevenue(purchases: number, averageOrderValue: number): number {
  return Math.round(purchases * averageOrderValue);
}

export function calcAverageOrderValue(revenue: number, purchases: number): number {
  return Math.round(safeDivide(revenue, purchases));
}

export function calcDropoff(currentStepSessions: number, nextStepSessions: number) {
  const dropped = Math.max(0, currentStepSessions - nextStepSessions);
  return {
    dropped,
    dropRate: round(safeDivide(dropped, currentStepSessions) * 100, 1),
  };
}

export function calcRank<T>(
  rows: T[],
  getValue: (row: T) => number | null | undefined,
  isTarget: (row: T) => boolean,
  higherIsBetter: boolean,
) {
  const ranked = rows
    .map((row) => ({ row, value: getValue(row) }))
    .filter((item): item is { row: T; value: number } => item.value != null && Number.isFinite(item.value))
    .sort((a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value));

  const rank = ranked.findIndex((item) => isTarget(item.row)) + 1;
  const average = ranked.length
    ? ranked.reduce((sum, item) => sum + item.value, 0) / ranked.length
    : 0;

  return {
    rank: rank || null,
    total: ranked.length,
    average: round(average, 1),
  };
}

export function estimateCvrPointLiftFromSpeed(params: {
  improvementMs: number;
  baselineConversionRate: number;
  conservativeFactor?: number;
  capRelativeLift?: number;
}) {
  const conservativeFactor = params.conservativeFactor ?? SPEED_TO_CVR_REFERENCE.conservativeFactor;
  const capRelativeLift = params.capRelativeLift ?? SPEED_TO_CVR_REFERENCE.capRelativeLift;
  const referenceRelativeLift =
    (Math.max(0, params.improvementMs) / 100) * SPEED_TO_CVR_REFERENCE.retailRelativeLiftPer100ms;
  const appliedRelativeLift = Math.min(referenceRelativeLift * conservativeFactor, capRelativeLift);
  const percentagePointLift = params.baselineConversionRate * (appliedRelativeLift / 100);

  return {
    referenceRelativeLift: round(referenceRelativeLift, 1),
    appliedRelativeLift: round(appliedRelativeLift, 1),
    percentagePointLift: round(percentagePointLift, 2),
  };
}

export function estimateCvrLiftFromVitals(inputs: {
  lcpCurrent: number;
  lcpTarget: number;
  inpCurrent: number;
  inpTarget: number;
  clsCurrent: number;
  clsTarget: number;
}): number {
  const lcpGap = Math.max(0, inputs.lcpCurrent - inputs.lcpTarget);
  const inpGap = Math.max(0, inputs.inpCurrent - inputs.inpTarget);
  const clsGap = Math.max(0, inputs.clsCurrent - inputs.clsTarget);

  return round(
    lcpGap * WPO_COEFFICIENTS.LCP_PER_SECOND +
      (inpGap / 100) * WPO_COEFFICIENTS.INP_PER_100MS +
      (clsGap / 0.1) * WPO_COEFFICIENTS.CLS_PER_TENTH,
    1,
  );
}

export function estimateCvrLiftForMetric(metricKey: string, current: number, target: number): number {
  const gap = Math.max(0, current - target);
  if (metricKey === 'lcp' || metricKey === 'fcp' || metricKey === 'speedIndex') {
    return round(gap * WPO_COEFFICIENTS.LCP_PER_SECOND, 1);
  }
  if (metricKey === 'inp' || metricKey === 'tbt') {
    return round((gap / 100) * WPO_COEFFICIENTS.INP_PER_100MS, 1);
  }
  if (metricKey === 'cls') {
    return round((gap / 0.1) * WPO_COEFFICIENTS.CLS_PER_TENTH, 1);
  }
  return 0;
}

export function estimateMetricBusinessEffect(params: {
  metricKey: string;
  current: number;
  target: number;
  baselineConversionRate: number;
}) {
  const gap = Math.max(0, params.current - params.target);
  if (gap <= 0) {
    return {
      label: '추가 영향 낮음',
      formulaId: 'cvrLiftReference',
      value: 0,
      unit: '%p',
    };
  }

  if (params.metricKey === 'lcp' || params.metricKey === 'fcp' || params.metricKey === 'speedIndex') {
    const result = estimateCvrPointLiftFromSpeed({
      improvementMs: gap * 1000,
      baselineConversionRate: params.baselineConversionRate,
    });
    return {
      label: `구매 전환율 +${result.percentagePointLift}%p 참고`,
      formulaId: 'cvrLiftReference',
      value: result.percentagePointLift,
      unit: '%p',
    };
  }

  if (params.metricKey === 'inp' || params.metricKey === 'tbt') {
    const result = estimateCvrPointLiftFromSpeed({
      improvementMs: gap,
      baselineConversionRate: params.baselineConversionRate,
    });
    return {
      label: `구매 진행 불편 ${result.percentagePointLift}%p 완화 참고`,
      formulaId: 'cvrLiftReference',
      value: result.percentagePointLift,
      unit: '%p',
    };
  }

  if (params.metricKey === 'cls') {
    const riskPoint = Math.round(clamp(0, gap / 0.1, 10));
    return {
      label: `화면 흔들림 위험 ${riskPoint}점 완화 참고`,
      formulaId: 'metricHealthScore',
      value: riskPoint,
      unit: 'risk-point',
    };
  }

  return {
    label: `개선 여지 ${Math.round(calcMetricGapRatio(params.current, params.target, false) * 100)}점`,
    formulaId: 'metricHealthScore',
    value: Math.round(calcMetricGapRatio(params.current, params.target, false) * 100),
    unit: 'point',
  };
}

export function estimateCarbonPerPageView(transferKb: number): number {
  const transferGb = Math.max(0, transferKb) / 1024 / 1024;
  const newVisitEnergy =
    transferGb * SUSTAINABLE_WEB_DESIGN_V3.kwhPerGb * SUSTAINABLE_WEB_DESIGN_V3.newVisitShare;
  const returnVisitEnergy =
    transferGb *
    SUSTAINABLE_WEB_DESIGN_V3.kwhPerGb *
    SUSTAINABLE_WEB_DESIGN_V3.returnVisitShare *
    SUSTAINABLE_WEB_DESIGN_V3.returnVisitDataRatio;

  return round((newVisitEnergy + returnVisitEnergy) * SUSTAINABLE_WEB_DESIGN_V3.globalGridIntensity, 3);
}

export function estimateCarbonSaving(currentTransferKb: number, targetTransferKb: number) {
  const current = estimateCarbonPerPageView(currentTransferKb);
  const target = estimateCarbonPerPageView(targetTransferKb);
  return {
    gramsPerPageView: current,
    targetGramsPerPageView: target,
    savedGrams: round(Math.max(0, current - target), 3),
  };
}

export function calcWeightedLatency(rows: RegionalData[]): number {
  const totalSessions = rows.reduce((sum, row) => sum + (row.sessions ?? 0), 0);
  if (totalSessions === 0) {
    const avg = rows.reduce((sum, row) => sum + row.avgLatency, 0) / Math.max(1, rows.length);
    return Math.round(avg);
  }

  return Math.round(
    rows.reduce((sum, row) => sum + row.avgLatency * (row.sessions ?? 0), 0) / totalSessions,
  );
}
