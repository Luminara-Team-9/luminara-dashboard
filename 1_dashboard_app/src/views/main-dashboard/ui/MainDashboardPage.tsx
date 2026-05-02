'use client';

import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { ExecutiveSummary } from '@/widgets/executive-summary';
import { CompetitorGrid }   from '@/widgets/competitor-grid';
import { PerformanceTrend } from '@/widgets/performance-trend';
import { RumHeatmap }       from '@/widgets/rum-heatmap';
import { UserJourney }      from '@/widgets/user-journey';
import { AiFixPanel }       from '@/widgets/ai-chat-panel';
import styles from './MainDashboardPage.module.css';

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
      <ExecutiveSummary />

      <div className={styles.row_two}>
        <section className={styles.section}><CompetitorGrid /></section>
        <section className={styles.section}><PerformanceTrend /></section>
      </div>

      <div className={styles.row_three}>
        <section className={styles.section}><RumHeatmap /></section>
        <section className={styles.section}><UserJourney /></section>
        <section className={styles.section}><AiFixPanel /></section>
      </div>
    </main>
  );
}
