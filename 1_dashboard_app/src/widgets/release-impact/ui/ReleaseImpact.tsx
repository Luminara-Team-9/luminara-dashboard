'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { Skeleton } from '@/shared/ui';
import type { Trends, TrendDataset } from '@/shared/lib/types';
import styles from './ReleaseImpact.module.css';

const METRIC_LABEL: Record<string, { label: string; unit: string; higherIsBetter?: boolean }> = {
  lighthouse: { label: 'Lighthouse', unit: 'pt', higherIsBetter: true },
  lcp:        { label: 'LCP',        unit: 's'  },
  tbt:        { label: 'TBT',        unit: 'ms' },
};

// ── 릴리즈 전후 delta 자동 계산 ──────────────────────────────
function calcDeltas(trends: Trends, releaseDate: string) {
  const relIdx = trends.labels.indexOf(releaseDate);
  if (relIdx < 1) return [];          // 이전 포인트 없으면 스킵

  const beforeIdx = relIdx - 1;
  const afterIdx  = relIdx;

  const results: {
    brand: string; metricKey: string;
    before: number; after: number; delta: number; pct: number;
  }[] = [];

  trends.datasets.forEach((ds: TrendDataset) => {
    const before = ds.values[beforeIdx];
    const after  = ds.values[afterIdx];
    if (before == null || after == null) return;
    const delta = after - before;
    const pct   = Math.round((delta / before) * 1000) / 10;
    results.push({ brand: ds.brand, metricKey: ds.metricKey, before, after, delta, pct });
  });

  return results;
}

// ── 개별 델타 카드 ────────────────────────────────────────────
function DeltaCard({ brand, metricKey, before, after, delta, pct }: {
  brand: string; metricKey: string;
  before: number; after: number; delta: number; pct: number;
}) {
  const cfg          = METRIC_LABEL[metricKey] ?? { label: metricKey, unit: '' };
  const higherBetter = cfg.higherIsBetter ?? false;
  const improved     = higherBetter ? delta > 0 : delta < 0;
  const neutral      = delta === 0;

  const color = neutral ? '#64748b' : improved ? '#10b981' : '#ef4444';
  const sign  = delta > 0 ? '+' : '';

  return (
    <div className={styles.delta_card}>
      <div className={styles.delta_top}>
        <span className={styles.delta_brand}>{brand}</span>
        <span className={styles.delta_metric}>{cfg.label}</span>
      </div>
      <div className={styles.delta_values}>
        <span className={styles.delta_before}>{before}{cfg.unit}</span>
        <span className={styles.delta_arrow}>→</span>
        <span className={styles.delta_after}>{after}{cfg.unit}</span>
      </div>
      <div className={styles.delta_change} style={{ color }}>
        {neutral ? '변화 없음' : `${sign}${delta}${cfg.unit} (${sign}${pct}%)`}
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function ReleaseImpact() {
  const { data, loading, error } = usePerformanceData();
  const [activeRelease, setActiveRelease] = useState(0);

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.header}>
          <Skeleton width="160px" height="18px" />
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map(i => <Skeleton key={i} width="80px" height="28px" radius="7px" />)}
          </div>
        </div>
        <div className={styles.grid}>
          {[0,1,2,3,4,5].map(i => (
            <div key={i} style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Skeleton width="70px" height="12px" />
                <Skeleton width="50px" height="20px" radius="5px" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Skeleton width="50px" height="14px" />
                <Skeleton width="16px" height="12px" />
                <Skeleton width="50px" height="14px" />
              </div>
              <Skeleton width="80px" height="14px" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const { trends } = data;
  const release    = trends.releases[activeRelease];
  const deltas     = release ? calcDeltas(trends, release.date) : [];

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.header_left}>
          <h2 className={styles.title}>릴리즈 임팩트</h2>
          <span className={styles.subtitle}>배포 전후 지표 변화</span>
        </div>
        <div className={styles.tabs}>
          {trends.releases.map((r, i) => (
            <button
              key={r.version}
              className={`${styles.tab} ${activeRelease === i ? styles.tab_active : ''}`}
              onClick={() => setActiveRelease(i)}
            >
              {r.version}
            </button>
          ))}
        </div>
      </div>

      {release && (
        <div className={styles.release_info}>
          <span className={styles.release_date}>{release.date}</span>
          <span className={styles.release_desc}>{release.description}</span>
        </div>
      )}

      <div className={styles.grid}>
        {deltas.length > 0
          ? deltas.map(d => (
              <DeltaCard key={`${d.brand}-${d.metricKey}`} {...d} />
            ))
          : <p className={styles.empty}>해당 릴리즈의 비교 데이터가 없습니다.</p>
        }
      </div>
    </section>
  );
}
