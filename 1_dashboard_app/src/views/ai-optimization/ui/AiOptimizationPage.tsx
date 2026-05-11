'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { RoiMatrix } from '@/widgets/roi-matrix';
import { Skeleton } from '@/shared/ui';
import type { AiFixPlan, FixPriority } from '@/shared/lib/types';
import styles from './AiOptimizationPage.module.css';

const PRIORITY_META: Record<FixPriority, { label: string; color: string }> = {
  critical: { label: 'P0 긴급', color: '#ef4444' },
  high: { label: 'P1 높음', color: '#f97316' },
  medium: { label: 'P2 중간', color: '#f59e0b' },
  low: { label: 'P3 낮음', color: '#10b981' },
};

const EFFORT_LABEL = { low: '낮음', medium: '중간', high: '높음' } as const;

const METRIC_LABEL: Record<string, string> = {
  lcp: '첫 화면 표시(LCP)',
  cls: '화면 안정성(CLS)',
  inp: '클릭 반응(INP)',
  tbt: '스크립트 부담(TBT)',
  fcp: '첫 콘텐츠 표시(FCP)',
  speedIndex: '화면 완성 속도(Speed Index)',
  assetSize: '리소스 크기(Asset Size)',
};

const DECISION_AREA: Record<string, string> = {
  lcp: '이탈 위험',
  fcp: '이탈 위험',
  speedIndex: '체감 속도',
  inp: '탐색 반응성',
  tbt: '반응 속도 개선 필요',
  cls: '화면 안정성',
  assetSize: '비용 절감',
};

function StatCard({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className={styles.stat_card}>
      <span className={styles.stat_value} style={color ? { color } : undefined}>{value}</span>
      <span className={styles.stat_label}>{label}</span>
    </div>
  );
}

function PlanCard({ plan }: { plan: AiFixPlan }) {
  const { label: priorityLabel, color: priorityColor } = PRIORITY_META[plan.priority];
  return (
    <article className={styles.plan_card} style={{ borderLeftColor: priorityColor }}>
      <div className={styles.plan_top}>
        <span className={styles.plan_priority} style={{ color: priorityColor, backgroundColor: `${priorityColor}1a` }}>
          {priorityLabel}
        </span>
        <div className={styles.plan_tags}>
          <span className={styles.plan_metric}>{METRIC_LABEL[plan.metricKey] ?? plan.metricKey}</span>
          <span className={styles.plan_effort}>작업량 {EFFORT_LABEL[plan.effort]}</span>
        </div>
      </div>

      <h3 className={styles.plan_title}>{plan.title}</h3>
      <p className={styles.plan_desc}>{plan.description}</p>

      <div className={styles.plan_bottom}>
        <span className={styles.plan_impact}>
          {METRIC_LABEL[plan.metricKey] ?? plan.metricKey}{' → '}{DECISION_AREA[plan.metricKey] ?? '사용자 경험'}
        </span>
        <span className={styles.plan_brand}>판단 연결</span>
      </div>

      <div className={styles.plan_bottom}>
        <span className={styles.plan_impact}>{plan.estimatedImpact}</span>
        <span className={styles.plan_brand}>{plan.brand}</span>
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div className={styles.skeleton_wrap}>
      <div className={styles.stat_row}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.stat_card}>
            <Skeleton width="48px" height="32px" radius="6px" />
            <Skeleton width="72px" height="12px" />
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.skeleton_card}>
            <div className={styles.skeleton_card_top}>
              <Skeleton width="80px" height="22px" radius="5px" />
              <Skeleton width="60px" height="22px" radius="5px" />
            </div>
            <Skeleton width="85%" height="18px" />
            <Skeleton width="100%" height="13px" />
            <Skeleton width="95%" height="13px" />
            <Skeleton width="80%" height="13px" />
            <Skeleton width="60%" height="13px" />
            <div className={styles.skeleton_card_footer}>
              <Skeleton width="80px" height="16px" />
              <Skeleton width="60px" height="16px" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AiOptimizationPage() {
  const { data, loading, error } = usePerformanceData();
  const [priorityFilter, setPriorityFilter] = useState<FixPriority | 'all'>('all');
  const [metricFilter, setMetricFilter]     = useState<string>('all');

  const plans = data?.aiFixPlans ?? [];

  const availableMetrics = useMemo(
    () => [...new Set(plans.map((p) => p.metricKey))],
    [plans],
  );

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      const matchPriority = priorityFilter === 'all' || p.priority === priorityFilter;
      const matchMetric   = metricFilter   === 'all' || p.metricKey === metricFilter;
      return matchPriority && matchMetric;
    });
  }, [plans, priorityFilter, metricFilter]);

  const counts = useMemo(
    () => ({
      critical: plans.filter((p) => p.priority === 'critical').length,
      high:     plans.filter((p) => p.priority === 'high').length,
      medium:   plans.filter((p) => p.priority === 'medium').length,
      low:      plans.filter((p) => p.priority === 'low').length,
    }),
    [plans],
  );

  return (
    <div className={styles.page}>
      <div className={styles.page_header}>
        <Link href="/" className={styles.back_link}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          대시보드로 돌아가기
        </Link>
        <div className={styles.page_title_wrap}>
          <h1 className={styles.page_title}>AI 최적화 액션 플랜</h1>
          <p className={styles.page_subtitle}>성능 병목과 쇼핑 여정 중요도를 기준으로 정렬한 개선 항목</p>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {loading || !data ? (
        <LoadingSkeleton />
      ) : (
        <div className={styles.content}>
          <div className={styles.stat_row}>
            <StatCard value={plans.length} label="전체 항목" />
            <StatCard value={counts.critical} label="P0 Critical" color="#ef4444" />
            <StatCard value={counts.high}     label="P1 High"     color="#f97316" />
            <StatCard value={counts.medium}   label="P2 Medium"   color="#f59e0b" />
            <StatCard value={counts.low}      label="P3 Low"      color="#10b981" />
          </div>

          <div className={styles.filter_bar}>
            <div className={styles.filter_group}>
              <span className={styles.filter_label}>우선순위</span>
              <div className={styles.tabs}>
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    className={`${styles.tab} ${priorityFilter === p ? styles.tab_active : ''}`}
                    onClick={() => setPriorityFilter(p)}
                  >
                    {p === 'all' ? '전체' : PRIORITY_META[p].label}
                    {p !== 'all' && <span className={styles.tab_count}>{counts[p]}</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.filter_group}>
              <span className={styles.filter_label}>지표</span>
              <div className={styles.tabs}>
                <button
                  className={`${styles.tab} ${metricFilter === 'all' ? styles.tab_active : ''}`}
                  onClick={() => setMetricFilter('all')}
                >
                  전체
                </button>
                {availableMetrics.map((m) => (
                  <button
                    key={m}
                    className={`${styles.tab} ${metricFilter === m ? styles.tab_active : ''}`}
                    onClick={() => setMetricFilter(m)}
                  >
                    {METRIC_LABEL[m] ?? m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className={styles.result_count}>
            {filtered.length}개 항목
          </p>

          <div className={styles.roi_wrap}>
            <RoiMatrix />
          </div>

          {filtered.length > 0 ? (
            <div className={styles.grid}>
              {filtered.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <p>선택한 필터에 해당하는 항목이 없습니다.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
