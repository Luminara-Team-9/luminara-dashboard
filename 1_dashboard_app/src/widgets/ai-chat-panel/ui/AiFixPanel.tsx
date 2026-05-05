'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AiFixCard } from '@/entities/ai-plan';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcCvrLift, calcRevenueImpact } from '@/shared/lib/cvr';
import { Skeleton } from '@/shared/ui';
import type { FixPriority, BenchmarkEntry } from '@/shared/lib/types';
import styles from './AiFixPanel.module.css';

function getPlanRevenue(
  metricKey: string,
  benchmarks: BenchmarkEntry[],
  annualRevenue: number,
): number | null {
  const d = benchmarks.find(b => b.isTarget);
  if (!d) return null;
  const m = d.metrics;

  const cvrLift = calcCvrLift({
    lcpCurrent: metricKey === 'lcp' ? m.lcp.value : 0,
    lcpTarget:  metricKey === 'lcp' ? m.lcp.target : 0,
    inpCurrent: metricKey === 'inp' ? m.inp.value : 0,
    inpTarget:  metricKey === 'inp' ? m.inp.target : 0,
    clsCurrent: metricKey === 'cls' ? m.cls.value : 0,
    clsTarget:  metricKey === 'cls' ? m.cls.target : 0,
  });

  if (cvrLift <= 0) return null;
  return calcRevenueImpact(cvrLift, annualRevenue);
}

const FILTERS = ['전체', 'critical', 'high', 'medium', 'low'] as const;
type Filter = (typeof FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  '전체':    '전체',
  critical: 'P0 Critical',
  high:     'P1 High',
  medium:   'P2 Medium',
  low:      'P3 Low',
};

export function AiFixPanel() {
  const { data, loading, error } = usePerformanceData();
  const [filter, setFilter] = useState<Filter>('전체');

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.header}>
          <div className={styles.header_left}>
            <Skeleton width="160px" height="18px" />
            <Skeleton width="110px" height="12px" />
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} width="72px" height="28px" radius="7px" />
            ))}
          </div>
        </div>
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Skeleton width="60px" height="20px" radius="6px" />
                <Skeleton width="72px" height="20px" radius="6px" />
              </div>
              <Skeleton width="80%" height="16px" />
              <Skeleton width="100%" height="12px" />
              <Skeleton width="90%" height="12px" />
              <Skeleton width="70%" height="12px" />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <Skeleton width="80px" height="24px" radius="6px" />
                <Skeleton width="80px" height="24px" radius="6px" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const plans = filter === '전체'
    ? data.aiFixPlans
    : data.aiFixPlans.filter((p) => p.priority === (filter as FixPriority));

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.header_left}>
          <h2 className={styles.title}>AI 최적화 액션 플랜</h2>
          <span className={styles.subtitle}>Qwen 분석 결과</span>
        </div>
        <Link href="/ai-optimization" className={styles.view_all}>전체보기</Link>
        <div className={styles.tabs}>
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`${styles.tab} ${filter === f ? styles.tab_active : ''} ${f !== '전체' ? styles[`tab_${f}`] : ''}`}
              onClick={() => setFilter(f)}
            >
              {FILTER_LABEL[f]}
              {f !== '전체' && (
                <span className={styles.count}>
                  {data.aiFixPlans.filter((p) => p.priority === f).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {plans.map((plan) => (
          <AiFixCard
            key={plan.id}
            plan={plan}
            revenueImpact={getPlanRevenue(
              plan.metricKey,
              data.benchmarks,
              data.executiveSummary.baselineAnnualRevenue,
            )}
          />
        ))}
        {plans.length === 0 && (
          <p className={styles.empty}>해당 우선순위의 액션 플랜이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
