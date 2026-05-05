'use client';

import { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine,
} from 'recharts';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { WPO_COEFFICIENTS } from '@/shared/lib/cvr';
import { Skeleton } from '@/shared/ui';
import type { Trends, TrendDataset, BenchmarkEntry, MetricKey } from '@/shared/lib/types';
import styles from './PerformanceTrend.module.css';

// ── 지표 설정 (차트 + 델타 카드 공통) ─────────────────────────
const METRIC_DEFS: Record<string, {
  label: string; unit: string; domain: [number, number];
  target: number; higherIsBetter: boolean; targetLabel: string;
}> = {
  lighthouse: { label: 'Lighthouse', unit: 'pt',  domain: [40, 100], target: 90,  higherIsBetter: true,  targetLabel: '≥ 90'    },
  lcp:        { label: 'LCP',        unit: 's',   domain: [0, 7],    target: 2.5, higherIsBetter: false, targetLabel: '≤ 2.5s'  },
  tbt:        { label: 'TBT',        unit: 'ms',  domain: [0, 600],  target: 200, higherIsBetter: false, targetLabel: '≤ 200ms' },
  inp:        { label: 'INP',        unit: 'ms',  domain: [0, 400],  target: 200, higherIsBetter: false, targetLabel: '≤ 200ms' },
};

const BRAND_COLORS: Record<string, string> = {
  Decathlon:        '#3b82f6',
  Coupang:          '#f59e0b',
  'Naver Shopping': '#10b981',
  'SSG.com':        '#a78bfa',
  'Nike Korea':     '#f43f5e',
};

// ── CVR 잠재량 라인 (이중 Y축) ───────────────────────────────
const CVR_LINE_KEY = 'CVR 잠재량(%)';
const CVR_CALC: Record<string, (v: number) => number> = {
  lcp: (v) => Math.max(0, Math.round((v - 2.5) * WPO_COEFFICIENTS.LCP_PER_SECOND * 10) / 10),
  inp: (v) => Math.max(0, Math.round(((v - 200) / 100) * WPO_COEFFICIENTS.INP_PER_100MS * 10) / 10),
};

// ── 경쟁사 평균 계산 ──────────────────────────────────────────
function getCompetitorAvg(benchmarks: BenchmarkEntry[], metricKey: string): number | null {
  const competitors = benchmarks.filter(b => !b.isTarget);
  if (!competitors.length) return null;

  if (metricKey === 'lighthouse') {
    const avg = competitors.reduce((s, b) => s + b.scores.lighthouse, 0) / competitors.length;
    return Math.round(avg * 10) / 10;
  }

  const vals = competitors
    .map(b => b.metrics[metricKey as MetricKey]?.value)
    .filter((v): v is number => v != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10;
}

// ── 날짜 포맷 ("2026-03-08" → "3/8") ─────────────────────────
function fmtDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

// ── Recharts용 데이터 변환 ────────────────────────────────────
function buildChartData(trends: Trends, metricKey: string) {
  const datasets    = trends.datasets.filter((d) => d.metricKey === metricKey);
  const decathlonDs = datasets.find((d) => d.brand === 'Decathlon');
  const cvrFn       = CVR_CALC[metricKey];

  return trends.labels.map((label, i) => {
    const point: Record<string, string | number> = { date: fmtDate(label) };
    datasets.forEach((d) => { point[d.brand] = d.values[i]; });
    if (cvrFn && decathlonDs) {
      point[CVR_LINE_KEY] = cvrFn(decathlonDs.values[i]);
    }
    return point;
  });
}

// ── 특정 날짜의 Decathlon 스냅샷 ─────────────────────────────
function getDecathlonSnapshot(trends: Trends, date: string): Record<string, number> | null {
  const idx = trends.labels.indexOf(date);
  if (idx < 0) return null;
  const result: Record<string, number> = {};
  trends.datasets
    .filter((ds: TrendDataset) => ds.brand === 'Decathlon')
    .forEach((ds: TrendDataset) => { result[ds.metricKey] = ds.values[idx]; });
  return Object.keys(result).length > 0 ? result : null;
}

// ── 릴리즈 전후 delta 계산 (Decathlon 전용) ──────────────────
function calcDeltas(trends: Trends, releaseDate: string) {
  const relIdx = trends.labels.indexOf(releaseDate);
  if (relIdx < 1) return [];

  const results: {
    metricKey: string;
    before: number; after: number; delta: number; pct: number;
  }[] = [];

  trends.datasets
    .filter((ds: TrendDataset) => ds.brand === 'Decathlon')
    .forEach((ds: TrendDataset) => {
      const before = ds.values[relIdx - 1];
      const after  = ds.values[relIdx];
      if (before == null || after == null) return;
      const delta = Math.round((after - before) * 100) / 100;
      const pct   = Math.round((delta / before) * 1000) / 10;
      results.push({ metricKey: ds.metricKey, before, after, delta, pct });
    });

  return results;
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
            {entry.name === CVR_LINE_KEY ? `+${entry.value}%` : `${entry.value}${unit}`}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── 델타 카드 ─────────────────────────────────────────────────
function DeltaCard({ metricKey, before, after, delta, pct }: {
  metricKey: string;
  before: number; after: number; delta: number; pct: number;
}) {
  const cfg = METRIC_DEFS[metricKey];
  if (!cfg) return null;

  const improved   = cfg.higherIsBetter ? delta > 0 : delta < 0;
  const neutral    = delta === 0;
  const deltaColor = neutral ? '#64748b' : improved ? '#10b981' : '#ef4444';
  const sign       = delta > 0 ? '+' : '';

  const passAfter = cfg.higherIsBetter ? after >= cfg.target : after <= cfg.target;

  return (
    <div className={styles.delta_card}>
      <div className={styles.delta_card_top}>
        <span className={styles.delta_metric_name}>{cfg.label}</span>
        <span className={styles.delta_target}>{cfg.targetLabel}</span>
      </div>
      <div className={styles.delta_values}>
        <span className={styles.delta_before}>{before}{cfg.unit}</span>
        <span className={styles.delta_arrow}>→</span>
        <span className={`${styles.delta_after} ${passAfter ? styles.pass : styles.fail}`}>
          {after}{cfg.unit}
        </span>
      </div>
      <div className={styles.delta_footer}>
        <span className={styles.delta_change} style={{ color: deltaColor }}>
          {neutral ? '변화 없음' : `${sign}${delta}${cfg.unit} (${sign}${pct}%)`}
        </span>
        <span className={`${styles.delta_status} ${passAfter ? styles.status_pass : styles.status_fail}`}>
          {passAfter ? '✓ 달성' : '✗ 미달'}
        </span>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function PerformanceTrend() {
  const { data, loading, error } = usePerformanceData();
  const [activeMetric, setActiveMetric] = useState('lighthouse');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
        </div>
      </section>
    );
  }

  const { trends } = data;
  const availableMetrics = Object.keys(METRIC_DEFS).filter((key) =>
    trends.datasets.some((d) => d.metricKey === key),
  );
  const config       = METRIC_DEFS[activeMetric];
  const chartData    = buildChartData(trends, activeMetric);
  const activeBrands = ['Decathlon'].filter(brand =>
    trends.datasets.some(d => d.metricKey === activeMetric && d.brand === brand),
  );
  const competitorAvg = getCompetitorAvg(data.benchmarks, activeMetric);

  const showCvr = activeMetric in CVR_CALC;
  const cvrMax  = showCvr
    ? Math.ceil(Math.max(...chartData.map((d) => (d[CVR_LINE_KEY] as number) ?? 0)) * 1.5 * 10) / 10
    : 0;

  // ── 클릭된 날짜 기반 계산 ──
  const selectedReleaseInfo = selectedDate
    ? trends.releases.find((r) => r.date === selectedDate)
    : null;

  const snapshot = selectedDate ? getDecathlonSnapshot(trends, selectedDate) : null;

  const pointDeltas = selectedDate ? calcDeltas(trends, selectedDate) : [];

  return (
    <section className={styles.wrapper}>
      {/* ── 헤더 ── */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>성능 트렌드</h2>
          <span className={styles.click_hint}>
            {showCvr ? 'CVR 잠재량 상관관계 포함 · 클릭 시 상세 확인' : '그래프 클릭 시 릴리즈 내역과 지표 변화 확인'}
          </span>
        </div>
        <div className={styles.tabs}>
          {availableMetrics.map((key) => (
            <button
              key={key}
              className={`${styles.tab} ${activeMetric === key ? styles.tab_active : ''}`}
              onClick={() => setActiveMetric(key)}
            >
              {METRIC_DEFS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 차트 ── */}
      <div className={styles.chart_wrap}>
        <div className={styles.chart_inner}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: showCvr ? 4 : 16, left: 0, bottom: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={(payload) => {
                if (!payload?.activeLabel) return;
                const origDate = trends.labels.find((l) => fmtDate(l) === payload.activeLabel);
                if (!origDate) { setSelectedDate(null); return; }
                setSelectedDate((prev) => (prev === origDate ? null : origDate));
              }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="#1e2d45" vertical={false} />

              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: '#1e293b' }}
                tickLine={false}
              />

              {/* 좌측 Y축: 성능 지표 */}
              <YAxis
                yAxisId="left"
                domain={config.domain}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}${config.unit}`}
                width={48}
              />

              {/* 우측 Y축: CVR 잠재량 (LCP·INP만) */}
              {showCvr && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, cvrMax]}
                  tick={{ fill: '#10b981', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `+${v}%`}
                  width={44}
                />
              )}

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

              <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8', paddingTop: '8px' }} />

              {config.target !== undefined && (
                <ReferenceLine
                  yAxisId="left"
                  y={config.target}
                  stroke="#22c55e"
                  strokeDasharray="5 3"
                  strokeOpacity={0.6}
                  label={{ value: '목표', position: 'insideTopRight', fill: '#22c55e', fontSize: 10 }}
                />
              )}

              {competitorAvg !== null && (
                <ReferenceLine
                  yAxisId="left"
                  y={competitorAvg}
                  stroke="#f59e0b"
                  strokeDasharray="3 4"
                  strokeOpacity={0.7}
                  label={{
                    value: `업계 평균 ${competitorAvg}${config.unit}`,
                    position: 'insideBottomRight',
                    fill: '#f59e0b',
                    fontSize: 10,
                  }}
                />
              )}

              {trends.releases.map((r) => {
                const isSelected = selectedDate === r.date;
                return (
                  <ReferenceLine
                    key={r.version}
                    yAxisId="left"
                    x={fmtDate(r.date)}
                    stroke={isSelected ? '#3b82f6' : '#334155'}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeDasharray={isSelected ? undefined : '4 3'}
                    label={{
                      value: r.version,
                      position: 'top',
                      fill: isSelected ? '#60a5fa' : '#475569',
                      fontSize: 10,
                    }}
                  />
                );
              })}

              {activeBrands.map((brand) => {
                const color = BRAND_COLORS[brand] ?? '#94a3b8';
                return (
                  <Line
                    key={brand}
                    yAxisId="left"
                    type="monotone"
                    dataKey={brand}
                    stroke={color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: color, fill: '#0f172a' }}
                    isAnimationActive={false}
                  />
                );
              })}

              {/* CVR 잠재량 라인 (우측 Y축) */}
              {showCvr && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey={CVR_LINE_KEY}
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#10b981', fill: '#0f172a' }}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ── 변경 원인 오버레이 패널 ── */}
        {selectedDate && (
          <div className={styles.overlay_panel}>
            {/* 패널 헤더 */}
            <div className={styles.panel_header}>
              <div className={styles.panel_title_row}>
                <span className={styles.panel_date}>{selectedDate}</span>
                {selectedReleaseInfo && (
                  <span className={styles.panel_version}>{selectedReleaseInfo.version}</span>
                )}
                {!selectedReleaseInfo && (
                  <span className={styles.panel_desc}>일반 데이터 포인트</span>
                )}
              </div>
              <button
                className={styles.panel_close}
                onClick={(e) => { e.stopPropagation(); setSelectedDate(null); }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>

            {/* 릴리즈 변경 내역 */}
            {selectedReleaseInfo && (
              <div className={styles.cause_section}>
                <p className={styles.section_label}>변경 내역</p>
                <p className={styles.cause_desc}>{selectedReleaseInfo.description}</p>
                {selectedReleaseInfo.changeLog && selectedReleaseInfo.changeLog.length > 0 && (
                  <ul className={styles.changelog}>
                    {selectedReleaseInfo.changeLog.map((item, i) => (
                      <li key={i} className={styles.changelog_item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* 지표 변화 (릴리즈: 배포 전후 / 일반: 전주 대비) */}
            {pointDeltas.length > 0 && (
              <>
                <div className={styles.section_divider} />
                <div className={styles.release_section}>
                  <p className={styles.section_label}>
                    {selectedReleaseInfo ? '배포 전후 지표 변화' : '전주 대비 지표 변화'}
                  </p>
                  <div className={styles.delta_grid}>
                    {pointDeltas.map((d) => (
                      <DeltaCard key={d.metricKey} {...d} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* 첫 데이터 포인트 — 이전 데이터 없음 */}
            {!selectedReleaseInfo && pointDeltas.length === 0 && snapshot && (
              <div className={styles.snapshot_section}>
                <p className={styles.section_label}>지표 스냅샷</p>
                <div className={styles.snapshot_grid}>
                  {Object.entries(snapshot).map(([key, val]) => {
                    const cfg = METRIC_DEFS[key];
                    if (!cfg) return null;
                    return (
                      <div key={key} className={styles.snapshot_item}>
                        <span className={styles.snapshot_label}>{cfg.label}</span>
                        <span className={styles.snapshot_val}>{val}{cfg.unit}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className={styles.panel_footnote}>
              {selectedReleaseInfo ? '이전 주 데이터 대비 변화량' : '전주 대비 변화량 · 해당 날짜 배포 없음'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
