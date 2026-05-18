'use client';

import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { calcConversionRatePercent, calcRevenue } from '@/shared/lib/estimationFormulas';
import { formatCompactCount, formatInteger, formatKrw, formatPercent } from '@/shared/lib/format';
import { Skeleton } from '@/shared/ui';
import type { BusinessMetrics, DataConfidence } from '@/shared/lib/types';
import styles from './TrafficSessionInsight.module.css';

type AcquisitionChannel = NonNullable<BusinessMetrics['acquisitionChannels']>[number];
type DeviceSegment = NonNullable<BusinessMetrics['deviceSegments']>[number];

const CONFIDENCE_LABEL: Record<DataConfidence, string> = {
  measured: '실측',
  estimated: '추정',
  proxy: '대리지표',
  mock: 'Mock',
};

const DEVICE_LABEL: Record<DeviceSegment['device'], string> = {
  Mobile: '모바일',
  Desktop: 'PC',
  Tablet: '태블릿',
};

function sumRevenue(rows: Array<{ revenue: number }>): number {
  return rows.reduce((sum, row) => sum + row.revenue, 0);
}

function getChannelRole(channel: AcquisitionChannel): string {
  if (channel.revenue >= 100000000) return '매출 핵심';
  if (channel.conversionRate >= 6) return '효율 우수';
  if (channel.sessions >= 15000 && channel.conversionRate < 5) return '규모 대비 효율 낮음';
  return '유입 보조';
}

function getChannelSourceNote(channel: string): string {
  if (channel === 'Organic Search') return '검색 결과 유입';
  if (channel === 'Paid Search') return '검색 광고 유입';
  if (channel === 'Direct') return '직접 방문';
  if (channel === 'Referral') return '외부 링크 유입';
  if (channel === 'Social') return '소셜 유입';
  if (channel === 'Email / Campaign') return '캠페인 링크 유입';
  return '유입 경로';
}

export function TrafficSessionInsight() {
  const { data, loading, error } = usePerformanceData();

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.top_grid}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} width="100%" height="104px" radius="10px" />
          ))}
        </div>
        <Skeleton width="100%" height="320px" radius="12px" />
      </section>
    );
  }

  const traffic = data.businessMetrics?.trafficSessions;
  const sessions = traffic?.sessions ?? data.rum.userJourney[0]?.sessions ?? 0;
  const visitors = traffic?.visitors;
  const confidence = traffic?.confidence;
  const period = traffic?.period ?? '기간 미설정';
  const source = traffic?.source ?? '내부 로그/주문 데이터 필요';
  const averageOrderValue = traffic?.averageOrderValue ?? 0;
  const basePurchaseSessions = data.rum.userJourney.at(-1)?.sessions ?? 0;
  const channels = data.businessMetrics?.acquisitionChannels ?? [];
  const devices = data.businessMetrics?.deviceSegments?.filter((device) => device.device !== 'Tablet') ?? [];
  const channelPurchases = channels.reduce((sum, channel) => sum + channel.purchases, 0);
  const devicePurchases = devices.reduce((sum, device) => sum + device.purchases, 0);
  const purchaseSessions = channelPurchases || devicePurchases || basePurchaseSessions;
  const conversionRate = data.businessMetrics?.conversionRate?.value ?? calcConversionRatePercent(purchaseSessions, sessions);
  const revenue = sumRevenue(channels) || sumRevenue(devices) || calcRevenue(purchaseSessions, averageOrderValue);
  const pagePerformance = data.rum.pagePerformance ?? [];
  const latestCollectedAt = data.rum.latestCollectedAt
    ? new Date(data.rum.latestCollectedAt).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const changeText =
    traffic?.changeRate != null
      ? `전월 대비 ${traffic.changeRate >= 0 ? '+' : ''}${traffic.changeRate}%`
      : '전월 대비 데이터 없음';
  const sourceLabel = confidence ? CONFIDENCE_LABEL[confidence] : '미연동';

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2>방문·세션 데이터</h2>
          <span>{period} 운영 성과</span>
        </div>
        <em>{sourceLabel} · {source}</em>
      </div>

      <div className={styles.top_grid}>
        <article className={styles.kpi_card}>
          <span className={styles.kpi_label}>방문 세션</span>
          <strong className={styles.kpi_value}>{formatCompactCount(sessions)}</strong>
          <span className={styles.kpi_sub}>{changeText}</span>
          <span className={styles.kpi_note}>
            1회 방문 = 보통 1세션 · {visitors != null ? `순방문자 ${formatCompactCount(visitors)}` : '순방문자 데이터 없음'}
          </span>
        </article>

        <article className={styles.kpi_card}>
          <span className={styles.kpi_label}>구매 횟수</span>
          <strong className={styles.kpi_value}>{formatCompactCount(purchaseSessions)}</strong>
          <span className={styles.kpi_sub}>구매 전환율(CVR) {formatPercent(conversionRate)}</span>
          <span className={styles.kpi_note}>구매 완료 횟수 / 방문 세션</span>
        </article>

        <article className={styles.kpi_card}>
          <span className={styles.kpi_label}>월 매출 기준</span>
          <strong className={styles.kpi_value}>{formatKrw(revenue)}</strong>
          <span className={styles.kpi_sub}>평균 주문 금액(AOV) {formatInteger(averageOrderValue)}원</span>
          <span className={styles.kpi_note}>구매 완료 × 평균 주문 금액</span>
        </article>

        <article className={styles.kpi_card}>
          <span className={styles.kpi_label}>최근 접속 기록</span>
          <strong className={styles.kpi_value}>{latestCollectedAt ?? "없음"}</strong>
          <span className={styles.kpi_sub}>{pagePerformance.length > 0 ? `${pagePerformance.length}개 페이지 경로` : "페이지 경로 데이터 없음"}</span>
          <span className={styles.kpi_note}>실제 사용자 접속 데이터 기준</span>
        </article>
      </div>

      <section className={styles.page_perf_panel}>
        <div className={styles.panel_head}>
          <div>
            <h3 className={styles.panel_title}>페이지 경로별 실제 로딩</h3>
            <p className={styles.panel_desc}>Swetrix 접속 기록 기준 페이지 경로 · 세션 · 평균 로딩 · p75 로딩</p>
          </div>
        </div>
        {pagePerformance.length > 0 ? (
          <div className={styles.page_perf_list}>
            {pagePerformance.map((page) => (
              <article key={page.path} className={styles.page_perf_row}>
                <strong>{page.path}</strong>
                <span>{formatCompactCount(page.sessions)} 세션</span>
                <span>평균 {formatInteger(page.avgPageLoad)}ms</span>
                <span>p75 {page.p75PageLoad != null ? `${formatInteger(page.p75PageLoad)}ms` : "-"}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty_state}>페이지 경로별 실제 로딩 데이터가 아직 연결되지 않았습니다.</div>
        )}
      </section>

      <div className={styles.content_grid}>
        <section className={styles.panel}>
          <div className={styles.panel_head}>
            <div>
              <h3 className={styles.panel_title}>유입 경로별 성과</h3>
              <p className={styles.panel_desc}>방문 세션 · 구매 횟수 · 구매 전환율(CVR) · 매출 · 평균 주문 금액(AOV)</p>
            </div>
          </div>

          <div className={styles.data_table_wrap}>
            <table className={styles.data_table}>
              <thead>
                <tr>
                  <th>유입 경로</th>
                  <th>방문 세션</th>
                  <th>구매 횟수</th>
                  <th>구매 전환율(CVR)</th>
                  <th>매출</th>
                  <th>평균 주문 금액(AOV)</th>
                  <th>초기 이탈률</th>
                  <th>성과 구분</th>
                </tr>
              </thead>
              <tbody>
                {channels.length > 0 ? (
                  channels.map((channel) => (
                    <tr key={channel.channel}>
                      <td>
                        <strong>{channel.channel}</strong>
                        <span>{getChannelSourceNote(channel.channel)}</span>
                      </td>
                      <td>{formatCompactCount(channel.sessions)}</td>
                      <td>{formatCompactCount(channel.purchases)}</td>
                      <td>{formatPercent(channel.conversionRate)}</td>
                      <td className={styles.revenue_value}>{formatKrw(channel.revenue)}</td>
                      <td>{formatInteger(channel.averageOrderValue)}원</td>
                      <td>{formatPercent(channel.bounceRate)}</td>
                      <td><em>{getChannelRole(channel)}</em></td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className={styles.empty_cell}>
                      유입 경로별 성과 데이터가 아직 연결되지 않았습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panel_head}>
            <div>
              <h3 className={styles.panel_title}>디바이스별 성과</h3>
              <p className={styles.panel_desc}>방문 세션 · 구매 횟수 · 구매 전환율(CVR) · 매출 · 초기 이탈률</p>
            </div>
          </div>

          <div className={styles.segment_list}>
            {devices.length > 0 ? (
              devices.map((device) => (
                <article key={device.device} className={styles.segment_card}>
                  <div>
                    <span>{DEVICE_LABEL[device.device]}</span>
                    <strong>{formatKrw(device.revenue)}</strong>
                    <em>{formatCompactCount(device.sessions)} 세션</em>
                  </div>
                  <div className={styles.segment_metrics}>
                    <span>구매 전환율(CVR) <strong>{formatPercent(device.conversionRate)}</strong></span>
                    <span>구매 횟수 <strong>{formatCompactCount(device.purchases)}</strong></span>
                    <span>초기 이탈률 <strong>{formatPercent(device.bounceRate)}</strong></span>
                  </div>
                </article>
              ))
            ) : (
              <div className={styles.empty_state}>디바이스별 성과 데이터가 아직 연결되지 않았습니다.</div>
            )}
          </div>

          <div className={styles.data_source_box}>
            <span>데이터 기준</span>
            <strong>{sourceLabel} · {period}</strong>
            <em>{source}</em>
          </div>
        </section>
      </div>

      <p className={styles.footnote}>
        채널·디바이스 성과는 내부 로그와 주문 데이터가 연결된 경우에만 표시합니다.
      </p>
    </section>
  );
}
