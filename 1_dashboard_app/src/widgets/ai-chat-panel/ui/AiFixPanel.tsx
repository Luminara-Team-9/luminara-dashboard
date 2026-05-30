'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AiFixCard } from '@/entities/ai-plan';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { Skeleton } from '@/shared/ui';
import type { FixPriority } from '@/shared/lib/types';
import styles from './AiFixPanel.module.css';

const ALL_FILTER = '전체';
const FILTERS = [ALL_FILTER, 'critical', 'high', 'medium', 'low'] as const;
const APPLICABILITY_FILTERS = ['all', 'applicable', 'manual'] as const;
type Filter = (typeof FILTERS)[number];
type ApplicabilityFilter = (typeof APPLICABILITY_FILTERS)[number];

const FILTER_LABEL: Record<Filter, string> = {
  전체: '전체',
  critical: '긴급',
  high: '높음',
  medium: '중간',
  low: '낮음',
};

const APPLICABILITY_LABEL: Record<ApplicabilityFilter, string> = {
  all: '전체',
  applicable: '적용 가능',
  manual: '수동 검토',
};

export function AiFixPanel() {
  const { data, loading, error } = usePerformanceData();
  const [filter, setFilter] = useState<Filter>(ALL_FILTER);
  const [applicabilityFilter, setApplicabilityFilter] = useState<ApplicabilityFilter>('all');

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
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} width="72px" height="28px" radius="7px" />
            ))}
          </div>
        </div>
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              style={{
                background: '#ffffff',
                border: '1px solid #d7dee8',
                borderRadius: 14,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Skeleton width="60px" height="20px" radius="6px" />
                <Skeleton width="72px" height="20px" radius="6px" />
              </div>
              <Skeleton width="80%" height="16px" />
              <Skeleton width="100%" height="12px" />
              <Skeleton width="90%" height="12px" />
              <Skeleton width="70%" height="12px" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const plans = data.aiFixPlans.filter((plan) => {
    const matchesPriority = filter === ALL_FILTER || plan.priority === (filter as FixPriority);
    const matchesApplicability =
      applicabilityFilter === 'all' ||
      (applicabilityFilter === 'applicable' && plan.autoApplicable === true) ||
      (applicabilityFilter === 'manual' && plan.autoApplicable === false);

    return matchesPriority && matchesApplicability;
  });

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.header_left}>
          <h2 className={styles.title}>AI 최적화 액션 플랜</h2>
          <span className={styles.subtitle}>성능 병목과 구매 여정 중요도를 함께 반영한 개선 우선순위</span>
        </div>
        <Link href="/ai-optimization" className={styles.view_all}>전체 보기</Link>
        <div className={styles.tabs}>
          {APPLICABILITY_FILTERS.map((item) => (
            <button
              key={item}
              className={`${styles.tab} ${applicabilityFilter === item ? styles.tab_active : ''}`}
              onClick={() => setApplicabilityFilter(item)}
            >
              {APPLICABILITY_LABEL[item]}
              <span className={styles.count}>
                {item === 'all'
                  ? data.aiFixPlans.length
                  : data.aiFixPlans.filter((plan) => item === 'applicable' ? plan.autoApplicable === true : plan.autoApplicable === false).length}
              </span>
            </button>
          ))}
        </div>
        <div className={styles.tabs}>
          {FILTERS.map((item) => (
            <button
              key={item}
              className={`${styles.tab} ${filter === item ? styles.tab_active : ''} ${item !== ALL_FILTER ? styles[`tab_${item}`] : ''}`}
              onClick={() => setFilter(item)}
            >
              {FILTER_LABEL[item]}
              {item !== ALL_FILTER && (
                <span className={styles.count}>
                  {data.aiFixPlans.filter((plan) => plan.priority === item).length}
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
