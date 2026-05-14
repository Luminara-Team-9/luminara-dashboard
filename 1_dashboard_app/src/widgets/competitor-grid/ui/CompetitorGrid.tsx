'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcRank, round } from '@/shared/lib/estimationFormulas';
import { Skeleton } from '@/shared/ui';
import type { BenchmarkEntry, MetricKey, PageBenchmarkEntry, PageType } from '@/shared/lib/types';
import styles from './CompetitorGrid.module.css';

type RowEntry = {
  entry: BenchmarkEntry | PageBenchmarkEntry;
  isTarget: boolean;
  pageLabel: string;
};

type RankKey = MetricKey | 'lighthouse' | 'seo';
type Tone = 'good' | 'warning' | 'fail';

const PAGE_TABS: { key: 'all' | PageType; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'main', label: '메인' },
  { key: 'product', label: '상품' },
  { key: 'checkout', label: '결제' },
];

const PAGE_LABELS: Record<'all' | PageType, string> = {
  all: '전체 평균',
  main: '메인',
  product: '상품',
  checkout: '결제',
};

const PAGE_COPY: Record<'all' | PageType, string> = {
  all: '전체 평균 기준',
  main: '메인 페이지 기준',
  product: '상품 상세 기준',
  checkout: '결제 페이지 기준',
};

const PLATFORM_BRANDS = new Set(['Coupang', 'SSG.com', 'Naver Shopping']);

const METRIC_LABELS: Record<RankKey, { title: string; short: string; unit?: string; higherIsBetter: boolean }> = {
  lighthouse: { title: '종합 성능', short: 'Lighthouse', higherIsBetter: true },
  lcp: { title: '상품 탐색 시작 속도', short: 'LCP', unit: 's', higherIsBetter: false },
  speedIndex: { title: '화면 완성 속도', short: 'Speed Index', unit: 's', higherIsBetter: false },
  inp: { title: '구매 조작 반응', short: 'INP', unit: 'ms', higherIsBetter: false },
  tbt: { title: '스크립트 실행 부담', short: 'TBT', unit: 'ms', higherIsBetter: false },
  cls: { title: '화면 안정성', short: 'CLS', higherIsBetter: false },
  fcp: { title: '첫 표시 속도', short: 'FCP', unit: 's', higherIsBetter: false },
  assetSize: { title: '리소스 크기', short: 'Asset', unit: 'KB', higherIsBetter: false },
  seo: { title: '검색 노출 준비도', short: 'SEO', higherIsBetter: true },
};

const MAIN_METRICS: RankKey[] = ['lighthouse', 'lcp', 'inp', 'cls', 'assetSize', 'seo'];
const DETAIL_METRICS: RankKey[] = ['lighthouse', 'lcp', 'fcp', 'speedIndex', 'inp', 'tbt', 'cls', 'assetSize', 'seo'];

function getGroup(brand: string): 'sports-brand' | 'commerce-platform' {
  return PLATFORM_BRANDS.has(brand) ? 'commerce-platform' : 'sports-brand';
}

function getMetricValue(entry: BenchmarkEntry | PageBenchmarkEntry, key: RankKey): number {
  if (key === 'lighthouse') return entry.scores.lighthouse;
  if (key === 'seo') return entry.scores.seo;
  return entry.metrics[key].value;
}

function getMetricUnit(entry: BenchmarkEntry | PageBenchmarkEntry, key: RankKey): string {
  if (key === 'lighthouse' || key === 'seo') return '점';
  const unit = entry.metrics[key].unit;
  return unit === 'score' ? '' : unit;
}

function formatMetric(entry: BenchmarkEntry | PageBenchmarkEntry, key: RankKey): string {
  const value = getMetricValue(entry, key);
  return `${value}${getMetricUnit(entry, key)}`;
}

function getRank(rows: RowEntry[], key: RankKey, brand: string) {
  const result = calcRank(
    rows,
    (row) => getMetricValue(row.entry, key),
    (row) => row.entry.brand === brand,
    METRIC_LABELS[key].higherIsBetter,
  );
  return { rank: result.rank ?? 0, total: result.total };
}

function getRankTone(rank: number, total: number): Tone {
  if (rank <= Math.max(1, Math.floor(total / 3))) return 'good';
  if (rank <= Math.ceil((total / 3) * 2)) return 'warning';
  return 'fail';
}

function getRankText(rank: number, total: number): string {
  return `경쟁사 ${total}개 중 ${rank}위`;
}

function getShortRankText(rank: number, total: number): string {
  return `${total}개 중 ${rank}위`;
}

function getAverage(rows: RowEntry[], key: RankKey): number {
  const sum = rows.reduce((acc, row) => acc + getMetricValue(row.entry, key), 0);
  return round(sum / rows.length, 1);
}

function getDifferenceText(target: BenchmarkEntry | PageBenchmarkEntry, rows: RowEntry[], key: RankKey): string {
  const avg = getAverage(rows, key);
  const value = getMetricValue(target, key);
  const diff = Math.round((value - avg) * 10) / 10;
  const unit = getMetricUnit(target, key);
  const higherIsBetter = METRIC_LABELS[key].higherIsBetter;
  const isBetter = higherIsBetter ? diff >= 0 : diff <= 0;
  const abs = Math.abs(diff);

  if (abs === 0) return '경쟁사 평균과 동일';
  return `평균보다 ${abs}${unit} ${isBetter ? '좋음' : '나쁨'}`;
}

function getSummaryItems(rows: RowEntry[], target: BenchmarkEntry | PageBenchmarkEntry) {
  return MAIN_METRICS.map((key) => {
    const { rank, total } = getRank(rows, key, target.brand);
    const tone = getRankTone(rank, total);
    return {
      key,
      title: METRIC_LABELS[key].title,
      short: METRIC_LABELS[key].short,
      value: formatMetric(target, key),
      rank,
      total,
      tone,
      diff: getDifferenceText(target, rows, key),
    };
  });
}

function getStrengths(items: ReturnType<typeof getSummaryItems>) {
  return [...items]
    .filter((item) => item.tone !== 'fail')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 2);
}

function getWeaknesses(items: ReturnType<typeof getSummaryItems>) {
  return [...items]
    .filter((item) => item.tone !== 'good')
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 3);
}

function LoadingSkeleton() {
  return (
    <section className={styles.wrapper}>
      <Skeleton width="160px" height="18px" />
      <div className={styles.summary_grid}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} width="100%" height="96px" radius="10px" />
        ))}
      </div>
      <Skeleton width="100%" height="320px" radius="10px" />
    </section>
  );
}

export function CompetitorGrid() {
  const { data, loading, error } = usePerformanceData();
  const [activePage, setActivePage] = useState<'all' | PageType>('all');
  const [showRaw, setShowRaw] = useState(false);

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) return <LoadingSkeleton />;

  const targetBrand = data.benchmarks.find((benchmark) => benchmark.isTarget)?.brand ?? 'Decathlon';
  const rows: RowEntry[] =
    activePage === 'all'
      ? data.benchmarks
          .filter((benchmark) => getGroup(benchmark.brand) === 'sports-brand')
          .map((benchmark) => ({
            entry: benchmark,
            isTarget: benchmark.isTarget,
            pageLabel: PAGE_LABELS.all,
          }))
      : data.pageMetrics
          .filter((pageMetric) => pageMetric.page === activePage && getGroup(pageMetric.brand) === 'sports-brand')
          .map((pageMetric) => ({
            entry: pageMetric,
            isTarget: pageMetric.brand === targetBrand,
            pageLabel: PAGE_LABELS[pageMetric.page],
          }));

  const targetRow = rows.find((row) => row.isTarget);
  if (!targetRow) return null;

  const target = targetRow.entry;
  const summaryItems = getSummaryItems(rows, target);
  const strengths = getStrengths(summaryItems);
  const weaknesses = getWeaknesses(summaryItems);
  const priority = weaknesses[0] ?? summaryItems[0];
  const overall = summaryItems.find((item) => item.key === 'lighthouse');

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>경쟁사 벤치마킹</h2>
          <span className={styles.subtitle}>
            공개 URL에서 측정 가능한 성능·리소스·기술 SEO만 비교합니다.
          </span>
        </div>
        <div className={styles.tabs}>
          {PAGE_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${activePage === tab.key ? styles.tab_active : ''}`}
              onClick={() => setActivePage(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.summary_grid}>
        <article className={styles.hero_card}>
          <span>{PAGE_COPY[activePage]}</span>
          <strong>Decathlon은 {overall ? getRankText(overall.rank, overall.total) : '-'}입니다.</strong>
          <p>
            강점은 {strengths.map((item) => item.title).join(', ') || '확인 필요'}이고,
            우선 확인할 약점은 {priority.title}입니다.
          </p>
        </article>

        <article className={styles.list_card}>
          <span className={styles.card_label}>강점</span>
          {strengths.map((item) => (
            <div key={item.key} className={styles.mini_row}>
              <i className={`${styles.dot} ${styles[`dot_${item.tone}`]}`} />
              <strong>{item.title}</strong>
              <em>{getRankText(item.rank, item.total)} · {item.value}</em>
            </div>
          ))}
        </article>

        <article className={styles.list_card}>
          <span className={styles.card_label}>우선 개선</span>
          {weaknesses.map((item) => (
            <div key={item.key} className={styles.mini_row}>
              <i className={`${styles.dot} ${styles[`dot_${item.tone}`]}`} />
              <strong>{item.title}</strong>
              <em>{getRankText(item.rank, item.total)} · {item.value}</em>
            </div>
          ))}
        </article>
      </div>

      <div className={styles.metric_grid}>
        {summaryItems.map((item) => (
          <article key={item.key} className={styles.metric_card}>
            <div className={styles.metric_top}>
              <span>{item.title}</span>
              <i className={`${styles.dot} ${styles[`dot_${item.tone}`]}`} />
            </div>
            <div className={styles.metric_value_row}>
              <strong>{item.value}</strong>
              <em>{getShortRankText(item.rank, item.total)}</em>
            </div>
            <p>{item.diff}</p>
          </article>
        ))}
      </div>

      <div className={styles.section_header}>
        <div>
          <h3>브랜드별 비교</h3>
          <span>핵심 지표만 먼저 보여줍니다. 색 점은 상대 위치를 뜻합니다.</span>
        </div>
        <button type="button" className={styles.raw_toggle} onClick={() => setShowRaw((prev) => !prev)}>
          {showRaw ? '상세 원자료 숨기기' : '상세 원자료 보기'}
        </button>
      </div>

      <div className={styles.compare_grid}>
        {rows.map(({ entry, isTarget }) => (
          <article key={entry.brand} className={`${styles.brand_card} ${isTarget ? styles.brand_card_target : ''}`}>
            <div className={styles.brand_header}>
              <strong>{entry.brand}</strong>
              {isTarget && <span>분석 대상</span>}
            </div>
            <div className={styles.brand_metrics}>
              {MAIN_METRICS.map((key) => {
                const { rank, total } = getRank(rows, key, entry.brand);
                const tone = getRankTone(rank, total);
                return (
                  <div key={key} className={styles.brand_metric}>
                    <span>
                      <i className={`${styles.dot} ${styles[`dot_${tone}`]}`} />
                      {METRIC_LABELS[key].title}
                    </span>
                    <strong>{formatMetric(entry, key)}</strong>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {showRaw && (
        <div className={styles.raw_panel}>
          <div className={styles.raw_grid}>
            {rows.map(({ entry }) => (
              <article key={`raw-${entry.brand}`} className={styles.raw_card}>
                <strong>{entry.brand}</strong>
                <div>
                  {DETAIL_METRICS.map((key) => (
                    <span key={key}>
                      {METRIC_LABELS[key].short}: {formatMetric(entry, key)}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      <p className={styles.footnote}>
        Traffic, Conversion Rate, 매출, 상품 수, 리뷰 긍·부정률은 무료·공개·재현 가능한 방식으로 안정 수집하기 어려워
        메인 비교 지표에서 제외했습니다.
      </p>
    </section>
  );
}
