'use client';

import { useState } from 'react';
import { AiFixCard } from '@/entities/ai-plan';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import type { FixPriority } from '@/shared/lib/types';
import styles from './AiFixPanel.module.css';

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
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  const plans = filter === '전체'
    ? data.aiFixPlans
    : data.aiFixPlans.filter((p) => p.priority === (filter as FixPriority));

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.header_left}>
          <h2 className={styles.title}>AI 최적화 액션 플랜</h2>
          <span className={styles.subtitle}>DeepSeek-R1 분석 결과</span>
        </div>
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
          <AiFixCard key={plan.id} plan={plan} />
        ))}
        {plans.length === 0 && (
          <p className={styles.empty}>해당 우선순위의 액션 플랜이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
