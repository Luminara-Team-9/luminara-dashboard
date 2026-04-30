'use client';

import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import type { GlobalStatus } from '@/shared/lib/types';
import styles from './ExecutiveSummary.module.css';

// ── 글로벌 점수 상태 ──────────────────────────────────────────
const STATUS_META: Record<GlobalStatus, { label: string; color: string }> = {
  optimal:          { label: 'OPTIMAL',          color: '#10b981' },
  'needs-improvement': { label: 'NEEDS IMPROVEMENT', color: '#f59e0b' },
  critical:         { label: 'CRITICAL',         color: '#ef4444' },
};

// ── SVG 원형 게이지 ───────────────────────────────────────────
function ScoreArc({ score, color }: { score: number; color: string }) {
  const r = 26;
  const cx = 34;
  const cy = 34;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  return (
    <svg width="68" height="68" viewBox="0 0 68 68">
      {/* 배경 트랙 */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
      {/* 진행 호 */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* 점수 텍스트 */}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fill="#f1f5f9" fontSize="15" fontWeight="800">
        {score}
      </text>
    </svg>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function ExecutiveSummary() {
  const { data, loading } = usePerformanceData();

  if (loading || !data) return <div className={styles.skeleton} />;

  const { executiveSummary: es } = data;
  const { label: statusLabel, color: statusColor } = STATUS_META[es.status];

  const revenueB = (es.roiImpact.annualRevenueImpact / 100_000_000).toFixed(2);

  return (
    <div className={styles.strip}>

      {/* ── 카드 1: 글로벌 점수 ── */}
      <div className={styles.card}>
        <ScoreArc score={es.globalScore} color={statusColor} />
        <div className={styles.card_info}>
          <span className={styles.card_label}>GLOBAL SCORE</span>
          <span className={styles.status_badge} style={{ color: statusColor, borderColor: statusColor }}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── 카드 2: ROI 임팩트 ── */}
      <div className={styles.card}>
        <div className={styles.card_icon}>📈</div>
        <div className={styles.card_info}>
          <span className={styles.card_label}>CVR LIFT</span>
          <span className={styles.card_value}>+{es.roiImpact.cvrLift}%</span>
          <span className={styles.card_sub}>연간 +₩{revenueB}억 예측</span>
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── 카드 3: SEO 건강도 ── */}
      <div className={styles.card}>
        <div className={styles.card_icon}>🔍</div>
        <div className={styles.card_info}>
          <span className={styles.card_label}>SEO RANK</span>
          <span className={styles.card_value}>상위 {es.seoHealth.rankPercentile}%</span>
          <span className={styles.card_sub}>
            목표 달성 시 +{es.seoHealth.estimatedChange}pt
          </span>
        </div>
      </div>

      <div className={styles.divider} />

      {/* ── 카드 4: 탄소 발자국 ── */}
      <div className={styles.card}>
        <div className={styles.card_icon}>🌿</div>
        <div className={styles.card_info}>
          <span className={styles.card_label}>CARBON / PV</span>
          <span className={styles.card_value}>{es.carbonFootprint.gramsPerPageView}g</span>
          <span className={styles.card_sub}>
            최적화 시 −{es.carbonFootprint.savedGrams}g 절감
          </span>
        </div>
      </div>

    </div>
  );
}
