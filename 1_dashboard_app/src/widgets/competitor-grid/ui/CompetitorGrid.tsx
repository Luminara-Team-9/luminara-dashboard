'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { getMetricStatus } from '@/entities/metric';
import { Skeleton } from '@/shared/ui';
import type { MetricKey, PageType, BenchmarkEntry, PageBenchmarkEntry } from '@/shared/lib/types';
import styles from './CompetitorGrid.module.css';

const METRIC_COLS: { key: MetricKey; label: string }[] = [
  { key: 'lcp',        label: 'LCP' },
  { key: 'cls',        label: 'CLS' },
  { key: 'inp',        label: 'INP' },
  { key: 'tbt',        label: 'TBT' },
  { key: 'fcp',        label: 'FCP' },
  { key: 'speedIndex', label: 'Speed Index' },
  { key: 'assetSize',  label: 'Asset Size' },
];

const PAGE_TABS: { key: 'all' | PageType; label: string }[] = [
  { key: 'all',      label: '전체 평균' },
  { key: 'main',     label: '메인' },
  { key: 'product',  label: '상품' },
  { key: 'checkout', label: '결제' },
];

// ── SEO 점수 상태 ─────────────────────────────────────────────
function seoStatus(score: number): string {
  if (score >= 90) return 'pass';
  if (score >= 70) return 'warning';
  return 'fail';
}

// ── 행 렌더 (집계 / 페이지별 공통) ───────────────────────────
function BrandRow({ entry, isTarget }: {
  entry: BenchmarkEntry | PageBenchmarkEntry;
  isTarget: boolean;
}) {
  const lhStatus = getMetricStatus(entry.scores.lighthouse, entry.scores.target_lighthouse, true);
  const seoBadge = seoStatus(entry.scores.seo);

  return (
    <tr className={`${styles.row} ${isTarget ? styles.row_target : ''}`}>
      <td className={styles.td_brand}>
        {isTarget && <span className={styles.star}>★</span>}
        <span>{entry.brand}</span>
        {isTarget && <span className={styles.our_label}>우리 브랜드</span>}
      </td>

      {/* Lighthouse */}
      <td className={styles.td}>
        <span className={`${styles.pill} ${styles[lhStatus]}`}>
          {entry.scores.lighthouse}
        </span>
      </td>

      {/* SEO */}
      <td className={styles.td}>
        <span className={`${styles.pill} ${styles[seoBadge]}`}>
          {entry.scores.seo}
        </span>
      </td>

      {/* 개별 지표 */}
      {METRIC_COLS.map((col) => {
        const metric = entry.metrics[col.key];
        const status = getMetricStatus(metric.value, metric.target);
        return (
          <td key={col.key} className={styles.td}>
            <span className={`${styles.pill} ${styles[status]}`}>
              {metric.value}
              <span className={styles.unit}>{metric.unit}</span>
            </span>
          </td>
        );
      })}
    </tr>
  );
}

// ── 로딩 스켈레톤 ─────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <section className={styles.wrapper}>
      <Skeleton width="160px" height="18px" />
      <div className={styles.scroll} style={{ borderRadius: 16, overflow: 'hidden' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid #1a2234' }}>
            <Skeleton width="120px" height="16px" />
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
              <Skeleton key={j} width="72px" height="24px" radius="6px" />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function CompetitorGrid() {
  const { data, loading, error } = usePerformanceData();
  const [activePage, setActivePage] = useState<'all' | PageType>('all');

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) return <LoadingSkeleton />;

  // 집계 뷰 vs 페이지별 뷰
  const rows: { entry: BenchmarkEntry | PageBenchmarkEntry; isTarget: boolean }[] =
    activePage === 'all'
      ? data.benchmarks.map(b => ({ entry: b, isTarget: b.isTarget }))
      : data.pageMetrics
          .filter(p => p.page === activePage)
          .map(p => ({
            entry: p,
            isTarget: p.brand === (data.benchmarks.find(b => b.isTarget)?.brand ?? ''),
          }));

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>경쟁사 벤치마킹</h2>
        <div className={styles.tabs}>
          {PAGE_TABS.map(tab => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activePage === tab.key ? styles.tab_active : ''}`}
              onClick={() => setActivePage(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th_brand}>브랜드</th>
              <th className={styles.th}>Lighthouse</th>
              <th className={`${styles.th} ${styles.th_seo}`}>SEO</th>
              {METRIC_COLS.map((col) => (
                <th key={col.key} className={styles.th}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0
              ? rows.map(({ entry, isTarget }) => (
                  <BrandRow key={`${entry.brand}-${activePage}`} entry={entry} isTarget={isTarget} />
                ))
              : (
                <tr>
                  <td colSpan={10} className={styles.empty_row}>
                    해당 페이지 데이터가 없습니다
                  </td>
                </tr>
              )
            }
          </tbody>
        </table>
      </div>
    </section>
  );
}
