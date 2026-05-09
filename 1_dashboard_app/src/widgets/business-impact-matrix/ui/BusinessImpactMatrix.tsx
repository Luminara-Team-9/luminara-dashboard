'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcRevenueImpact, WPO_COEFFICIENTS } from '@/shared/lib/cvr';
import { Skeleton } from '@/shared/ui';
import styles from './BusinessImpactMatrix.module.css';

// ── 지표 정의 ─────────────────────────────────────────────────
interface MetricDef {
  key:            string;
  label:          string;
  unit:           string;
  targetLabel:    string;
  higherIsBetter: boolean;
  cvrFn?:         (gap: number) => number;
  cvrBasis:       string;
}

const METRICS: MetricDef[] = [
  {
    key: 'lcp', label: 'LCP', unit: 's', targetLabel: '≤ 2.5s',
    higherIsBetter: false,
    cvrFn: (gap) => Math.round(gap * WPO_COEFFICIENTS.LCP_PER_SECOND * 10) / 10,
    cvrBasis: `${WPO_COEFFICIENTS.LCP_PER_SECOND}%/s`,
  },
  {
    key: 'inp', label: 'INP', unit: 'ms', targetLabel: '≤ 200ms',
    higherIsBetter: false,
    cvrFn: (gap) => Math.round((gap / 100) * WPO_COEFFICIENTS.INP_PER_100MS * 10) / 10,
    cvrBasis: `${WPO_COEFFICIENTS.INP_PER_100MS}%/100ms`,
  },
  {
    key: 'cls', label: 'CLS', unit: '', targetLabel: '≤ 0.1',
    higherIsBetter: false,
    cvrFn: (gap) => Math.round((gap / 0.1) * WPO_COEFFICIENTS.CLS_PER_TENTH * 10) / 10,
    cvrBasis: `${WPO_COEFFICIENTS.CLS_PER_TENTH}%/0.1`,
  },
  {
    key: 'tbt', label: 'TBT', unit: 'ms', targetLabel: '≤ 200ms',
    higherIsBetter: false,
    cvrFn: undefined,
    cvrBasis: '—',
  },
  {
    key: 'fcp', label: 'FCP', unit: 's', targetLabel: '≤ 1.8s',
    higherIsBetter: false,
    cvrFn: undefined,
    cvrBasis: '—',
  },
];

function fmt(value: number, unit: string): string {
  if (unit === 's')  return `${value}s`;
  if (unit === 'ms') return `${value}ms`;
  return String(value);
}

export function BusinessImpactMatrix() {
  const { data, loading, error } = usePerformanceData();
  const [revenue, setRevenue] = useState(3000);

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

  const decathlon    = data.benchmarks.find((b) => b.isTarget);
  const annualRevenue = revenue * 100_000_000;

  if (!decathlon) return null;

  const rows = METRICS.map((m) => {
    const current = (decathlon.metrics as Record<string, { value: number; target: number }>)[m.key];
    if (!current) return null;

    const gap     = m.higherIsBetter
      ? Math.max(0, current.target - current.value)
      : Math.max(0, current.value - current.target);
    const passes  = m.higherIsBetter
      ? current.value >= current.target
      : current.value <= current.target;
    const cvrPct  = (!passes && m.cvrFn) ? m.cvrFn(gap) : 0;
    const revenue = cvrPct > 0 ? calcRevenueImpact(cvrPct, annualRevenue) : 0;

    return { ...m, current: current.value, target: current.target, gap, passes, cvrPct, revenue };
  }).filter(Boolean) as (MetricDef & {
    current: number; target: number; gap: number;
    passes: boolean; cvrPct: number; revenue: number;
  })[];

  const totalCvr     = Math.round(rows.reduce((s, r) => s + r.cvrPct, 0) * 10) / 10;
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalRevenueB = (totalRevenue / 100_000_000).toFixed(1);

  return (
    <section className={styles.wrapper}>
      {/* ── 헤더 ── */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Business Impact Matrix</h2>
          <span className={styles.subtitle}>성능 목표 달성 시 예상 비즈니스 효과 (WPO Stats 기반)</span>
        </div>
        <div className={styles.revenue_input}>
          <label className={styles.revenue_label}>연 매출 기준</label>
          <div className={styles.revenue_wrap}>
            <input
              type="number"
              className={styles.revenue_field}
              value={revenue}
              min={1}
              max={100000}
              step={1}
              onChange={(e) => setRevenue(Math.max(1, Number(e.target.value)))}
            />
            <span className={styles.revenue_unit}>억원</span>
          </div>
        </div>
      </div>

      {/* ── 총합 요약 ── */}
      <div className={styles.summary}>
        <div className={styles.summary_item}>
          <span className={styles.summary_label}>전체 CVR 개선 잠재량</span>
          <span className={styles.summary_cvr}>+{totalCvr}%</span>
        </div>
        <div className={styles.summary_divider} />
        <div className={styles.summary_item}>
          <span className={styles.summary_label}>연간 추가 매출 예측</span>
          <span className={styles.summary_revenue}>+₩{totalRevenueB}억</span>
        </div>
        <div className={styles.summary_divider} />
        <div className={styles.summary_item}>
          <span className={styles.summary_label}>미달 지표</span>
          <span className={styles.summary_fail}>
            {rows.filter((r) => !r.passes).length}개
          </span>
        </div>
      </div>

      {/* ── 매트릭스 테이블 ── */}
      <div className={styles.table_wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>지표</th>
              <th className={styles.th}>현재</th>
              <th className={styles.th}>목표</th>
              <th className={styles.th}>개선 필요</th>
              <th className={styles.th_cvr}>CVR 기여</th>
              <th className={styles.th_cvr}>CVR 계수</th>
              <th className={styles.th_revenue}>연간 추가 매출</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`${styles.row} ${row.passes ? styles.row_pass : ''}`}>
                {/* 지표명 */}
                <td className={styles.td_label}>
                  <span className={styles.metric_name}>{row.label}</span>
                  <span className={`${styles.status_dot} ${row.passes ? styles.dot_pass : styles.dot_fail}`} />
                </td>

                {/* 현재값 */}
                <td className={styles.td}>
                  <span className={row.passes ? styles.val_pass : styles.val_fail}>
                    {fmt(row.current, row.unit)}
                  </span>
                </td>

                {/* 목표값 */}
                <td className={styles.td}>
                  <span className={styles.val_target}>{row.targetLabel}</span>
                </td>

                {/* 개선 필요량 */}
                <td className={styles.td}>
                  {row.passes ? (
                    <span className={styles.achieved}>✓ 달성</span>
                  ) : (
                    <span className={styles.gap}>
                      -{fmt(Math.round(row.gap * 100) / 100, row.unit)}
                    </span>
                  )}
                </td>

                {/* CVR 기여 */}
                <td className={styles.td_cvr}>
                  {row.cvrFn ? (
                    row.passes ? (
                      <span className={styles.cvr_achieved}>✓</span>
                    ) : (
                      <span className={styles.cvr_val}>+{row.cvrPct}%</span>
                    )
                  ) : (
                    <span className={styles.no_coeff}>*</span>
                  )}
                </td>

                {/* CVR 계수 */}
                <td className={styles.td_cvr}>
                  <span className={styles.coeff}>{row.cvrBasis}</span>
                </td>

                {/* 연간 추가 매출 */}
                <td className={styles.td_revenue}>
                  {row.cvrPct > 0 ? (
                    <span className={styles.revenue_val}>
                      +₩{(row.revenue / 100_000_000).toFixed(1)}억
                    </span>
                  ) : (
                    <span className={styles.revenue_none}>—</span>
                  )}
                </td>
              </tr>
            ))}

            {/* 합계 행 */}
            <tr className={styles.total_row}>
              <td className={styles.td_label} colSpan={4}>
                <span className={styles.total_label}>합계</span>
              </td>
              <td className={styles.td_cvr}>
                <span className={styles.total_cvr}>+{totalCvr}%</span>
              </td>
              <td className={styles.td_cvr} />
              <td className={styles.td_revenue}>
                <span className={styles.total_revenue}>+₩{totalRevenueB}억</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className={styles.footnote}>
        * TBT·FCP는 CVR 계수 미적용 기술 성능 지표 · Deloitte/Google 2020, Portent 2019, Zalando 2018 기반 보수 추정
      </p>
    </section>
  );
}
