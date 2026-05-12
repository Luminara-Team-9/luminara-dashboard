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

const ISPS = ['SK', 'KT', 'LG'] as const;

function getSessions(item: RegionalData): number {
  return item.sessions ?? 0;
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
  if (maxSessions <= 0 || sessions <= 0) return '#111827';
  const ratio = Math.max(0.12, sessions / maxSessions);
  return `rgba(59,130,246,${(0.16 + ratio * 0.58).toFixed(2)})`;
}

function usageHover(sessions: number, maxSessions: number): string {
  if (maxSessions <= 0 || sessions <= 0) return 'rgba(30,41,59,0.75)';
  const ratio = Math.max(0.2, sessions / maxSessions);
  return `rgba(96,165,250,${(0.25 + ratio * 0.55).toFixed(2)})`;
}

function latencyStatus(ms: number | null): string {
  if (ms === null) return '측정 없음';
  if (ms < 300) return '양호';
  if (ms < 400) return '주의';
  return '느림';
}

function getRegionRows(data: RegionalData[], selectedIsp: string | null) {
  return TABLE_ORDER
    .map((region) => {
      const sessions = sumSessions(data, region, selectedIsp);
      return {
        region,
        sessions,
        avgLatency: avgLatency(data, region, selectedIsp),
      };
    })
    .filter((row) => row.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
}

function getIspRows(data: RegionalData[], selectedRegion: string | null) {
  const baseTotal = sumSessions(data, selectedRegion, null);
  return ISPS.map((isp) => {
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

    return (
      <div className={styles.side_panel}>
        <div className={styles.side_title}>{selectedRegion} 통신사 분포</div>
        <div className={styles.side_summary}>
          <strong>{formatCompactCount(regionTotal)} 세션</strong>
          <span>전체의 {formatShare(regionTotal, totalSessions)}</span>
        </div>
        <div className={styles.rank_list}>
          {rows.map((row) => (
            <div key={row.isp} className={styles.rank_row}>
              <div>
                <strong>{row.isp}</strong>
                <span>{formatCompactCount(row.sessions)} 세션 · {row.share.toFixed(1)}%</span>
              </div>
              <em>{row.avgLatency}ms · {latencyStatus(row.avgLatency)}</em>
            </div>
          ))}
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
      <div className={styles.isp_share_grid}>
        {ispRows.map((row) => (
          <div key={row.isp} className={styles.isp_share_card}>
            <span>{row.isp}</span>
            <strong>{row.share.toFixed(1)}%</strong>
            <em>{formatCompactCount(row.sessions)} 세션</em>
          </div>
        ))}
      </div>
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

  const regionalData = data?.rum.regionalData ?? [];
  const totalSessions = sumSessions(regionalData);
  const topRegion = getRegionRows(regionalData, null)[0];
  const topIsp = getIspRows(regionalData, null)[0];
  const highUsageLatency = getHighUsageLatencyCandidate(regionalData);

  const mapCSS = useMemo(() => {
    const selector = '#rum-map';
    const maxSessions = Math.max(...Object.values(SVG_TO_REGION).map((region) => sumSessions(regionalData, region, selectedIsp)), 1);
    const lines = [
      `${selector} svg { width: 100%; height: auto; display: block; }`,
      `${selector} svg path { fill: #111827; stroke: #0a0f1e; stroke-width: 0.6;`,
      '                transition: fill 0.2s, stroke 0.2s; pointer-events: all; }',
    ];

    Object.entries(SVG_TO_REGION).forEach(([id, region]) => {
      const sessions = sumSessions(regionalData, region, selectedIsp);
      const isSelected = selectedRegion === region;
      const hasSelected = selectedRegion !== null;

      if (hasSelected && !isSelected) {
        lines.push(`${selector} #${id} { fill: #0b1120; stroke: rgba(255,255,255,0.16); stroke-width: 0.8; cursor: pointer; }`);
        return;
      }

      lines.push(
        `${selector} #${id} { fill: ${usageFill(sessions, maxSessions)}; stroke: ${isSelected ? '#60a5fa' : '#1e3a5f'};`,
        `              stroke-width: ${isSelected ? 2.5 : 0.7}; cursor: pointer; }`,
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
            세션 기준으로 어느 지역과 통신사 접속이 많은지 확인합니다.
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
          <span>최다 이용 통신사</span>
          <strong>{topIsp?.isp ?? '-'}</strong>
          <em>{topIsp ? `${topIsp.share.toFixed(1)}% · 할인 이벤트 후보` : '데이터 없음'}</em>
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
              {ISPS.map((isp) => (
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
        <span>지연시간(ms)은 지역·통신사 세션 가중 평균 참고 수치</span>
      </div>

      <p className={styles.notice}>
        통신사는 접속 IP의 ASN 정보를 기준으로 추정합니다. 실제 이용자가 가입한 통신사와 항상 일치하지는 않지만,
        표본이 충분하면 통신사 할인·제휴 이벤트 기획을 위한 참고 지표로 사용할 수 있습니다.
      </p>
    </section>
  );
}
