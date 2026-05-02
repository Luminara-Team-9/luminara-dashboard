'use client';

import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine,
} from 'recharts';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { Skeleton } from '@/shared/ui';
import type { Trends } from '@/shared/lib/types';
import styles from './PerformanceTrend.module.css';

// ── 지표 설정 ──────────────────────────────────────────────────
const METRIC_CONFIG: Record<string, { label: string; unit: string; domain: [number, number] }> = {
  lighthouse: { label: 'Lighthouse',  unit: '',   domain: [40, 100] },
  lcp:        { label: 'LCP',         unit: 's',  domain: [0, 7]   },
  tbt:        { label: 'TBT',         unit: 'ms', domain: [0, 600] },
};

const BRAND_COLORS: Record<string, string> = {
  Decathlon: '#3b82f6',
  Coupang:   '#f59e0b',
  Musinsa:   '#a78bfa',
};

// ── 날짜 포맷 ("2026-03-08" → "3/8") ─────────────────────────
function fmtDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// ── Recharts용 데이터 변환 ────────────────────────────────────
function buildChartData(trends: Trends, metricKey: string) {
  const datasets = trends.datasets.filter((d) => d.metricKey === metricKey);
  return trends.labels.map((label, i) => {
    const point: Record<string, string | number> = { date: fmtDate(label) };
    datasets.forEach((d) => { point[d.brand] = d.values[i]; });
    return point;
  });
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────
interface TooltipEntry { name: string; value: number; color: string }
interface TooltipProps  { active?: boolean; payload?: TooltipEntry[]; label?: string; unit: string }

function CustomTooltip({ active, payload, label, unit }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltip_date}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className={styles.tooltip_row}>
          <span className={styles.tooltip_dot} style={{ backgroundColor: entry.color }} />
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span style={{ color: '#e2e8f0' }}>
            {entry.value}{unit}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function PerformanceTrend() {
  const { data, loading, error } = usePerformanceData();
  const [activeMetric, setActiveMetric] = useState('lighthouse');

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.header}>
          <Skeleton width="130px" height="18px" />
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} width="72px" height="30px" radius="7px" />
            ))}
          </div>
        </div>
        <div className={styles.chart_wrap} style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flex: 1, paddingTop: 8 }}>
            {[60, 80, 55, 90, 70, 85, 65, 95, 75].map((h, i) => (
              <Skeleton key={i} width="100%" height={`${h}%`} radius="4px 4px 0 0" />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, paddingTop: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Skeleton width="24px" height="3px" radius="2px" />
                <Skeleton width="60px" height="12px" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const { trends } = data;
  const availableMetrics = Object.keys(METRIC_CONFIG).filter((key) =>
    trends.datasets.some((d) => d.metricKey === key),
  );
  const config      = METRIC_CONFIG[activeMetric];
  const chartData   = buildChartData(trends, activeMetric);
  const activeBrands = [...new Set(
    trends.datasets.filter((d) => d.metricKey === activeMetric).map((d) => d.brand),
  )];

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>성능 트렌드</h2>
        <div className={styles.tabs}>
          {availableMetrics.map((key) => (
            <button
              key={key}
              className={`${styles.tab} ${activeMetric === key ? styles.tab_active : ''}`}
              onClick={() => setActiveMetric(key)}
            >
              {METRIC_CONFIG[key].label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.chart_wrap}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 12 }}
              axisLine={{ stroke: '#1e293b' }}
              tickLine={false}
            />
            <YAxis
              domain={config.domain}
              tick={{ fill: '#64748b', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}${config.unit}`}
              width={52}
            />

            <Tooltip
              content={(props) => (
                <CustomTooltip
                  active={props.active}
                  payload={props.payload as unknown as TooltipEntry[]}
                  label={props.label as string}
                  unit={config.unit}
                />
              )}
            />

            <Legend
              wrapperStyle={{ fontSize: '13px', color: '#94a3b8', paddingTop: '12px' }}
            />

            {/* 릴리스 마커 */}
            {trends.releases.map((r) => (
              <ReferenceLine
                key={r.version}
                x={fmtDate(r.date)}
                stroke="#334155"
                strokeDasharray="4 3"
                label={{
                  value: r.version,
                  position: 'top',
                  fill: '#475569',
                  fontSize: 10,
                }}
              />
            ))}

            {/* 브랜드별 라인 */}
            {activeBrands.map((brand) => (
              <Line
                key={brand}
                type="monotone"
                dataKey={brand}
                stroke={BRAND_COLORS[brand] ?? '#94a3b8'}
                strokeWidth={brand === 'Decathlon' ? 2.5 : 1.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
