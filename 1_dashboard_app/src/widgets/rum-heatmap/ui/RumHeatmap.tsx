'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import type { RegionalData } from '@/shared/lib/types';
import styles from './RumHeatmap.module.css';

const ISP_TABS = ['전체', 'SK', 'KT', 'LG'] as const;
type IspTab = (typeof ISP_TABS)[number];

const ISPS = ['SK', 'KT', 'LG'];

// 지역을 북→남 순서로 고정
const REGION_ORDER = ['서울', '인천', '경기', '대전', '대구', '광주', '부산'];

function getCell(data: RegionalData[], region: string, isp: string) {
  return data.find((d) => d.region === region && d.isp === isp);
}

function getRegionSummary(data: RegionalData[], region: string) {
  const rows = data.filter((d) => d.region === region);
  if (!rows.length) return null;
  const avg = Math.round(rows.reduce((s, d) => s + d.avgLatency, 0) / rows.length);
  const status = rows.every((d) => d.status === 'good')
    ? 'good'
    : rows.some((d) => d.status === 'poor')
    ? 'poor'
    : 'warning';
  return { avg, status };
}

export function RumHeatmap() {
  const { data, loading, error } = usePerformanceData();
  const [isp, setIsp] = useState<IspTab>('전체');

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  const { regionalData } = data.rum;

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>지역 · 통신사 레이턴시</h2>
        {/* 실제 연동 시 Swetrix SDK로 교체 */}
        <div className={styles.tabs}>
          {ISP_TABS.map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${isp === t ? styles.tab_active : ''}`}
              onClick={() => setIsp(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th_region}>지역</th>
              {isp === '전체'
                ? ISPS.map((s) => <th key={s} className={styles.th}>{s}</th>)
                : <th className={styles.th}>{isp}</th>}
            </tr>
          </thead>
          <tbody>
            {REGION_ORDER.map((region) => (
              <tr key={region} className={styles.row}>
                <td className={styles.td_region}>{region}</td>

                {isp === '전체' ? (
                  ISPS.map((s) => {
                    const cell = getCell(regionalData, region, s);
                    if (!cell) return <td key={s} className={styles.td}>—</td>;
                    return (
                      <td key={s} className={styles.td}>
                        <span className={`${styles.pill} ${styles[cell.status]}`}>
                          {cell.avgLatency}<span className={styles.unit}>ms</span>
                        </span>
                      </td>
                    );
                  })
                ) : (
                  (() => {
                    const cell = getCell(regionalData, region, isp);
                    if (!cell) return <td className={styles.td}>—</td>;
                    return (
                      <td className={styles.td}>
                        <span className={`${styles.pill} ${styles[cell.status]}`}>
                          {cell.avgLatency}<span className={styles.unit}>ms</span>
                        </span>
                      </td>
                    );
                  })()
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.legend}>
        <span className={`${styles.legend_item} ${styles.good}`}>● 양호 (&lt;300ms)</span>
        <span className={`${styles.legend_item} ${styles.warning}`}>● 주의 (300–400ms)</span>
        <span className={`${styles.legend_item} ${styles.poor}`}>● 불량 (&gt;400ms)</span>
      </div>
    </section>
  );
}
