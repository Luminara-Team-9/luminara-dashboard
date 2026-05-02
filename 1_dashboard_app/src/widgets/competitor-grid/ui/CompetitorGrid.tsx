'use client';

import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { getMetricStatus } from '@/entities/metric';
import { Skeleton } from '@/shared/ui';
import type { MetricKey } from '@/entities/metric';
import styles from './CompetitorGrid.module.css';

const METRIC_COLS: { key: MetricKey; label: string }[] = [
  { key: 'lcp',        label: 'LCP' },
  { key: 'cls',        label: 'CLS' },
  { key: 'tbt',        label: 'TBT' },
  { key: 'fcp',        label: 'FCP' },
  { key: 'speedIndex', label: 'Speed Index' },
  { key: 'assetSize',  label: 'Asset Size' },
];

export function CompetitorGrid() {
  const { data, loading, error } = usePerformanceData();

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <Skeleton width="160px" height="18px" />
        <div className={styles.scroll} style={{ borderRadius: 16, overflow: 'hidden' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid #1a2234' }}>
              <Skeleton width="120px" height="16px" />
              {[0, 1, 2, 3, 4, 5, 6].map((j) => (
                <Skeleton key={j} width="72px" height="24px" radius="6px" />
              ))}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.wrapper}>
      <h2 className={styles.title}>경쟁사 벤치마킹</h2>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th_brand}>브랜드</th>
              <th className={styles.th}>Lighthouse</th>
              {METRIC_COLS.map((col) => (
                <th key={col.key} className={styles.th}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.benchmarks.map((brand) => (
              <tr
                key={brand.brand}
                className={`${styles.row} ${brand.isTarget ? styles.row_target : ''}`}
              >
                <td className={styles.td_brand}>
                  {brand.isTarget && <span className={styles.star}>★</span>}
                  <span>{brand.brand}</span>
                  {brand.isTarget && (
                    <span className={styles.our_label}>우리 브랜드</span>
                  )}
                </td>

                <td className={styles.td}>
                  <span
                    className={`${styles.pill} ${
                      styles[getMetricStatus(
                        brand.scores.lighthouse,
                        brand.scores.target_lighthouse,
                        true,
                      )]
                    }`}
                  >
                    {brand.scores.lighthouse}
                  </span>
                </td>

                {METRIC_COLS.map((col) => {
                  const metric = brand.metrics[col.key];
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
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
