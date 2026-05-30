'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcWeightedLatency } from '@/shared/lib/estimationFormulas';
import { formatCompactCount } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui';
import type { RegionalData } from '@/shared/lib/types';
import styles from './RumHeatmap.module.css';

const SVG_TO_REGION: Record<string, string> = {
  'KR-11': '서울',
  'KR-26': '부산',
  'KR-27': '대구',
  'KR-28': '인천',
  'KR-29': '광주',
  'KR-30': '대전',
  'KR-31': '울산',
  'KR-41': '경기',
  'KR-42': '강원',
  'KR-43': '충북',
  'KR-44': '충남',
  'KR-45': '전북',
  'KR-46': '전남',
  'KR-47': '경북',
  'KR-48': '경남',
  'KR-49': '제주',
  'KR-50': '세종',
};

const TABLE_ORDER = [
  '서울',
  '경기',
  '인천',
  '부산',
  '대구',
  '경남',
  '대전',
  '광주',
  '경북',
  '충남',
  '울산',
  '전북',
  '강원',
  '충북',
  '전남',
  '세종',
  '제주',
];

const UNKNOWN_ISP = '통신사 미상';

const REGION_ALIASES: Record<string, string> = {
  Seoul: '서울',
  Busan: '부산',
  Daegu: '대구',
  Incheon: '인천',
  Gwangju: '광주',
  Daejeon: '대전',
  Ulsan: '울산',
  'Gyeonggi-do': '경기',
  'Gangwon-do': '강원',
  'Chungcheongbuk-do': '충북',
  'Chungcheongnam-do': '충남',
  'Jeollabuk-do': '전북',
  'Jeollanam-do': '전남',
  'Gyeongsangbuk-do': '경북',
  'Gyeongsangnam-do': '경남',
  'Jeju-do': '제주',
  Sejong: '세종',
};

function getSessions(item: RegionalData): number {
  return item.sessions ?? 0;
}

function normalizeRegionName(region: string): string {
  const trimmed = region.trim();
  return REGION_ALIASES[trimmed] ?? trimmed;
}

function isMeasuredIsp(isp: string | null | undefined): isp is string {
  const value = String(isp ?? '').trim();
  return value.length > 0 && value !== UNKNOWN_ISP && value !== '-' && value.toLowerCase() !== 'null';
}

function sumSessions(data: RegionalData[], region: string | null = null, isp: string | null = null): number {
  return data
    .filter((item) => (region === null || item.region === region) && (isp === null || item.isp === isp))
    .reduce((sum, item) => sum + getSessions(item), 0);
}

function avgLatency(data: RegionalData[], region: string | null = null, isp: string | null = null): number | null {
  const rows = data.filter((item) => (region === null || item.region === region) && (isp === null || item.isp === isp));
  return rows.length ? calcWeightedLatency(rows) : null;
}

function formatShare(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '0.0%';
}

function usageFill(sessions: number, maxSessions: number): string {
  if (maxSessions <= 0 || sessions <= 0) return '#e5e7eb';
  const ratio = Math.max(0.12, sessions / maxSessions);
  return `rgba(37,99,235,${(0.16 + ratio * 0.58).toFixed(2)})`;
}

function usageHover(sessions: number, maxSessions: number): string {
  if (maxSessions <= 0 || sessions <= 0) return '#dbeafe';
  const ratio = Math.max(0.2, sessions / maxSessions);
  return `rgba(37,99,235,${(0.28 + ratio * 0.5).toFixed(2)})`;
}

function latencyStatus(ms: number | null): string {
  if (ms === null) return '측정 없음';
  if (ms < 300) return '양호';
  if (ms < 400) return '주의';
  return '느림';
}

function getRegionNames(data: RegionalData[]): string[] {
  return Array.from(new Set(data.map((item) => item.region).filter(Boolean))).sort((a, b) => {
    const aIndex = TABLE_ORDER.indexOf(a);
    const bIndex = TABLE_ORDER.indexOf(b);

    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
    if (aIndex >= 0) return -1;
    if (bIndex >= 0) return 1;
    return a.localeCompare(b);
  });
}

function getIspNames(data: RegionalData[]): string[] {
  return Array.from(new Set(data.map((item) => item.isp).filter(isMeasuredIsp))).sort((a, b) => {
    const sessionsA = sumSessions(data, null, a);
    const sessionsB = sumSessions(data, null, b);
    return sessionsB - sessionsA || a.localeCompare(b);
  });
}

function getRegionRows(data: RegionalData[], selectedIsp: string | null) {
  return getRegionNames(data)
    .map((region) => ({
      region,
      sessions: sumSessions(data, region, selectedIsp),
      avgLatency: avgLatency(data, region, selectedIsp),
    }))
    .filter((row) => row.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
}

function getIspRows(data: RegionalData[], selectedRegion: string | null) {
  const baseTotal = sumSessions(data, selectedRegion, null);
  return getIspNames(data).map((isp) => {
    const sessions = sumSessions(data, selectedRegion, isp);
    return {
      isp,
      sessions,
      share: baseTotal > 0 ? (sessions / baseTotal) * 100 : 0,
      avgLatency: avgLatency(data, selectedRegion, isp),
    };
  }).sort((a, b) => b.sessions - a.sessions);
}

function getHighUsageLatencyCandidate(data: RegionalData[]) {
  return getRegionRows(data, null)
    .filter((row) => row.avgLatency !== null)
    .sort((a, b) => (b.sessions * (b.avgLatency ?? 0)) - (a.sessions * (a.avgLatency ?? 0)))[0] ?? null;
}

function DetailPanel({
  data,
  selectedRegion,
  selectedIsp,
}: {
  data: RegionalData[];
  selectedRegion: string | null;
  selectedIsp: string | null;
}) {
  const totalSessions = sumSessions(data);

  if (selectedRegion) {
    const rows = getIspRows(data, selectedRegion);
    const regionTotal = sumSessions(data, selectedRegion);
    const hasIspRows = rows.length > 0;

    return (
      <div className={styles.side_panel}>
        <div className={styles.side_title}>{selectedRegion} 통신사 분포</div>
        <div className={styles.side_summary}>
          <strong>{formatCompactCount(regionTotal)} 세션</strong>
          <span>전체의 {formatShare(regionTotal, totalSessions)} · IP 기반 추정 지역</span>
        </div>
        <div className={styles.rank_list}>
          {hasIspRows ? (
            rows.map((row) => (
              <div key={row.isp} className={styles.rank_row}>
                <div>
                  <strong>{row.isp}</strong>
                  <span>{formatCompactCount(row.sessions)} 세션 · {row.share.toFixed(1)}%</span>
                </div>
                <em>{row.avgLatency}ms · {latencyStatus(row.avgLatency)}</em>
              </div>
            ))
          ) : (
            <div className={styles.empty_state}>
              <strong>통신사 정보 미수집</strong>
              <span>현재 이벤트에는 지역은 저장되지만 ISP 값은 비어 있습니다.</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (selectedIsp) {
    const rows = getRegionRows(data, selectedIsp).slice(0, 8);
    const ispTotal = sumSessions(data, null, selectedIsp);

    return (
      <div className={styles.side_panel}>
        <div className={styles.side_title}>{selectedIsp} 접속 이용 지역 TOP 8</div>
        <div className={styles.side_summary}>
          <strong>{formatCompactCount(ispTotal)} 세션</strong>
          <span>전체의 {formatShare(ispTotal, totalSessions)}</span>
        </div>
        <div className={styles.rank_list}>
          {rows.map((row, index) => (
            <div key={row.region} className={styles.rank_row}>
              <div>
                <strong>{index + 1}. {row.region}</strong>
                <span>{formatCompactCount(row.sessions)} 세션</span>
              </div>
              <em>{row.avgLatency}ms · {latencyStatus(row.avgLatency)}</em>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const regionRows = getRegionRows(data, null).slice(0, 7);
  const ispRows = getIspRows(data, null);
  const hasIspRows = ispRows.length > 0;

  return (
    <div className={styles.side_panel}>
      <div className={styles.side_title}>이용 지역 TOP 7</div>
      <div className={styles.rank_list}>
        {regionRows.map((row, index) => (
          <div key={row.region} className={styles.rank_row}>
            <div>
              <strong>{index + 1}. {row.region}</strong>
              <span>{formatCompactCount(row.sessions)} 세션</span>
            </div>
            <em>{row.avgLatency}ms · {latencyStatus(row.avgLatency)}</em>
          </div>
        ))}
      </div>

      <div className={styles.side_title}>통신사 비중</div>
      {hasIspRows ? (
        <div className={styles.isp_share_grid}>
          {ispRows.map((row) => (
            <div key={row.isp} className={styles.isp_share_card}>
              <span>{row.isp}</span>
              <strong>{row.share.toFixed(1)}%</strong>
              <em>{formatCompactCount(row.sessions)} 세션</em>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty_state}>
          <strong>ISP 수집 없음</strong>
          <span>ClickHouse의 ISP 필드가 현재 모두 비어 있어 통신사 비중은 표시하지 않습니다.</span>
        </div>
      )}
    </div>
  );
}

export function RumHeatmap() {
  const { data, loading, error } = usePerformanceData();
  const [selectedIsp, setSelectedIsp] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState('');

  useEffect(() => {
    let mounted = true;

    fetch('/southKoreaLow.svg')
      .then((response) => response.text())
      .then((svg) => {
        if (mounted) setSvgContent(svg);
      })
      .catch(() => {
        if (mounted) setSvgContent('');
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleIspClick = (isp: string | null) => {
    setSelectedIsp((prev) => (prev === isp ? null : isp));
    setSelectedRegion(null);
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as SVGElement;
    const pathElement = (target.id?.startsWith('KR-') ? target : target.closest?.('[id^="KR-"]')) as SVGElement | null;
    if (!pathElement?.id) return;

    const region = SVG_TO_REGION[pathElement.id];
    if (!region) return;

    setSelectedRegion((prev) => (prev === region ? null : region));
  };

  const regionalData = useMemo(
    () => (data?.rum.regionalData ?? []).map((item) => ({
      ...item,
      region: normalizeRegionName(item.region),
    })),
    [data?.rum.regionalData],
  );
  const totalSessions = sumSessions(regionalData);
  const topRegion = getRegionRows(regionalData, null)[0];
  const topIsp = getIspRows(regionalData, null)[0];
  const highUsageLatency = getHighUsageLatencyCandidate(regionalData);
  const ispNames = getIspNames(regionalData);

  const mapCSS = useMemo(() => {
    const selector = '#rum-map';
    const maxSessions = Math.max(...Object.values(SVG_TO_REGION).map((region) => sumSessions(regionalData, region, selectedIsp)), 1);
    const lines = [
      `${selector} { width: min(100%, 330px); height: 330px; display: flex; align-items: center; justify-content: center; }`,
      `${selector} svg { width: 100%; height: auto; max-height: 330px; display: block; }`,
      `${selector} svg path { fill: #e5e7eb; stroke: #94a3b8; stroke-width: 0.6;`,
      '                transition: fill 0.2s, stroke 0.2s; pointer-events: all; }',
    ];

    Object.entries(SVG_TO_REGION).forEach(([id, region]) => {
      const sessions = sumSessions(regionalData, region, selectedIsp);
      const isSelected = selectedRegion === region;
      const hasSelected = selectedRegion !== null;

      if (hasSelected && !isSelected) {
        lines.push(`${selector} #${id} { fill: #eef2f7; stroke: #cbd5e1; stroke-width: 0.8; cursor: pointer; }`);
        return;
      }

      lines.push(
        `${selector} #${id} { fill: ${isSelected ? '#1e3a5f' : usageFill(sessions, maxSessions)}; stroke: ${isSelected ? '#0f172a' : '#64748b'};`,
        `              stroke-width: ${isSelected ? 3.4 : 0.9}; cursor: pointer; }`,
        `${selector} #${id}:hover { fill: ${usageHover(sessions, maxSessions)}; }`,
      );
    });

    return lines.join('\n');
  }, [regionalData, selectedIsp, selectedRegion]);

  if (error) return <p className={styles.error}>{error}</p>;

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>보조 분석: 지역·통신사 이용 분포</h2>
          <span className={styles.subtitle}>
            세션 기준으로 IP 기반 추정 지역과 수집 가능한 접속망 정보를 확인합니다.
          </span>
        </div>
      </div>

      <div className={styles.summary_grid}>
        <div className={styles.summary_card}>
          <span>분석 세션</span>
          <strong>{formatCompactCount(totalSessions)}</strong>
          <em>지역·통신사 집계 세션</em>
        </div>
        <div className={styles.summary_card}>
          <span>최다 이용 지역</span>
          <strong>{topRegion?.region ?? '-'}</strong>
          <em>{topRegion ? `${formatCompactCount(topRegion.sessions)} 세션` : '데이터 없음'}</em>
        </div>
        <div className={styles.summary_card}>
          <span>접속망/ISP</span>
          <strong>{topIsp?.isp ?? '수집 안 됨'}</strong>
          <em>{topIsp ? `${topIsp.share.toFixed(1)}% · 접속망 추정` : '현재 이벤트의 ISP 필드가 비어 있음'}</em>
        </div>
        <div className={styles.summary_card}>
          <span>이용 많고 느린 지역</span>
          <strong>{highUsageLatency?.region ?? '-'}</strong>
          <em>{highUsageLatency ? `${highUsageLatency.avgLatency}ms · ${formatCompactCount(highUsageLatency.sessions)} 세션` : '데이터 없음'}</em>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.map_col}>
          <div className={styles.map_controls}>
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${selectedIsp === null ? styles.tab_active : ''}`}
                onClick={() => handleIspClick(null)}
              >
                전체
              </button>
              {ispNames.map((isp) => (
                <button
                  key={isp}
                  className={`${styles.tab} ${selectedIsp === isp ? styles.tab_active : ''}`}
                  onClick={() => handleIspClick(isp)}
                >
                  {isp}
                </button>
              ))}
              {ispNames.length === 0 && <span className={styles.disabled_tab}>ISP 미수집</span>}
            </div>
            {(selectedRegion || selectedIsp) && (
              <button
                className={styles.clear_btn}
                onClick={() => {
                  setSelectedRegion(null);
                  setSelectedIsp(null);
                }}
              >
                초기화
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
                />
              </>
            )}
          </div>
        </div>

        {loading ? (
          <Skeleton width="100%" height="260px" radius="10px" />
        ) : (
          <DetailPanel
            data={regionalData}
            selectedRegion={selectedRegion}
            selectedIsp={selectedIsp}
          />
        )}
      </div>

      <div className={styles.legend}>
        <span>지역 색상: 세션 수가 많을수록 진한 파란색</span>
        <span>국내 지도에 없는 해외/미상 지역은 우측 순위에만 표시</span>
        <span>지연시간(ms)은 지역 세션 가중 평균 참고 수치</span>
      </div>

      <p className={styles.notice}>
        지역은 접속 IP 기반 추정값입니다. 현재 수집 이벤트에는 ISP 값이 비어 있어 통신사별 비중은 표시하지 않습니다.
      </p>
    </section>
  );
}
