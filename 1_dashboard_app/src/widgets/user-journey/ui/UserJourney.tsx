'use client';

import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcConversionRatePercent, calcDropoff } from '@/shared/lib/estimationFormulas';
import { formatCompactCount } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui';
import type { MetricItem, PageType, SessionPathPattern, UserJourneyStep } from '@/shared/lib/types';
import styles from './UserJourney.module.css';

type JourneyPageMetrics = {
  brand: string;
  page: PageType;
  metrics: {
    lcp: MetricItem;
    inp: MetricItem;
    tbt: MetricItem;
  };
};

type PathStep = SessionPathPattern['path'][number];

const MAX_VISIBLE_PATHS = 4;

const PAGE_CONTEXT_LABEL: Record<PageType, string> = {
  main: '탐색 화면',
  product: '상품 화면',
  checkout: '결제 화면',
};

const DEVICE_LABEL: Record<SessionPathPattern['device'], string> = {
  Mobile: '모바일',
  Desktop: '데스크톱',
  Tablet: '태블릿',
};

const OUTCOME_LABEL: Record<SessionPathPattern['outcome'], string> = {
  purchase: '구매 완료',
  dropoff: '이탈',
};

const SUMMARY_STEP_LABEL: Record<string, string> = {
  메인: '사이트 방문',
  검색: '상품 검색',
  '상품 상세': '상품 상세',
  장바구니: '장바구니',
  결제: '결제 진입',
  완료: '구매 완료',
};

function getPageMetrics(
  pageMetrics: JourneyPageMetrics[],
  targetBrand: string,
  page: PageType,
): JourneyPageMetrics['metrics'] | null {
  return pageMetrics.find((item) => item.brand === targetBrand && item.page === page)?.metrics ?? null;
}

function getPathLastStep(pattern: SessionPathPattern): PathStep {
  return pattern.path.at(-1) ?? { step: '방문 종료', event: 'exit', pageType: 'main' };
}

function getPathLastMetrics(
  pattern: SessionPathPattern,
  pageMetrics: JourneyPageMetrics[],
  targetBrand: string,
): JourneyPageMetrics['metrics'] | null {
  return getPageMetrics(pageMetrics, targetBrand, getPathLastStep(pattern).pageType);
}

function summarizeDisplaySteps(path: PathStep[]): PathStep[] {
  if (path.length <= 6) return path;

  const importantEvents = new Set(['view_item', 'add_to_cart', 'begin_checkout', 'purchase', 'exit']);
  const picked = [
    path[0],
    path[1],
    ...path.slice(2, -1).filter((step) => importantEvents.has(step.event)),
    path[path.length - 1],
  ];

  return picked.filter((step, index, list) => (
    Boolean(step) && list.findIndex((item) => item.event === step.event && item.step === step.step) === index
  ));
}

function getReadableResult(
  pattern: SessionPathPattern,
  metrics: JourneyPageMetrics['metrics'] | null,
): { title: string; detail: string } {
  const lastStep = getPathLastStep(pattern);
  const pageLabel = PAGE_CONTEXT_LABEL[lastStep.pageType];

  if (pattern.outcome === 'purchase') {
    return {
      title: '구매까지 완료한 경로',
      detail: metrics
        ? `${pageLabel} 표시 ${metrics.lcp.value}초 · 버튼 반응 ${metrics.inp.value}ms`
        : `${pageLabel}에서 구매 완료`,
    };
  }

  if (lastStep.pageType === 'checkout') {
    return {
      title: '결제까지 이동했지만 구매 완료 전 이탈',
      detail: metrics
        ? `${pageLabel} 표시 ${metrics.lcp.value}초 · 버튼 반응 ${metrics.inp.value}ms`
        : `${pageLabel}에서 이탈`,
    };
  }

  if (lastStep.pageType === 'product') {
    return {
      title: '상품은 확인했지만 장바구니로 이동하지 않음',
      detail: metrics
        ? `${pageLabel} 표시 ${metrics.lcp.value}초 · 버튼 반응 ${metrics.inp.value}ms`
        : `${pageLabel}에서 이탈`,
    };
  }

  return {
    title: '상품 상세 진입 전 탐색 종료',
    detail: metrics
      ? `${pageLabel} 표시 ${metrics.lcp.value}초 · 버튼 반응 ${metrics.inp.value}ms`
      : `${pageLabel}에서 이탈`,
  };
}

function getFallbackPaths(userJourney: UserJourneyStep[]): SessionPathPattern[] {
  const checkout = userJourney.find((step) => step.step === '결제');
  const product = userJourney.find((step) => step.step === '상품 상세');
  const complete = userJourney.find((step) => step.step === '완료');

  return [
    {
      id: 'fallback-search-checkout',
      name: '검색 유입 후 결제 이탈',
      source: '검색 유입',
      device: 'Mobile',
      sessions: checkout?.sessions ?? 0,
      share: 0,
      outcome: 'dropoff',
      lastStep: '결제 단계 이탈',
      path: [
        { step: '검색 결과 유입', detail: '키워드 검색', event: 'session_start', pageType: 'main' },
        { step: '상품 검색', detail: '상품 목록 확인', event: 'search', pageType: 'main' },
        { step: '상품 상세', detail: '상품 정보 확인', event: 'view_item', pageType: 'product' },
        { step: '장바구니 담기', detail: '구매 후보 등록', event: 'add_to_cart', pageType: 'product' },
        { step: '결제 진입', detail: '결제 전 종료', event: 'begin_checkout', pageType: 'checkout' },
      ],
    },
    {
      id: 'fallback-product-dropoff',
      name: '상품 확인 후 이탈',
      source: '전체 유입',
      device: 'Mobile',
      sessions: product?.sessions ?? 0,
      share: 0,
      outcome: 'dropoff',
      lastStep: '상품 상세 이탈',
      path: [
        { step: '사이트 방문', detail: '메인 또는 검색', event: 'session_start', pageType: 'main' },
        { step: '상품 상세', detail: '상품 정보 확인', event: 'view_item', pageType: 'product' },
        { step: '사이트 종료', detail: '장바구니 미진입', event: 'exit', pageType: 'product' },
      ],
    },
    {
      id: 'fallback-purchase',
      name: '상품 확인 후 구매 완료',
      source: '전체 유입',
      device: 'Desktop',
      sessions: complete?.sessions ?? 0,
      share: 0,
      outcome: 'purchase',
      lastStep: '구매 완료',
      path: [
        { step: '사이트 방문', detail: '방문 시작', event: 'session_start', pageType: 'main' },
        { step: '상품 상세', detail: '상품 정보 확인', event: 'view_item', pageType: 'product' },
        { step: '장바구니 담기', detail: '구매 후보 등록', event: 'add_to_cart', pageType: 'product' },
        { step: '결제 완료', detail: '구매 완료', event: 'purchase', pageType: 'checkout' },
      ],
    },
  ];
}

export function UserJourney() {
  const { data, loading, error } = usePerformanceData();

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.header}>
          <Skeleton width="110px" height="18px" />
          <Skeleton width="180px" height="12px" />
        </div>
        <div className={styles.summary_grid}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} width="100%" height="58px" radius="8px" />
          ))}
        </div>
        <Skeleton width="100%" height="220px" radius="8px" />
      </section>
    );
  }

  const { userJourney } = data.rum;
  const allSessionPaths = data.rum.sessionPaths?.length ? data.rum.sessionPaths : getFallbackPaths(userJourney);
  const sessionPaths = [...allSessionPaths]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, MAX_VISIBLE_PATHS);
  const hiddenPathCount = Math.max(0, allSessionPaths.length - sessionPaths.length);
  const targetBrand = data.benchmarks.find((benchmark) => benchmark.isTarget)?.brand ?? '';
  const pageMetrics = data.pageMetrics as JourneyPageMetrics[];
  const totalSessions = userJourney[0]?.sessions ?? 0;
  const purchases = userJourney.at(-1)?.sessions ?? 0;
  const purchaseRate = calcConversionRatePercent(purchases, totalSessions);
  const dropoffPaths = allSessionPaths.filter((path) => path.outcome === 'dropoff');
  const topPath = sessionPaths[0];
  const dropoffRanking = userJourney
    .slice(0, -1)
    .map((step, index) => {
      const nextStep = userJourney[index + 1];
      const dropoff = nextStep ? calcDropoff(step.sessions, nextStep.sessions) : { dropped: 0, dropRate: 0 };

      return {
        id: `${step.step}-${index}`,
        from: SUMMARY_STEP_LABEL[step.step] ?? step.step,
        to: nextStep ? SUMMARY_STEP_LABEL[nextStep.step] ?? nextStep.step : '종료',
        sessions: step.sessions,
        dropped: dropoff.dropped,
        dropRate: dropoff.dropRate,
      };
    })
    .sort((a, b) => b.dropped - a.dropped);

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>사용자 여정</h2>
          <p className={styles.subtitle}>세션 수가 많은 대표 경로만 요약 표시</p>
        </div>
        <div className={styles.header_badge}>상위 {MAX_VISIBLE_PATHS}개 경로</div>
      </div>

      <div className={styles.summary_grid}>
        <div className={styles.summary_card}>
          <span>전체 세션</span>
          <strong>{formatCompactCount(totalSessions)}</strong>
          <em>방문 1회 = 세션 1개</em>
        </div>
        <div className={styles.summary_card}>
          <span>구매 완료</span>
          <strong>{formatCompactCount(purchases)}</strong>
          <em>구매 완료율 {purchaseRate.toFixed(1)}%</em>
        </div>
        <div className={styles.summary_card}>
          <span>대표 이탈 경로</span>
          <strong>{dropoffPaths.length}개</strong>
          <em>상품·결제 종료 패턴</em>
        </div>
        {topPath && (
          <div className={styles.summary_card}>
            <span>가장 큰 경로</span>
            <strong>{formatCompactCount(topPath.sessions)}</strong>
            <em>{topPath.name}</em>
          </div>
        )}
      </div>

      <div className={styles.content_grid}>
        <aside className={styles.aggregate_panel}>
          <div className={styles.panel_header}>
            <h3>이탈 구간 순위</h3>
            <span>세션 감소가 큰 순서</span>
          </div>

          <div className={styles.aggregate_list}>
            {dropoffRanking.map((item, index) => (
              <div key={item.id} className={styles.dropout_rank_row}>
                <div className={styles.rank_badge}>{index + 1}</div>
                <div className={styles.rank_main}>
                  <strong>{item.from} → {item.to}</strong>
                  <span>{formatCompactCount(item.sessions)} 세션 중 {formatCompactCount(item.dropped)} 이탈</span>
                </div>
                <div className={styles.rank_rate}>
                  <strong>{item.dropRate.toFixed(1)}%</strong>
                  <span>이탈</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className={styles.path_panel}>
          <div className={styles.panel_header}>
            <h3>대표 방문 경로</h3>
            <span>세션 수 상위 {MAX_VISIBLE_PATHS}개</span>
          </div>

          <div className={styles.path_list}>
            {sessionPaths.map((pattern, pathIndex) => {
              const metrics = getPathLastMetrics(pattern, pageMetrics, targetBrand);
              const readableResult = getReadableResult(pattern, metrics);
              const displaySteps = summarizeDisplaySteps(pattern.path);
              const eventFlow = pattern.path.map((step) => step.event).join(' -> ');

              return (
                <article key={pattern.id} className={styles.path_card}>
                  <div className={styles.path_card_header}>
                    <div className={styles.path_title_group}>
                      <strong>
                        {pathIndex + 1}. {pattern.name}
                      </strong>
                      <span>
                        {pattern.source} · {DEVICE_LABEL[pattern.device]} · {formatCompactCount(pattern.sessions)} 세션
                      </span>
                    </div>
                    <div
                      className={`${styles.outcome_badge} ${
                        pattern.outcome === 'purchase' ? styles.outcome_success : styles.outcome_dropoff
                      }`}
                    >
                      {OUTCOME_LABEL[pattern.outcome]}
                    </div>
                  </div>

                  <div className={styles.path_meta}>
                    <span>유입 {pattern.source}</span>
                    <span>{DEVICE_LABEL[pattern.device]}</span>
                    <span>전체의 {pattern.share.toFixed(1)}%</span>
                  </div>

                  <ol className={styles.route_flow} aria-label={`${pattern.name} 경로`}>
                    {displaySteps.map((step, index) => (
                      <li
                        key={`${pattern.id}-${step.event}-${index}`}
                        className={`${styles.route_step} ${
                          index === displaySteps.length - 1 ? styles.route_last : ''
                        } ${
                          index === displaySteps.length - 1 && pattern.outcome === 'purchase' ? styles.route_success : ''
                        }`}
                      >
                        <strong>{step.step}</strong>
                        {step.detail && <span>{step.detail}</span>}
                      </li>
                    ))}
                  </ol>

                  <div className={styles.path_footer}>
                    <p className={styles.event_trace}>수집 이벤트: {eventFlow}</p>
                    <div className={styles.path_result}>
                      <span>{readableResult.title}</span>
                      <em>{readableResult.detail}</em>
                    </div>
                  </div>
                </article>
              );
            })}

            {hiddenPathCount > 0 && (
              <div className={styles.hidden_notice}>
                그 외 {hiddenPathCount}개 경로는 세션 수가 낮아 요약에서 제외
              </div>
            )}
          </div>
        </div>
      </div>

      <p className={styles.footnote}>
        실제 연동 시 모든 개별 여정을 그대로 나열하지 않고, session_start부터 purchase 또는 exit까지의 이벤트를
        같은 패턴끼리 묶은 뒤 세션 수가 큰 경로만 표시합니다.
      </p>
    </section>
  );
}
