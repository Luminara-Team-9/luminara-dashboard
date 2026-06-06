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
    domain: [0, 100],
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
    label: '실행 지연(TBT)',
    shortLabel: '실행 지연',
    unit: 'ms',
    domain: [0, 700],
    target: 200,
    higherIsBetter: false,
    targetLabel: '200ms 이하',
  },
  cls: {
    label: '화면 안정성(CLS)',
    shortLabel: '화면 안정성',
    unit: '',
    domain: [0, 1],
    target: 0.1,
    higherIsBetter: false,
    targetLabel: '0.1 이하',
  },
  fcp: {
    label: '첫 콘텐츠 표시(FCP)',
    shortLabel: '첫 콘텐츠 표시',
    unit: '초',
    domain: [0, 6],
    target: 1.8,
    higherIsBetter: false,
    targetLabel: '1.8초 이하',
  },
  speedIndex: {
    label: '화면 완성 속도(Speed Index)',
    shortLabel: '화면 완성 속도',
    unit: '초',
    domain: [0, 45],
    target: 3.4,
    higherIsBetter: false,
    targetLabel: '3.4초 이하',
  },
  assetSize: {
    label: '전송량(Asset Size)',
    shortLabel: '전송량',
    unit: 'KB',
    domain: [0, 20000],
    target: 450,
    higherIsBetter: false,
    targetLabel: '450KB 이하',
  },
};

const BRAND_COLORS: Record<string, string> = {
  Decathlon: '#3b82f6',
};

const CVR_LINE_KEY = '전환 영향 참고(%)';
const CVR_CALC: Record<string, (value: number) => number> = {
  lcp: (value) => estimateCvrLiftForMetric('lcp', value, 2.5),
  inp: (value) => estimateCvrLiftForMetric('tbt', value, 200),
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

function parseTrendLabel(label: string) {
  const match = label.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/);
  if (!match) return null;

  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
    second: match[6],
  };
}

function fmtDate(label: string) {
  const parsed = parseTrendLabel(label);
  if (!parsed) return label;

  const date = parseInt(parsed.month, 10) + '/' + parseInt(parsed.day, 10);
  if (!parsed.hour) return date;
  return date + ' ' + parsed.hour + ':' + parsed.minute + ':' + parsed.second;
}

function fmtFullDate(label: string) {
  const parsed = parseTrendLabel(label);
  if (!parsed) return label;

  const date = parsed.year + '-' + parsed.month + '-' + parsed.day;
  if (!parsed.hour) return date;
  return date + ' ' + parsed.hour + ':' + parsed.minute + ':' + parsed.second;
}

function trendDateKey(label: string) {
  const parsed = parseTrendLabel(label);
  if (!parsed) return label;
  return parsed.year + '-' + parsed.month + '-' + parsed.day;
}

function getPointVersion(labels: string[], label: string) {
  const dateKey = trendDateKey(label);
  const dayLabels = labels.filter((item) => trendDateKey(item) === dateKey);
  const index = dayLabels.indexOf(label);
  return index < 0 ? '' : 'v' + (index + 1);
}

function formatAxisDate(label: string) {
  const parsed = parseTrendLabel(label);
  if (!parsed) return label;
  return parseInt(parsed.month, 10) + '/' + parseInt(parsed.day, 10);
}

function formatAxisTick(label: string, labels: string[]) {
  const dateKey = trendDateKey(label);
  const firstOfDay = labels.find((item) => trendDateKey(item) === dateKey);
  return firstOfDay === label ? formatAxisDate(label) : '';
}
function formatValue(value: number | null | undefined, metricKey: string): string {
  if (value == null) return '-';
  const config = METRIC_DEFS[metricKey];
  if (!config) return String(value);
  return String(value) + config.unit;
}

function buildChartData(trends: Trends, metricKey: string) {
  const datasets = trends.datasets.filter((dataset) => dataset.metricKey === metricKey);
  const decathlonDataset = datasets.find((dataset) => dataset.brand === 'Decathlon');
  const cvrFn = CVR_CALC[metricKey];

  return trends.labels.map((label, index) => {
    const point: Record<string, string | number | null> = { date: label, displayDate: fmtDate(label), version: getPointVersion(trends.labels, label) };
    datasets.forEach((dataset) => {
      point[dataset.brand] = dataset.values[index] ?? null;
    });
    if (cvrFn && decathlonDataset) {
      const decathlonValue = decathlonDataset.values[index];
      point[CVR_LINE_KEY] = decathlonValue == null ? null : cvrFn(decathlonValue);
    }
    return point;
  });
}

function getDecathlonSnapshot(trends: Trends, date: string): Record<string, number | null> | null {
  const index = trends.labels.indexOf(date);
  if (index < 0) return null;

  const result: Record<string, number | null> = {};
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

function getTrendReason(deltas: ReturnType<typeof calcDeltas>, activeMetric: string) {
  if (!deltas.length) return null;
  const active = deltas.find((item) => item.metricKey === activeMetric) ?? deltas.find((item) => item.metricKey === 'lighthouse');
  const lighthouse = deltas.find((item) => item.metricKey === 'lighthouse');
  const basis = activeMetric === 'lighthouse' ? lighthouse : active;
  if (!basis) return null;

  const basisConfig = METRIC_DEFS[basis.metricKey];
  const basisImproved = basisConfig.higherIsBetter ? basis.delta > 0 : basis.delta < 0;
  const basisChanged = basis.delta !== 0;
  const direction = !basisChanged ? '유지' : basisImproved ? '개선' : '악화';
  const drivers = deltas
    .filter((item) => item.metricKey !== 'lighthouse' && METRIC_DEFS[item.metricKey] && item.delta !== 0)
    .map((item) => {
      const config = METRIC_DEFS[item.metricKey];
      const improved = config.higherIsBetter ? item.delta > 0 : item.delta < 0;
      const weightBase = Math.max(Math.abs(item.before), config.target, 1);
      return { ...item, config, improved, weight: Math.abs(item.delta) / weightBase };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const driverText = drivers.length
    ? drivers.map((item) => {
        const sign = item.delta > 0 ? '+' : '';
        return item.config.shortLabel + ' ' + sign + formatValue(item.delta, item.metricKey);
      }).join(', ')
    : '세부 지표 변화가 거의 없습니다';

  const title = activeMetric === 'lighthouse'
    ? '종합 점수 ' + direction
    : basisConfig.shortLabel + ' ' + direction;
  const desc = basisChanged
    ? '직전 측정 대비 ' + driverText + ' 변화가 이번 측정값의 주요 원인으로 보입니다.'
    : '직전 측정과 큰 차이가 없어 점수 변동 원인이 뚜렷하지 않습니다.';

  return { title, desc, drivers };
}

function getMeasurementStatus(deltas: ReturnType<typeof calcDeltas>, activeMetric: string) {
  if (!deltas.length) return { label: "첫 측정", tone: "neutral" as const };
  const item = deltas.find((delta) => delta.metricKey === activeMetric) ?? deltas.find((delta) => delta.metricKey === "lighthouse");
  if (!item || item.delta === 0) return { label: "측정됨 · 점수 유지", tone: "neutral" as const };
  const config = METRIC_DEFS[item.metricKey];
  const improved = config.higherIsBetter ? item.delta > 0 : item.delta < 0;
  return {
    label: improved ? "측정됨 · 점수 개선" : "측정됨 · 점수 하락",
    tone: improved ? "good" as const : "bad" as const,
  };
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
      <p className={styles.tooltip_date}>{label ? fmtFullDate(label) : ''}</p>
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
    ? Math.ceil(Math.max(...chartData.map((point) => (point[CVR_LINE_KEY] as number | null) ?? 0)) * 1.5 * 10) / 10
    : 0;

  const selectedReleaseInfo = selectedDate
    ? trends.releases.find((release) => release.date === selectedDate)
    : null;
  const snapshot = selectedDate ? getDecathlonSnapshot(trends, selectedDate) : null;
  const pointDeltas = selectedDate ? calcDeltas(trends, selectedDate) : [];
  const trendReason = getTrendReason(pointDeltas, activeMetric);
  const measurementStatus = selectedDate ? getMeasurementStatus(pointDeltas, activeMetric) : null;

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
                const originalDate = String(payload.activeLabel);
                if (!trends.labels.includes(originalDate)) {
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
                tickFormatter={(value) => formatAxisTick(String(value), trends.labels)}
                interval={0}
                minTickGap={4}
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
                <span className={styles.panel_date}>{fmtFullDate(selectedDate)} · {getPointVersion(trends.labels, selectedDate)}</span>
                {selectedReleaseInfo ? (
                  <span className={styles.panel_version}>{selectedReleaseInfo.version}</span>
                ) : (
                  <span className={styles.panel_desc}>측정 지점</span>
                )}
                {measurementStatus && (
                  <span className={styles[measurementStatus.tone === "good" ? "change_badge_good" : measurementStatus.tone === "bad" ? "change_badge_bad" : "change_badge_neutral"]}>
                    {measurementStatus.label}
                  </span>
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
                  {trendReason && (
                    <div className={styles.reason_box}>
                      <strong>{trendReason.title}</strong>
                      <span>{trendReason.desc}</span>
                    </div>
                  )}
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
