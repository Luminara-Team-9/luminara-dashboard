'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import {
  ESTIMATION_FORMULAS,
  calcMetricHealthScore,
  calcPriorityScore,
  estimateMetricBusinessEffect,
} from '@/shared/lib/estimationFormulas';
import { formatCompactCount } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui';
import styles from './BusinessImpactMatrix.module.css';

interface MetricDef {
  key: string;
  label: string;
  unit: string;
  targetLabel: string;
  higherIsBetter: boolean;
  area: string;
  businessUse: string;
}

const METRICS: MetricDef[] = [
  {
    key: 'lcp',
    label: '첫 화면 표시 (LCP)',
    unit: 's',
    targetLabel: '2.5s 이하',
    higherIsBetter: false,
    area: '상품 탐색 시작',
    businessUse: '상품 상세 첫 화면이 늦게 표시되어 사용자가 상품을 확인하기 전 이탈할 가능성이 있습니다.',
  },
  {
    key: 'inp',
    label: '클릭 반응 (INP)',
    unit: 'ms',
    targetLabel: '200ms 이하',
    higherIsBetter: false,
    area: '필터·장바구니 조작',
    businessUse: '필터·장바구니·결제 조작 지연으로 구매 진행 과정의 불편이 커질 수 있습니다.',
  },
  {
    key: 'cls',
    label: '화면 안정성 (CLS)',
    unit: '',
    targetLabel: '0.1 이하',
    higherIsBetter: false,
    area: '구매 버튼 신뢰도',
    businessUse: '상품 정보나 구매 버튼 위치가 흔들리면 선택 과정의 신뢰도가 낮아질 수 있습니다.',
  },
  {
    key: 'tbt',
    label: '스크립트 부담 (TBT)',
    unit: 'ms',
    targetLabel: '200ms 이하',
    higherIsBetter: false,
    area: '반응 속도 개선 필요',
    businessUse: '무거운 스크립트로 페이지 반응이 늦어지면 탐색과 구매 진행 과정의 불편이 커질 수 있습니다.',
  },
  {
    key: 'fcp',
    label: '첫 콘텐츠 표시 (FCP)',
    unit: 's',
    targetLabel: '1.8s 이하',
    higherIsBetter: false,
    area: '초기 이탈 위험',
    businessUse: '첫 콘텐츠가 늦게 나타나면 사용자가 탐색을 시작하기 전에 느리다고 판단할 수 있습니다.',
  },
];

function fmt(value: number, unit: string): string {
  if (unit === 's') return `${value}s`;
  if (unit === 'ms') return `${value}ms`;
  return String(value);
}

function getScore(current: number, target: number, higherIsBetter: boolean): number {
  return calcMetricHealthScore(current, target, higherIsBetter);
}

function getStatus(score: number): string {
  if (score >= 80) return '양호';
  if (score >= 60) return '점검';
  return '우선 개선';
}

function scoreTone(score: number): string {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

function getConfidenceLabel(confidence: string | undefined): string {
  if (confidence === 'measured') return '실측';
  if (confidence === 'estimated') return '외부 추정';
  if (confidence === 'proxy') return '대리지표';
  if (confidence === 'mock') return 'Mock';
  return '미연동';
}

function getTrendValue(
  data: NonNullable<ReturnType<typeof usePerformanceData>['data']>,
  metricKey: string,
): { current: number; previous: number } | null {
  const dataset = data.trends.datasets.find((item) => item.brand === 'Decathlon' && item.metricKey === metricKey);
  if (!dataset || dataset.values.length < 2) return null;

  return {
    current: dataset.values[dataset.values.length - 1],
    previous: dataset.values[dataset.values.length - 2],
  };
}

function formatChange(value: number): string {
  if (value === 0) return '변화 없음';
  return `${value > 0 ? '▲' : '▼'} ${Math.abs(value)}점`;
}

function getBenchmarkPosition(
  benchmarks: NonNullable<ReturnType<typeof usePerformanceData>['data']>['benchmarks'],
  metricKey: string,
  targetBrand: string,
  higherIsBetter: boolean,
): string {
  const rows = benchmarks
    .map((benchmark) => {
      const metric = benchmark.metrics[metricKey as keyof typeof benchmark.metrics];
      return metric ? { brand: benchmark.brand, value: metric.value } : null;
    })
    .filter((item): item is { brand: string; value: number } => item != null)
    .sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value);

  const rank = rows.findIndex((item) => item.brand === targetBrand) + 1;
  if (!rank || rows.length === 0) return '비교 데이터 없음';

  const isBetterThanAverage = rank <= Math.ceil(rows.length / 2);

  return `경쟁사 ${rows.length}개 중 ${rank}위 · ${isBetterThanAverage ? '평균보다 양호' : '경쟁사 평균보다 낮음'}`;
}

function getStepSessions(
  userJourney: NonNullable<ReturnType<typeof usePerformanceData>['data']>['rum']['userJourney'],
  metricKey: string,
): number {
  const step = (() => {
    if (metricKey === 'lcp' || metricKey === 'fcp') return userJourney.find((item) => item.pageType === 'main');
    if (metricKey === 'inp' || metricKey === 'cls') return userJourney.find((item) => item.pageType === 'product');
    if (metricKey === 'tbt') return userJourney.find((item) => item.pageType === 'checkout');
    return userJourney[0];
  })();

  return step?.sessions ?? userJourney[0]?.sessions ?? 0;
}

export function BusinessImpactMatrix() {
  const { data, loading, error } = usePerformanceData();
  const [showFormula, setShowFormula] = useState(false);

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.header}>
          <Skeleton width="180px" height="18px" />
        </div>
        <div className={styles.skeleton_rows}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height="48px" radius="8px" />
          ))}
        </div>
      </section>
    );
  }

  const decathlon = data.benchmarks.find((benchmark) => benchmark.isTarget);
  if (!decathlon) return null;

  const firstSessions = data.rum.userJourney[0]?.sessions ?? 0;
  const sessions = data.businessMetrics?.trafficSessions?.sessions ?? firstSessions;
  const sessionConfidence = data.businessMetrics?.trafficSessions?.confidence;
  const sessionPeriod = data.businessMetrics?.trafficSessions?.period ?? (firstSessions > 0 ? 'RUM 여정 기준' : '세션 데이터 없음');
  const sessionSource = data.businessMetrics?.trafficSessions?.source ?? (firstSessions > 0 ? '사용자 여정 단계 데이터' : '내부 세션 데이터 필요');
  const targetBrand = decathlon.brand;
  const hasConversionBaseline = data.businessMetrics?.conversionRate?.value != null;
  const baselineConversionRate = data.businessMetrics?.conversionRate?.value ?? 0;

  const rows = METRICS.map((metric) => {
    const current = (decathlon.metrics as Record<string, { value: number; target: number }>)[metric.key];
    if (!current) return null;

    const score = getScore(current.value, current.target, metric.higherIsBetter);
    const position = getBenchmarkPosition(data.benchmarks, metric.key, targetBrand, metric.higherIsBetter);
    const affectedSessions = getStepSessions(data.rum.userJourney, metric.key);
    const priorityScore = calcPriorityScore({
      current: current.value,
      target: current.target,
      higherIsBetter: metric.higherIsBetter,
      affectedSessions,
      totalSessions: sessions,
    });
    const expectedEffect = hasConversionBaseline
      ? estimateMetricBusinessEffect({
          metricKey: metric.key,
          current: current.value,
          target: current.target,
          baselineConversionRate,
        }).label
      : '전환율 데이터 연결 후 계산';

    return {
      ...metric,
      current: current.value,
      score,
      priorityScore,
      position,
      affectedSessions,
      expectedEffect,
    };
  }).filter(Boolean) as (MetricDef & {
    current: number;
    score: number;
    priorityScore: number;
    position: string;
    affectedSessions: number;
    expectedEffect: string;
  })[];

  const lcp = decathlon.metrics.lcp;
  const inp = decathlon.metrics.inp;
  const cls = decathlon.metrics.cls;
  const speedScore = getScore(lcp.value, lcp.target, false);
  const responseScore = getScore(inp.value, inp.target, false);
  const stabilityScore = getScore(cls.value, cls.target, false);
  const seoScore = decathlon.scores.seo;
  const failCount = rows.filter((row) => row.score < 90).length;
  const topPriority = [...rows].sort((a, b) => b.priorityScore - a.priorityScore)[0];

  const scoreCards = [
    {
      label: '체감 속도',
      value: speedScore,
      metric: `LCP ${lcp.value}s`,
      area: '웹사이트 속도 · 이탈 위험',
      change: (() => {
        const trend = getTrendValue(data, 'lcp');
        if (!trend) return null;
        return getScore(trend.current, lcp.target, false) - getScore(trend.previous, lcp.target, false);
      })(),
    },
    {
      label: '반응성',
      value: responseScore,
      metric: `INP ${inp.value}ms`,
      area: '전환 여정 · 장바구니/결제 조작감',
      change: (() => {
        const trend = getTrendValue(data, 'inp');
        if (!trend) return null;
        return getScore(trend.current, inp.target, false) - getScore(trend.previous, inp.target, false);
      })(),
    },
    {
      label: '안정성',
      value: stabilityScore,
      metric: `CLS ${cls.value}`,
      area: '구매 여정 · 버튼/상품 카드 신뢰도',
      change: null,
    },
    {
      label: 'Lighthouse SEO',
      value: seoScore,
      metric: `SEO ${seoScore}/100`,
      area: '검색 순위가 아닌 Lighthouse SEO 점수',
      change: null,
    },
  ];

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>현재 성능 진단</h2>
          <span className={styles.subtitle}>
            점수는 기술 지표를 쇼핑몰 운영 관점으로 읽기 쉽게 바꾼 상태값입니다.
          </span>
        </div>
        <div className={styles.header_badge}>
          <span>{getConfidenceLabel(sessionConfidence)} · {sessionPeriod}</span>
          <strong>{formatCompactCount(sessions)}</strong>
          <em>{sessionSource}</em>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.legend} aria-label="점수 기준">
          <span><i className={styles.legend_good} />80점 이상 양호</span>
          <span><i className={styles.legend_warn} />60~79점 점검</span>
          <span><i className={styles.legend_bad} />60점 미만 우선 개선</span>
        </div>
      </div>

      <div className={styles.score_grid}>
        {scoreCards.map((card) => (
          <article key={card.label} className={styles.score_card}>
            <div className={styles.score_top}>
              <span className={styles.context_label}>{card.label}</span>
              <span className={`${styles.score_status} ${styles[scoreTone(card.value)]}`}>{getStatus(card.value)}</span>
            </div>
            <strong className={styles.score_value}>{card.value}</strong>
            <span className={styles.score_metric}>{card.metric}</span>
            <span className={`${styles.score_change} ${card.change == null || card.change >= 0 ? styles.change_up : styles.change_down}`}>
              {card.change == null ? '변화 데이터 없음' : formatChange(card.change)}
            </span>
            <p className={styles.score_area}>{card.area}</p>
          </article>
        ))}
      </div>

      <div className={styles.summary}>
        <div className={styles.summary_item}>
          <span className={styles.summary_label}>전체 성능 점수</span>
          <span className={styles.summary_cvr}>{decathlon.scores.lighthouse}</span>
        </div>
        <div className={styles.summary_divider} />
        <div className={styles.summary_item}>
          <span className={styles.summary_label}>점검 필요 항목</span>
          <span className={styles.summary_fail}>{failCount}</span>
        </div>
        <div className={styles.summary_divider} />
        <div className={styles.summary_item}>
          <span className={styles.summary_label}>가장 먼저 볼 영역</span>
          <span className={styles.summary_revenue}>{topPriority?.area ?? '-'}</span>
        </div>
      </div>

      {showFormula && (
        <p className={styles.formula_note}>
          진단 점수: {ESTIMATION_FORMULAS.metricHealthScore.formula} · 우선순위:
          {' '}{ESTIMATION_FORMULAS.businessPriorityScore.formula} · 전환 참고치:
          {' '}{ESTIMATION_FORMULAS.cvrLiftReference.formula}
        </p>
      )}

      <div className={styles.table_wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>성능 항목</th>
              <th className={styles.th}>현재</th>
              <th className={styles.th}>목표</th>
              <th className={styles.th_cvr}>진단 점수</th>
              <th className={styles.th}>비즈니스 연결</th>
              <th className={styles.th_revenue}>우선순위 근거</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`${styles.row} ${row.score >= 90 ? styles.row_pass : ''}`}>
                <td className={styles.td_label}>
                  <span className={styles.metric_name}>{row.label}</span>
                  <span className={`${styles.status_dot} ${row.score >= 90 ? styles.dot_pass : styles.dot_fail}`} />
                </td>
                <td className={styles.td}>
                  <span className={row.score >= 90 ? styles.val_pass : styles.val_fail}>
                    {fmt(row.current, row.unit)}
                  </span>
                </td>
                <td className={styles.td}>
                  <span className={styles.val_target}>{row.targetLabel}</span>
                  <span className={styles.position_note}>{row.position}</span>
                </td>
                <td className={styles.td_cvr}>
                  <span className={`${styles.score_pill} ${styles[scoreTone(row.score)]}`}>{row.score}</span>
                </td>
                <td className={styles.td}>
                  <span className={styles.business_use}>
                    <strong>{row.area}</strong>
                    {row.businessUse}
                  </span>
                </td>
                <td className={styles.td_revenue}>
                  <span className={styles.coeff}>
                    {row.score < 80 ? `개선 여지 ${100 - row.score}점` : '목표권'}
                  </span>
                  <span className={styles.priority_note}>영향 범위 {formatCompactCount(row.affectedSessions)} 세션</span>
                  <span className={styles.effect_note}>{row.expectedEffect}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={styles.footnote}>
        <button type="button" className={styles.text_button} onClick={() => setShowFormula((visible) => !visible)}>
          계산식 {showFormula ? '접기' : '보기'}
        </button>
        ※ 전환 영향은 공개 연구 기반 참고 시나리오이며 실제 효과는 내부 로그 또는 A/B 테스트로 검증해야 합니다.
      </p>
    </section>
  );
}
