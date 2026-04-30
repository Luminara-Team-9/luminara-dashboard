import { ExecutiveSummary } from '@/widgets/executive-summary';
import { CompetitorGrid }   from '@/widgets/competitor-grid';
import { PerformanceTrend } from '@/widgets/performance-trend';
import { RumHeatmap }       from '@/widgets/rum-heatmap';
import { UserJourney }      from '@/widgets/user-journey';
import { AiFixPanel }       from '@/widgets/ai-chat-panel';
import styles from './MainDashboardPage.module.css';

export function MainDashboardPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.header_inner}>
          <h1 className={styles.title}>Luminara Intelligence</h1>
          <p className={styles.subtitle}>Lighthouse 기반 웹 성능 관제 시스템</p>
        </div>
      </header>

      <ExecutiveSummary />

      {/* 첫 번째 뷰포트 — 벤치마킹 표 + 트렌드 차트 */}
      <div className={styles.row_two}>
        <section className={styles.section}><CompetitorGrid /></section>
        <section className={styles.section}><PerformanceTrend /></section>
      </div>

      {/* 두 번째 뷰포트 — RUM 히트맵 | 사용자 여정 | AI 액션 플랜 */}
      <div className={styles.row_three}>
        <section className={styles.section}><RumHeatmap /></section>
        <section className={styles.section}><UserJourney /></section>
        <section className={styles.section}><AiFixPanel /></section>
      </div>
    </main>
  );
}
