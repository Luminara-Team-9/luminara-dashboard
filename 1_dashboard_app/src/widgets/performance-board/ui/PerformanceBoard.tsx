'use client';

import { useEffect, useState } from 'react';
import {
  fetchPerformanceReport,
  LighthouseScoreBadge,
  MetricScoreCard,
} from '@/entities/metric';
import type { BenchmarkData, MetricKey, PerformanceReport } from '@/entities/metric';
import styles from './PerformanceBoard.module.css';

const METRIC_ORDER: MetricKey[] = ['lcp', 'fcp', 'cls', 'tbt', 'speedIndex', 'assetSize'];

function BrandPanel({ data }: { data: BenchmarkData }) {
  return (
    <section className={styles.panel}>
      <LighthouseScoreBadge
        brand={data.brand}
        scores={data.scores}
        isTarget={data.isTarget}
      />
      <div className={styles.metric_grid}>
        {METRIC_ORDER.map((key) => (
          <MetricScoreCard key={key} metric={data.metrics[key]} />
        ))}
      </div>
    </section>
  );
}

export function PerformanceBoard() {
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPerformanceReport()
      .then(setReport)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      });
  }, []);

  if (error) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!report) {
    return (
      <div className={styles.loading_wrapper}>
        <div className={styles.spinner} />
        <p>성능 데이터 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className={styles.board}>
      <p className={styles.timestamp}>
        측정 기준:{' '}
        {new Date(report.timestamp).toLocaleString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
      <div className={styles.panels}>
        {report.benchmarks.map((data) => (
          <BrandPanel key={data.brand} data={data} />
        ))}
      </div>
    </div>
  );
}
