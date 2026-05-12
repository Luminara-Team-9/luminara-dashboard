'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { clamp } from '@/shared/lib/estimationFormulas';
import { Skeleton } from '@/shared/ui';
import type { AiFixPlan, FixEffort, FixPriority } from '@/shared/lib/types';
import styles from './RoiMatrix.module.css';

const EFFORT_X: Record<FixEffort, number> = { low: 20, medium: 50, high: 80 };
const EFFORT_LABEL: Record<FixEffort, string> = { low: '낮음', medium: '중간', high: '높음' };

const PRIORITY_LABEL: Record<FixPriority, string> = {
  critical: '긴급',
  high: '높음',
  medium: '중간',
  low: '낮음',
};

const PRIORITY_COLOR: Record<FixPriority, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#10b981',
};

const QUADRANTS = [
  { top: '4%', left: '2%', label: '즉시 실행', sub: '낮은 노력, 높은 임팩트', highlight: true },
  { top: '4%', left: '52%', label: '계획 수립', sub: '높은 노력, 높은 임팩트', highlight: false },
  { top: '54%', left: '2%', label: '점진 개선', sub: '낮은 노력, 낮은 임팩트', highlight: false },
  { top: '54%', left: '52%', label: '보류', sub: '높은 노력, 낮은 임팩트', highlight: false },
];

interface DotProps {
  plan: AiFixPlan;
  onHover: (id: string | null) => void;
  active: boolean;
}

function Dot({ plan, onHover, active }: DotProps) {
  const x = EFFORT_X[plan.effort];
  const y = clamp(4, 100 - plan.impactScore * 10, 96);
  const color = PRIORITY_COLOR[plan.priority];
  const tooltipBelow = y < 30;

  return (
    <div
      className={`${styles.dot} ${active ? styles.dot_active : ''}`}
      style={{
        left: `${x}%`,
        top: `${y}%`,
        background: color,
        boxShadow: active ? `0 0 0 3px ${color}55` : 'none',
      }}
      onMouseEnter={() => onHover(plan.id)}
      onMouseLeave={() => onHover(null)}
    >
      {active && (
        <div
          className={styles.tooltip}
          style={tooltipBelow
            ? { top: 'calc(100% + 8px)', bottom: 'auto' }
            : { bottom: 'calc(100% + 8px)', top: 'auto' }
          }
        >
          <p className={styles.tooltip_title}>{plan.title}</p>
          <p className={styles.tooltip_meta}>
            임팩트 {plan.impactScore}/10 · 노력 {EFFORT_LABEL[plan.effort]}
          </p>
          <p className={styles.tooltip_impact}>{plan.estimatedImpact}</p>
        </div>
      )}
    </div>
  );
}

export function RoiMatrix() {
  const { data, loading, error } = usePerformanceData();
  const [hoverId, setHoverId] = useState<string | null>(null);

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <Skeleton width="150px" height="18px" />
        <Skeleton width="100%" height="300px" radius="16px" />
      </section>
    );
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>ROI 매트릭스</h2>
        <span className={styles.subtitle}>노력 대비 임팩트 우선순위</span>
      </div>

      <div className={styles.legend}>
        {(['critical', 'high', 'medium', 'low'] as FixPriority[]).map((priority) => (
          <span key={priority} className={styles.legend_item}>
            <span className={styles.legend_dot} style={{ background: PRIORITY_COLOR[priority] }} />
            {PRIORITY_LABEL[priority]}
          </span>
        ))}
      </div>

      <div className={styles.chart_outer}>
        <div className={styles.y_label}>임팩트 ↑</div>

        <div className={styles.chart_inner}>
          <div className={styles.divider_v} />
          <div className={styles.divider_h} />
          <div className={styles.quad_highlight} />

          {QUADRANTS.map((quadrant) => (
            <div
              key={quadrant.label}
              className={`${styles.quad_label} ${quadrant.highlight ? styles.quad_label_highlight : ''}`}
              style={{ top: quadrant.top, left: quadrant.left }}
            >
              <span className={styles.quad_name}>{quadrant.label}</span>
              <span className={styles.quad_sub}>{quadrant.sub}</span>
            </div>
          ))}

          {data.aiFixPlans.map((plan) => (
            <Dot
              key={plan.id}
              plan={plan}
              onHover={setHoverId}
              active={hoverId === plan.id}
            />
          ))}
        </div>

        <div className={styles.x_ticks}>
          {(Object.entries(EFFORT_X) as [FixEffort, number][]).map(([effort, x]) => (
            <span key={effort} className={styles.x_tick} style={{ left: `${x}%` }}>
              {EFFORT_LABEL[effort]}
            </span>
          ))}
        </div>
        <div className={styles.x_label}>노력(Effort) →</div>
      </div>
    </section>
  );
}
