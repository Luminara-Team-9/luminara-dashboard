'use client';

import { useEffect, useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { ExecutiveSummary } from '@/widgets/executive-summary';
import { CompetitorGrid } from '@/widgets/competitor-grid';
import { PerformanceTrend } from '@/widgets/performance-trend';
import { RumHeatmap } from '@/widgets/rum-heatmap';
import { UserJourney } from '@/widgets/user-journey';
import { AiFixPanel } from '@/widgets/ai-chat-panel';
import { BusinessImpactMatrix } from '@/widgets/business-impact-matrix';
import { TrafficSessionInsight } from '@/widgets/traffic-session-insight';
import styles from './MainDashboardPage.module.css';

type DashboardView = 'ai' | 'traffic' | 'impact' | 'competitors' | 'journey' | 'trend' | 'regional';

const NAV_ITEMS: { id: DashboardView; label: string; eyebrow: string; short: string }[] = [
  { id: 'impact', label: '현재 성능 진단', eyebrow: '성능', short: '성능' },
  { id: 'competitors', label: '경쟁사 벤치마킹', eyebrow: '비교', short: '경쟁' },
  { id: 'ai', label: 'AI 액션 플랜', eyebrow: '개선', short: 'AI' },
  { id: 'journey', label: '사용자 여정', eyebrow: '여정', short: '여정' },
  { id: 'trend', label: '성능 추세', eyebrow: '변경', short: '추세' },
  { id: 'traffic', label: '방문·세션 데이터', eyebrow: '세션', short: '세션' },
  { id: 'regional', label: '보조 분석', eyebrow: '분포', short: '보조' },
];

const VIEW_TITLE: Record<DashboardView, { title: string; description: string }> = {
  ai: {
    title: 'AI 최적화 액션 플랜',
    description: '경쟁사 대비 느린 페이지와 성능 병목을 기준으로 먼저 고칠 항목을 확인합니다.',
  },
  traffic: {
    title: '방문·세션 데이터',
    description: '내부 로그 기반 방문, 구매, 이탈 데이터를 확인합니다.',
  },
  impact: {
    title: '현재 성능 진단',
    description: '현재 성능 점수와 쇼핑몰 운영 관점에서 연결되는 문제를 확인합니다.',
  },
  competitors: {
    title: '경쟁사 벤치마킹',
    description: '메인, 상품, 결제 페이지가 경쟁사보다 빠른지 느린지 비교합니다.',
  },
  journey: {
    title: '사용자 여정',
    description: '방문자가 어느 단계에서 이탈하는지 보고, 성능 병목과 전환 손실을 함께 봅니다.',
  },
  trend: {
    title: '성능 추세',
    description: '사이트 변경 시점과 지표 변화를 연결해 성능 변화의 원인 후보를 찾습니다.',
  },
  regional: {
    title: '보조 분석',
    description: '지역과 통신사별 이용 규모를 보고 제휴·운영 참고 지표로 활용합니다.',
  },
};

function Header() {
  const { loading, refetch } = usePerformanceData();
  const [mounted, setMounted] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
    setLastUpdatedAt(new Date());
  }, []);

  const lastUpdated = lastUpdatedAt
    ? lastUpdatedAt.toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const handleRefresh = () => {
    setLastUpdatedAt(new Date());
    refetch();
  };

  return (
    <header className={styles.header}>
      <div className={styles.header_inner}>
        <div className={styles.brand}>
          <div className={styles.logo_mark}>L</div>
          <div>
            <h1 className={styles.title}>Luminara</h1>
            <p className={styles.subtitle}>웹 성능 의사결정 대시보드</p>
          </div>
        </div>

        <div className={styles.header_right}>
          {mounted && !loading && (
            <div className={styles.live_badge}>
              <span className={styles.live_dot} />
              실시간
            </div>
          )}
          {mounted && lastUpdated && (
            <span className={styles.last_updated} suppressHydrationWarning>
              업데이트 {lastUpdated}
            </span>
          )}
          <button
            className={styles.refresh_btn}
            onClick={handleRefresh}
            disabled={loading}
            title="새로고침"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={mounted && loading ? styles.refresh_icon_loading : undefined}
            >
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

function DateRangeControl() {
  const { dateFrom, dateTo, setDateFrom, setDateTo } = usePerformanceData();

  return (
    <div className={styles.date_range_group} aria-label="RUM 데이터 조회 기간">
      <label className={styles.date_field}>
        <span>시작일</span>
        <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} />
      </label>
      <span className={styles.date_separator}>~</span>
      <label className={styles.date_field}>
        <span>종료일</span>
        <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} />
      </label>
      {(dateFrom || dateTo) && (
        <button type="button" className={styles.date_clear_button} onClick={() => { setDateFrom(''); setDateTo(''); }}>
          전체
        </button>
      )}
    </div>
  );
}

function ViewContent({ view }: { view: DashboardView }) {
  if (view === 'ai') return <AiFixPanel />;
  if (view === 'traffic') return <TrafficSessionInsight />;
  if (view === 'impact') return <BusinessImpactMatrix />;
  if (view === 'competitors') return <CompetitorGrid />;
  if (view === 'journey') return <UserJourney />;
  if (view === 'trend') return <PerformanceTrend />;
  return <RumHeatmap />;
}

export function MainDashboardPage() {
  const [activeView, setActiveView] = useState<DashboardView>('impact');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const viewMeta = VIEW_TITLE[activeView];
  const showsTimeRange = activeView === 'traffic' || activeView === 'journey' || activeView === 'regional';

  useEffect(() => {
    const handleNavigateAi = () => setActiveView('ai');

    window.addEventListener('luminara:navigate-ai', handleNavigateAi);
    return () => window.removeEventListener('luminara:navigate-ai', handleNavigateAi);
  }, []);

  return (
    <main className={styles.page}>
      <Header />
      <ExecutiveSummary />

      <div className={`${styles.dashboard_shell} ${sidebarCollapsed ? styles.dashboard_shell_collapsed : ''}`}>
        <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebar_collapsed : ''}`}>
          <div className={styles.sidebar_header}>
            <div className={styles.sidebar_title_wrap}>
              <span className={styles.sidebar_eyebrow}>대시보드</span>
              <span className={styles.sidebar_title}>상세 보기</span>
            </div>
            <button
              type="button"
              className={styles.sidebar_toggle}
              aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
              title={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'}
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            >
              {sidebarCollapsed ? '›' : '‹'}
            </button>
          </div>

          <nav className={styles.nav} aria-label="대시보드 보기">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.nav_item} ${activeView === item.id ? styles.nav_item_active : ''}`}
                onClick={() => setActiveView(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className={styles.nav_short}>{item.short}</span>
                <span className={styles.nav_eyebrow}>{item.eyebrow}</span>
                <span className={styles.nav_label}>{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className={styles.workspace}>
          <div className={styles.workspace_header}>
            <div>
              <p className={styles.workspace_eyebrow}>현재 보기</p>
              <h2 className={styles.workspace_title}>{viewMeta.title}</h2>
            </div>
            <div className={styles.workspace_meta}>
              <p className={styles.workspace_desc}>{viewMeta.description}</p>
              {showsTimeRange && <DateRangeControl />}
            </div>
          </div>

          <div className={`${styles.view_panel} ${activeView === 'trend' ? styles.view_panel_overflow_visible : ''}`}>
            <ViewContent view={activeView} />
          </div>
        </section>
      </div>
    </main>
  );
}
