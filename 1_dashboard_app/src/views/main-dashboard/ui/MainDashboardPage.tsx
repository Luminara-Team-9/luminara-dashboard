'use client';

import Link from 'next/link';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcCvrLift, calcRevenueImpact } from '@/shared/lib/cvr';
import { ExecutiveSummary }     from '@/widgets/executive-summary';
import { CompetitorGrid }       from '@/widgets/competitor-grid';
import { PerformanceTrend }     from '@/widgets/performance-trend';
import { RumHeatmap }           from '@/widgets/rum-heatmap';
import { UserJourney }          from '@/widgets/user-journey';
import { AiFixPanel }           from '@/widgets/ai-chat-panel';
import { BusinessImpactMatrix } from '@/widgets/business-impact-matrix';
import styles from './MainDashboardPage.module.css';

function AlertBanner() {
  const { data, loading } = usePerformanceData();
  if (loading || !data) return null;

  const decathlon = data.benchmarks.find((b) => b.isTarget);
  if (!decathlon) return null;

  const m = decathlon.metrics;
  const failing = ([
    m.lcp.value       > m.lcp.target       && 'LCP',
    m.inp.value       > m.inp.target       && 'INP',
    m.tbt.value       > m.tbt.target       && 'TBT',
    m.fcp.value       > m.fcp.target       && 'FCP',
    m.assetSize.value > m.assetSize.target && 'Asset Size',
  ] as (string | false)[]).filter(Boolean) as string[];

  if (failing.length === 0) return null;

  const cvrLift = calcCvrLift({
    lcpCurrent: m.lcp.value, lcpTarget: m.lcp.target,
    inpCurrent: m.inp.value, inpTarget: m.inp.target,
    clsCurrent: m.cls.value, clsTarget: m.cls.target,
  });
  const monthlyLossB = (
    calcRevenueImpact(cvrLift, data.executiveSummary.baselineAnnualRevenue) / 12 / 100_000_000
  ).toFixed(1);

  const isCritical = failing.length >= 3;

  return (
    <div className={`${styles.alert_banner} ${isCritical ? styles.alert_critical : ''}`}>
      <div className={styles.alert_inner}>
        <div className={styles.alert_left}>
          <span className={styles.alert_icon}>{isCritical ? '⚠' : '!'}</span>
          <div className={styles.alert_text}>
            <span className={styles.alert_title}>{failing.length}개 지표 목표 미달</span>
            <span className={styles.alert_sub}>{failing.join(' · ')}</span>
          </div>
        </div>
        <div className={styles.alert_center}>
          <span className={styles.alert_loss_label}>월 추정 기회손실</span>
          <span className={styles.alert_loss_value}>~₩{monthlyLossB}억</span>
        </div>
        <Link href="/ai-optimization" className={styles.alert_cta}>
          AI 액션 플랜 보기 →
        </Link>
      </div>
    </div>
  );
}

function Header() {
  const { data, loading, refetch } = usePerformanceData();

  const lastUpdated = data?.timestamp
    ? new Date(data.timestamp).toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <header className={styles.header}>
      <div className={styles.header_inner}>
        <div className={styles.brand}>
          <div className={styles.logo_mark}>L</div>
          <div>
            <h1 className={styles.title}>Luminara</h1>
            <p className={styles.subtitle}>Web Performance Intelligence</p>
          </div>
        </div>

        <div className={styles.header_right}>
          {!loading && (
            <div className={styles.live_badge}>
              <span className={styles.live_dot} />
              LIVE
            </div>
          )}
          {lastUpdated && (
            <span className={styles.last_updated}>Updated {lastUpdated}</span>
          )}
          <button
            className={styles.refresh_btn}
            onClick={refetch}
            disabled={loading}
            title="새로고침"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: loading ? 'rotate(360deg)' : 'none', transition: loading ? 'transform 0.8s linear infinite' : 'none' }}>
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export function MainDashboardPage() {
  return (
    <main className={styles.page}>
      <Header />
      <AlertBanner />
      <ExecutiveSummary />

      {/* 어디서 잃고 있나 + 성능 추세·CVR 상관관계 */}
      <div className={styles.row_insight}>
        <section className={styles.section}><UserJourney /></section>
        <section className={`${styles.section} ${styles.section_overflow_visible}`}><PerformanceTrend /></section>
      </div>

      {/* AI 액션 플랜 (승격 — 가장 중요한 아웃풋) */}
      <div className={styles.row_action}>
        <section className={styles.section}><AiFixPanel /></section>
      </div>

      {/* 비즈니스 임팩트 + 경쟁사 맥락 */}
      <div className={styles.row_analysis}>
        <section className={styles.section}><BusinessImpactMatrix /></section>
        <section className={styles.section}><CompetitorGrid /></section>
      </div>

      {/* 지역·통신사 레이턴시 (참고용) */}
      <div className={styles.row_regional}>
        <section className={styles.section}><RumHeatmap /></section>
      </div>
    </main>
  );
}
