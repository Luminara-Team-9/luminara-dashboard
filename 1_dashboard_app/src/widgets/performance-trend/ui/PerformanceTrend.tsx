'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { estimateCvrLiftForMetric } from '@/shared/lib/estimationFormulas';
import { Skeleton } from '@/shared/ui';
import type { BenchmarkEntry, MetricKey, TrendDataset, Trends } from '@/shared/lib/types';
import styles from './PerformanceTrend.module.css';

const METRIC_DEFS: Record<string, {
  label: string;
  shortLabel: string;
  unit: string;
  domain: [number, number];
  target: number;
  higherIsBetter: boolean;
  targetLabel: string;
}> = {
  lighthouse: {
    label: '종합 성능(Lighthouse)',
    shortLabel: '종합 성능',
    unit: '점',
    domain: [40, 100],
    target: 90,
    higherIsBetter: true,
    targetLabel: '90점 이상',
  },
  lcp: {
    label: '첫 화면 표시(LCP)',
    shortLabel: '첫 화면 표시',
    unit: '초',
    domain: [0, 7],
    target: 2.5,
    higherIsBetter: false,
    targetLabel: '2.5초 이하',
  },
  tbt: {
    label: '실행 지연(TBT)',
    shortLabel: '실행 지연',
    unit: 'ms',
    domain: [0, 700],
    target: 200,
    higherIsBetter: false,
    targetLabel: '200ms 이하',
  },
  inp: {
    label: '클릭 반응(INP)',
    shortLabel: '클릭 반응',
    unit: 'ms',
    domain: [0, 420],
    target: 200,
    higherIsBetter: false,
    targetLabel: '200ms 이하',
  },
};

const BRAND_COLORS: Record<string, string> = {
  Decathlon: '#3b82f6',
};

const CVR_LINE_KEY = '전환 영향 참고(%)';
const CVR_CALC: Record<string, (value: number) => number> = {
  lcp: (value) => estimateCvrLiftForMetric('lcp', value, 2.5),
  inp: (value) => estimateCvrLiftForMetric('inp', value, 200),
};

const MIN_CHART_WIDTH = 320;
const MIN_CHART_HEIGHT = 280;

function getCompetitorAvg(benchmarks: BenchmarkEntry[], metricKey: string): number | null {
  const competitors = benchmarks.filter((benchmark) => !benchmark.isTarget);
  if (!competitors.length) return null;

  if (metricKey === 'lighthouse') {
    const avg = competitors.reduce((sum, benchmark) => sum + benchmark.scores.lighthouse, 0) / competitors.length;
    return Math.round(avg * 10) / 10;
  }

  const values = competitors
    .map((benchmark) => benchmark.metrics[metricKey as MetricKey]?.value)
    .filter((value): value is number => value != null);

  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function fmtDate(iso: string) {
  const [, month, day] = iso.split('-');
  return `${parseInt(month, 10)}/${parseInt(day, 10)}`;
}

function formatValue(value: number, metricKey: string): string {
  const config = METRIC_DEFS[metricKey];
  if (!config) return String(value);
  return `${value}${config.unit}`;
}

function buildChartData(trends: Trends, metricKey: string) {
  const datasets = trends.datasets.filter((dataset) => dataset.metricKey === metricKey);
  const decathlonDataset = datasets.find((dataset) => dataset.brand === 'Decathlon');
  const cvrFn = CVR_CALC[metricKey];

  return trends.labels.map((label, index) => {
    const point: Record<string, string | number> = { date: fmtDate(label) };
    datasets.forEach((dataset) => {
      point[dataset.brand] = dataset.values[index];
    });
    if (cvrFn && decathlonDataset) {
      point[CVR_LINE_KEY] = cvrFn(decathlonDataset.values[index]);
    }
    return point;
  });
}

function getDecathlonSnapshot(trends: Trends, date: string): Record<string, number> | null {
  const index = trends.labels.indexOf(date);
  if (index < 0) return null;

  const result: Record<string, number> = {};
  trends.datasets
    .filter((dataset: TrendDataset) => dataset.brand === 'Decathlon')
    .forEach((dataset: TrendDataset) => {
      result[dataset.metricKey] = dataset.values[index];
    });

  return Object.keys(result).length > 0 ? result : null;
}

function calcDeltas(trends: Trends, releaseDate: string) {
  const releaseIndex = trends.labels.indexOf(releaseDate);
  if (releaseIndex < 1) return [];

  const results: {
    metricKey: string;
    before: number;
    after: number;
    delta: number;
    pct: number;
  }[] = [];

  trends.datasets
    .filter((dataset: TrendDataset) => dataset.brand === 'Decathlon')
    .forEach((dataset: TrendDataset) => {
      const before = dataset.values[releaseIndex - 1];
      const after = dataset.values[releaseIndex];
      if (before == null || after == null) return;

      const delta = Math.round((after - before) * 100) / 100;
      const pct = before === 0 ? 0 : Math.round((delta / before) * 1000) / 10;
      results.push({ metricKey: dataset.metricKey, before, after, delta, pct });
    });

  return results;
}

function useElementSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener('resize', updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  return { ref, ...size };
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  metricKey: string;
}

function CustomTooltip({ active, payload, label, metricKey }: TooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltip_date}>{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className={styles.tooltip_row}>
          <span className={styles.tooltip_dot} style={{ backgroundColor: entry.color }} />
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span style={{ color: '#1e293b' }}>
            {entry.name === CVR_LINE_KEY ? `+${entry.value}%` : formatValue(entry.value, metricKey)}
          </span>
        </p>
      ))}
    </div>
  );
}

function DeltaCard({
  metricKey,
  before,
  after,
  delta,
  pct,
}: {
  metricKey: string;
  before: number;
  after: number;
  delta: number;
  pct: number;
}) {
  const config = METRIC_DEFS[metricKey];
  if (!config) return null;

  const improved = config.higherIsBetter ? delta > 0 : delta < 0;
  const neutral = delta === 0;
  const deltaColor = neutral ? '#64748b' : improved ? '#10b981' : '#ef4444';
  const sign = delta > 0 ? '+' : '';
  const passAfter = config.higherIsBetter ? after >= config.target : after <= config.target;

  return (
    <div className={styles.delta_card}>
      <div className={styles.delta_card_top}>
        <span className={styles.delta_metric_name}>{config.label}</span>
        <span className={styles.delta_target}>{config.targetLabel}</span>
      </div>
      <div className={styles.delta_values}>
        <span className={styles.delta_before}>{formatValue(before, metricKey)}</span>
        <span className={styles.delta_arrow}>&gt;</span>
        <span className={`${styles.delta_after} ${passAfter ? styles.pass : styles.fail}`}>
          {formatValue(after, metricKey)}
        </span>
      </div>
      <div className={styles.delta_footer}>
        <span className={styles.delta_change} style={{ color: deltaColor }}>
          {neutral ? '변화 없음' : `${sign}${formatValue(delta, metricKey)} (${sign}${pct}%)`}
        </span>
        <span className={`${styles.delta_status} ${passAfter ? styles.status_pass : styles.status_fail}`}>
          {passAfter ? '목표 충족' : '목표 미달'}
        </span>
      </div>
    </div>
  );
}

export function PerformanceTrend() {
  const { data, loading, error } = usePerformanceData();
  const [activeMetric, setActiveMetric] = useState('lighthouse');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const { ref: chartRef, width: chartWidth, height: chartHeight } = useElementSize();
  const canRenderChart = chartWidth >= MIN_CHART_WIDTH && chartHeight >= MIN_CHART_HEIGHT;

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.header}>
          <Skeleton width="130px" height="18px" />
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} width="72px" height="30px" radius="7px" />
            ))}
          </div>
        </div>
        <div
          className={styles.chart_wrap}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'flex-end' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flex: 1, paddingTop: 8 }}>
            {[60, 80, 55, 90, 70, 85, 65, 95, 75].map((height, index) => (
              <Skeleton key={index} width="100%" height={`${height}%`} radius="4px 4px 0 0" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  const { trends } = data;
  const availableMetrics = Object.keys(METRIC_DEFS).filter((key) =>
    trends.datasets.some((dataset) => dataset.metricKey === key),
  );
  const config = METRIC_DEFS[activeMetric];
  const chartData = buildChartData(trends, activeMetric);
  const activeBrands = ['Decathlon'].filter((brand) =>
    trends.datasets.some((dataset) => dataset.metricKey === activeMetric && dataset.brand === brand),
  );
  const competitorAvg = getCompetitorAvg(data.benchmarks, activeMetric);

  const showCvr = activeMetric in CVR_CALC;
  const cvrMax = showCvr
    ? Math.ceil(Math.max(...chartData.map((point) => (point[CVR_LINE_KEY] as number) ?? 0)) * 1.5 * 10) / 10
    : 0;

  const selectedReleaseInfo = selectedDate
    ? trends.releases.find((release) => release.date === selectedDate)
    : null;
  const snapshot = selectedDate ? getDecathlonSnapshot(trends, selectedDate) : null;
  const pointDeltas = selectedDate ? calcDeltas(trends, selectedDate) : [];

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>성능 추세</h2>
          <span className={styles.click_hint}>
            웹사이트 변경이 있었을 때 측정한 값입니다. 날짜를 클릭하면 변경 이력과 성능 변화가 함께 표시됩니다.
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

      <div className={styles.chart_wrap}>
        <div className={styles.chart_inner} ref={chartRef}>
          {canRenderChart ? (
            <ComposedChart
              width={chartWidth}
              height={chartHeight}
              data={chartData}
              margin={{ top: 34, right: showCvr ? 4 : 16, left: 0, bottom: 0 }}
              style={{ cursor: 'pointer' }}
              onClick={(payload) => {
                if (!payload?.activeLabel) return;
                const originalDate = trends.labels.find((label) => fmtDate(label) === payload.activeLabel);
                if (!originalDate) {
                  setSelectedDate(null);
                  return;
                }
                setSelectedDate((prev) => (prev === originalDate ? null : originalDate));
              }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="#1e2d45" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={{ stroke: '#d7dee8' }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                domain={config.domain}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `${value}${config.unit}`}
                width={48}
              />

              {showCvr && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, cvrMax]}
                  tick={{ fill: '#10b981', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `+${value}%`}
                  width={44}
                />
              )}

              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    active={props.active}
                    payload={props.payload as unknown as TooltipEntry[]}
                    label={props.label as string}
                    metricKey={activeMetric}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#64748b', paddingTop: '8px' }} />

              <ReferenceLine
                yAxisId="left"
                y={config.target}
                stroke="#22c55e"
                strokeDasharray="5 3"
                strokeOpacity={0.6}
                label={{ value: '목표', position: 'insideTopRight', fill: '#22c55e', fontSize: 10 }}
              />

              {competitorAvg !== null && (
                <ReferenceLine
                  yAxisId="left"
                  y={competitorAvg}
                  stroke="#b45309"
                  strokeDasharray="3 4"
                  strokeOpacity={0.7}
                  label={{
                    value: `경쟁사 평균 ${competitorAvg}${config.unit}`,
                    position: 'insideBottomRight',
                    fill: '#b45309',
                    fontSize: 10,
                  }}
                />
              )}

              {trends.releases.map((release) => {
                const isSelected = selectedDate === release.date;
                return (
                  <ReferenceLine
                    key={`${release.date}-${release.version}`}
                    yAxisId="left"
                    x={fmtDate(release.date)}
                    stroke={isSelected ? '#3b82f6' : '#334155'}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeDasharray={isSelected ? undefined : '4 3'}
                    label={{
                      value: release.version,
                      position: 'insideTop',
                      fill: isSelected ? '#2563eb' : '#64748b',
                      fontSize: 10,
                    }}
                  />
                );
              })}

              {activeBrands.map((brand) => {
                const color = BRAND_COLORS[brand] ?? '#64748b';
                return (
                  <Line
                    key={brand}
                    yAxisId="left"
                    type="linear"
                    dataKey={brand}
                    stroke={color}
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 1.5, stroke: color, fill: '#ffffff' }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: color, fill: '#ffffff' }}
                    isAnimationActive={false}
                  />
                );
              })}

              {showCvr && (
                <Line
                  yAxisId="right"
                  type="linear"
                  dataKey={CVR_LINE_KEY}
                  stroke="#10b981"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 2.5, strokeWidth: 1.5, stroke: '#10b981', fill: '#ffffff' }}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: '#10b981', fill: '#ffffff' }}
                  isAnimationActive={false}
                />
              )}
            </ComposedChart>
          ) : (
            <Skeleton width="100%" height="100%" radius="12px" />
          )}
        </div>

        {selectedDate && (
          <div className={styles.overlay_panel}>
            <div className={styles.panel_header}>
              <div className={styles.panel_title_row}>
                <span className={styles.panel_date}>{selectedDate}</span>
                {selectedReleaseInfo ? (
                  <span className={styles.panel_version}>{selectedReleaseInfo.version}</span>
                ) : (
                  <span className={styles.panel_desc}>측정 지점</span>
                )}
              </div>
              <button
                className={styles.panel_close}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedDate(null);
                }}
                aria-label="닫기"
              >
                닫기
              </button>
            </div>

            {selectedReleaseInfo && (
              <div className={styles.cause_section}>
                <p className={styles.section_label}>사이트 변경 이력</p>
                <p className={styles.cause_desc}>{selectedReleaseInfo.description}</p>
                {selectedReleaseInfo.changeLog && selectedReleaseInfo.changeLog.length > 0 && (
                  <ul className={styles.changelog}>
                    {selectedReleaseInfo.changeLog.map((item, index) => (
                      <li key={index} className={styles.changelog_item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {pointDeltas.length > 0 && (
              <>
                <div className={styles.section_divider} />
                <div className={styles.release_section}>
                  <p className={styles.section_label}>
                    {selectedReleaseInfo ? '변경 전후 성능 변화' : '직전 측정 대비 성능 변화'}
                  </p>
                  <div className={styles.delta_grid}>
                    {pointDeltas.map((delta) => (
                      <DeltaCard key={delta.metricKey} {...delta} />
                    ))}
                  </div>
                </div>
              </>
            )}

            {!selectedReleaseInfo && pointDeltas.length === 0 && snapshot && (
              <div className={styles.snapshot_section}>
                <p className={styles.section_label}>측정 요약</p>
                <div className={styles.snapshot_grid}>
                  {Object.entries(snapshot).map(([key, value]) => {
                    const metric = METRIC_DEFS[key];
                    if (!metric) return null;
                    return (
                      <div key={key} className={styles.snapshot_item}>
                        <span className={styles.snapshot_label}>{metric.label}</span>
                        <span className={styles.snapshot_val}>{formatValue(value, key)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className={styles.panel_footnote}>
              운영 환경에서는 배포, CMS, 상품·이벤트 페이지 변경 직후 Lighthouse/Web Vitals를 측정해 변경 영향만 비교합니다.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
