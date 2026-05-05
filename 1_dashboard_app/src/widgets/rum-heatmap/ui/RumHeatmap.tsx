'use client';

import { useState, useEffect, useMemo } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { Skeleton } from '@/shared/ui';
import type { RegionalData } from '@/shared/lib/types';
import styles from './RumHeatmap.module.css';

// ── SVG ID → 지역명 ───────────────────────────────────────────
const SVG_TO_REGION: Record<string, string> = {
  'KR-11': '서울', 'KR-26': '부산', 'KR-27': '대구', 'KR-28': '인천',
  'KR-29': '광주', 'KR-30': '대전', 'KR-31': '울산', 'KR-41': '경기',
  'KR-42': '강원', 'KR-43': '충북', 'KR-44': '충남', 'KR-45': '전북',
  'KR-46': '전남', 'KR-47': '경북', 'KR-48': '경남', 'KR-49': '제주',
  'KR-50': '세종',
};

const TABLE_ORDER = [
  '서울','인천','경기','강원','세종','충북','충남',
  '대전','경북','대구','전북','경남','울산','광주','전남','부산','제주',
];

const ISPS = ['SK', 'KT', 'LG'] as const;

// ── 색상 유틸 ──────────────────────────────────────────────────
function latencyFill(ms: number): string {
  if (ms < 300) return `rgba(16,185,129,${(0.18 + 0.22 * (ms / 300)).toFixed(2)})`;
  if (ms < 400) return `rgba(245,158,11,${(0.28 + 0.17 * ((ms - 300) / 100)).toFixed(2)})`;
  return `rgba(239,68,68,${(0.30 + 0.22 * Math.min((ms - 400) / 200, 1)).toFixed(2)})`;
}
function latencyHover(ms: number) {
  return ms < 300 ? 'rgba(16,185,129,0.55)' : ms < 400 ? 'rgba(245,158,11,0.55)' : 'rgba(239,68,68,0.60)';
}
function latencyColor(ms: number) {
  return ms < 300 ? '#10b981' : ms < 400 ? '#f59e0b' : '#ef4444';
}
function latencyLabel(ms: number) {
  return ms < 300 ? '양호' : ms < 400 ? '주의' : '불량';
}
function getMs(data: RegionalData[], region: string, isp: string): number | null {
  return data.find(d => d.region === region && d.isp === isp)?.avgLatency ?? null;
}
function avgMs(data: RegionalData[], region: string, isp: string | null): number | null {
  const rows = data.filter(d => d.region === region && (isp === null || d.isp === isp));
  if (!rows.length) return null;
  return Math.round(rows.reduce((s, d) => s + d.avgLatency, 0) / rows.length);
}

// ── 오른쪽 표 ─────────────────────────────────────────────────
function SideTable({ data, selectedRegion, selectedIsp }: {
  data: RegionalData[];
  selectedRegion: string | null;
  selectedIsp: string | null;
}) {
  // 지역 선택됨 → 그 지역의 SK/KT/LG
  if (selectedRegion) {
    return (
      <div className={styles.side_table}>
        <div className={styles.side_title}>{selectedRegion} 상세</div>
        <table className={styles.table}>
          <thead><tr>
            <th className={styles.th}>통신사</th>
            <th className={styles.th}>ms</th>
            <th className={styles.th}>상태</th>
          </tr></thead>
          <tbody>
            {ISPS.map(isp => {
              const ms = getMs(data, selectedRegion, isp);
              if (ms === null) return null;
              const color = latencyColor(ms);
              return (
                <tr key={isp} className={styles.tr}>
                  <td className={styles.td_label}>{isp}</td>
                  <td className={styles.td_val} style={{ color }}>{ms}</td>
                  <td className={styles.td_badge}>
                    <span className={styles.badge} style={{ color, background: latencyFill(ms) }}>
                      {latencyLabel(ms)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ISP 선택됨 → 전체 지역, 해당 ISP 오름차순
  if (selectedIsp) {
    const rows = TABLE_ORDER
      .map(r => ({ region: r, ms: getMs(data, r, selectedIsp) }))
      .filter((r): r is { region: string; ms: number } => r.ms !== null)
      .sort((a, b) => a.ms - b.ms);
    return (
      <div className={styles.side_table}>
        <div className={styles.side_title}>{selectedIsp} 기준 전체</div>
        <table className={styles.table}>
          <thead><tr>
            <th className={styles.th}>지역</th>
            <th className={styles.th}>ms</th>
          </tr></thead>
          <tbody>
            {rows.map(({ region, ms }) => (
              <tr key={region} className={styles.tr}>
                <td className={styles.td_label}>{region}</td>
                <td className={styles.td_val} style={{ color: latencyColor(ms) }}>{ms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // 기본 → 전체 지역 × SK/KT/LG
  return (
    <div className={styles.side_table}>
      <div className={styles.side_title}>전체</div>
      <table className={styles.table}>
        <thead><tr>
          <th className={styles.th}>지역</th>
          {ISPS.map(isp => <th key={isp} className={styles.th}>{isp}</th>)}
        </tr></thead>
        <tbody>
          {TABLE_ORDER.map(region => (
            <tr key={region} className={styles.tr}>
              <td className={styles.td_label}>{region}</td>
              {ISPS.map(isp => {
                const ms = getMs(data, region, isp);
                if (ms === null) return <td key={isp} className={styles.td_val}>—</td>;
                return (
                  <td key={isp} className={styles.td_val} style={{ color: latencyColor(ms) }}>
                    {ms}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function RumHeatmap() {
  const { data, loading, error } = usePerformanceData();
  const [selectedIsp,    setSelectedIsp]    = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [svgContent,     setSvgContent]     = useState('');

  useEffect(() => {
    fetch('/southKoreaLow.svg').then(r => r.text()).then(setSvgContent);
  }, []);

  const handleIspClick = (isp: string) => {
    setSelectedIsp(prev => prev === isp ? null : isp);
    setSelectedRegion(null);
  };

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as SVGElement;
    const pathEl = (target.id?.startsWith('KR-') ? target : target.closest?.('[id^="KR-"]')) as SVGElement | null;
    if (!pathEl?.id) return;
    const region = SVG_TO_REGION[pathEl.id];
    if (!region) return;
    setSelectedIsp(null);
    setSelectedRegion(prev => prev === region ? null : region);
  };

  const regionalData = data?.rum.regionalData ?? [];

  // 지도 스타일: fill 색으로 dimming (opacity 아님 → 선택 지역만 색상, 나머지는 거의 검정)
  const mapCSS = useMemo(() => {
    const S = '#rum-map';
    const lines = [
      `${S} svg { width: 100%; height: auto; display: block; }`,
      `${S} svg path { fill: #1a2234; stroke: #0a0f1e; stroke-width: 0.6;`,
      `                transition: fill 0.2s; pointer-events: all; }`,
    ];

    Object.entries(SVG_TO_REGION).forEach(([id, region]) => {
      const ms = avgMs(regionalData, region, selectedIsp);
      if (ms === null) return;

      const isSelected  = selectedRegion === region;
      const hasSelected = selectedRegion !== null;

      if (hasSelected && !isSelected) {
        lines.push(`${S} #${id} { fill: #0b1120; stroke: rgba(255,255,255,0.18); stroke-width: 0.8; cursor: pointer; }`);
      } else {
        const fill  = latencyFill(ms);
        const hover = latencyHover(ms);
        const color = latencyColor(ms);
        lines.push(
          `${S} #${id} { fill: ${fill}; stroke: ${isSelected ? color : '#1e3a5f'};`,
          `              stroke-width: ${isSelected ? 2.5 : 0.6}; cursor: pointer; }`,
          `${S} #${id}:hover { fill: ${hover}; }`,
        );
      }
    });

    return lines.join('\n');
  }, [regionalData, selectedIsp, selectedRegion]);

  if (error) return <p className={styles.error}>{error}</p>;

  return (
    <section className={styles.wrapper}>

      {/* 헤더 */}
      <div className={styles.header}>
        <h2 className={styles.title}>지역 · 통신사 레이턴시</h2>
      </div>

      {/* 지도 + 표 */}
      <div className={styles.body}>

        {/* 왼쪽: ISP 필터 + 지도 */}
        <div className={styles.map_col}>
          <div className={styles.map_controls}>
            <div className={styles.tabs}>
              {ISPS.map(isp => (
                <button
                  key={isp}
                  className={`${styles.tab} ${selectedIsp === isp ? styles.tab_active : ''}`}
                  onClick={() => handleIspClick(isp)}
                >
                  {isp}
                </button>
              ))}
            </div>
            {(selectedRegion || selectedIsp) && (
              <button
                className={styles.clear_btn}
                onClick={() => { setSelectedRegion(null); setSelectedIsp(null); }}
              >
                초기화 ✕
              </button>
            )}
          </div>
        <div className={styles.map_wrap}>
          {loading || !svgContent ? (
            <Skeleton width="100%" height="260px" radius="10px" />
          ) : (
            <>
              <style dangerouslySetInnerHTML={{ __html: mapCSS }} />
              <div
                id="rum-map"
                onClick={handleMapClick}
                dangerouslySetInnerHTML={{ __html: svgContent }}
                style={{ cursor: 'default' }}
              />
            </>
          )}
        </div>
        </div>

        {/* 오른쪽: 표 */}
        {loading ? (
          <Skeleton width="160px" height="260px" radius="10px" />
        ) : (
          <SideTable
            data={regionalData}
            selectedRegion={selectedRegion}
            selectedIsp={selectedIsp}
          />
        )}
      </div>

      {/* 범례 */}
      <div className={styles.legend}>
        <span className={`${styles.legend_dot} ${styles.good}`}>● 양호 &lt;300ms</span>
        <span className={`${styles.legend_dot} ${styles.warning}`}>● 주의 300–400ms</span>
        <span className={`${styles.legend_dot} ${styles.poor}`}>● 불량 &gt;400ms</span>
      </div>

    </section>
  );
}
