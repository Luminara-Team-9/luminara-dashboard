'use client';

import { useEffect, useState } from 'react';
import { fetchPerformanceReport, getMetricStatus } from '@/entities/metric';
import type { PerformanceReport, MetricKey } from '@/entities/metric';
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
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetchPerformanceReport()
      .then(setReport)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      });
  }, []);

  if (error) return <p className={styles.error}>{error}</p>;
  if (!report) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
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
            {report.benchmarks.map((brand) => (
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
