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

function getTopRevenueChannel(channels: AcquisitionChannel[]): AcquisitionChannel | undefined {
  return [...channels].sort((a, b) => b.revenue - a.revenue)[0];
}

function getTopConversionDevice(devices: DeviceSegment[]): DeviceSegment | undefined {
  return [...devices].sort((a, b) => b.conversionRate - a.conversionRate)[0];
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

function buildMockChannels(sessions: number, purchases: number, averageOrderValue: number): AcquisitionChannel[] {
  const channelMix = [
    { channel: 'Organic Search', sessionRate: 0.4, purchaseRate: 0.42, bounceRate: 32.4 },
    { channel: 'Direct', sessionRate: 0.22, purchaseRate: 0.26, bounceRate: 28.9 },
    { channel: 'Paid Search', sessionRate: 0.16, purchaseRate: 0.12, bounceRate: 41.8 },
    { channel: 'Referral', sessionRate: 0.09, purchaseRate: 0.09, bounceRate: 35.6 },
    { channel: 'Social', sessionRate: 0.08, purchaseRate: 0.06, bounceRate: 46.5 },
    { channel: 'Email / Campaign', sessionRate: 0.05, purchaseRate: 0.05, bounceRate: 30.2 },
  ];

  return channelMix.map((item) => {
    const channelSessions = Math.round(sessions * item.sessionRate);
    const channelPurchases = Math.round(purchases * item.purchaseRate);
    const revenue = calcRevenue(channelPurchases, averageOrderValue);

    return {
      channel: item.channel,
      sessions: channelSessions,
      purchases: channelPurchases,
      revenue,
      conversionRate: calcConversionRatePercent(channelPurchases, channelSessions),
      bounceRate: item.bounceRate,
      averageOrderValue,
    };
  });
}

function buildMockDevices(sessions: number, purchases: number, averageOrderValue: number): DeviceSegment[] {
  const deviceMix: Array<{
    device: DeviceSegment['device'];
    sessionRate: number;
    purchaseRate: number;
    bounceRate: number;
  }> = [
    { device: 'Mobile', sessionRate: 0.71, purchaseRate: 0.62, bounceRate: 39.4 },
    { device: 'Desktop', sessionRate: 0.29, purchaseRate: 0.38, bounceRate: 26.4 },
  ];

  return deviceMix.map((item) => {
    const deviceSessions = Math.round(sessions * item.sessionRate);
    const devicePurchases = Math.round(purchases * item.purchaseRate);
    const revenue = calcRevenue(devicePurchases, averageOrderValue);

    return {
      device: item.device,
      sessions: deviceSessions,
      purchases: devicePurchases,
      revenue,
      conversionRate: calcConversionRatePercent(devicePurchases, deviceSessions),
      bounceRate: item.bounceRate,
      averageOrderValue,
    };
  });
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
  const confidence = traffic?.confidence ?? 'mock';
  const period = traffic?.period ?? '월간';
  const source = traffic?.source ?? '내부 로그 Mock';
  const averageOrderValue = traffic?.averageOrderValue ?? 0;
  const basePurchaseSessions = data.rum.userJourney.at(-1)?.sessions ?? 0;
  const channels =
    data.businessMetrics?.acquisitionChannels?.length
      ? data.businessMetrics.acquisitionChannels
      : buildMockChannels(sessions, basePurchaseSessions, averageOrderValue);
  const devices =
    data.businessMetrics?.deviceSegments?.length
      ? data.businessMetrics.deviceSegments.filter((device) => device.device !== 'Tablet')
      : buildMockDevices(sessions, basePurchaseSessions, averageOrderValue);
  const purchaseSessions =
    channels.reduce((sum, channel) => sum + channel.purchases, 0) || basePurchaseSessions;
  const conversionRate = data.businessMetrics?.conversionRate?.value ?? calcConversionRatePercent(purchaseSessions, sessions);
  const revenue = sumRevenue(channels) || calcRevenue(purchaseSessions, averageOrderValue);
  const topChannel = getTopRevenueChannel(channels);
  const topDevice = getTopConversionDevice(devices);

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div>
          <h2>방문·세션 데이터</h2>
          <span>{period} 운영 성과</span>
        </div>
        <em>{CONFIDENCE_LABEL[confidence]} · {source}</em>
      </div>

      <div className={styles.top_grid}>
        <article className={styles.kpi_card}>
          <span className={styles.kpi_label}>방문 세션</span>
          <strong className={styles.kpi_value}>{formatCompactCount(sessions)}</strong>
          <span className={styles.kpi_sub}>
            전월 대비 {traffic?.changeRate != null && traffic.changeRate >= 0 ? '+' : ''}{traffic?.changeRate ?? 0}%
          </span>
          <span className={styles.kpi_note}>1회 방문 = 보통 1세션 · 순방문자 {formatCompactCount(visitors)}</span>
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
          <span className={styles.kpi_label}>최고 매출 유입 경로</span>
          <strong className={styles.kpi_value}>{topChannel?.channel ?? '-'}</strong>
          <span className={styles.kpi_sub}>{topChannel ? formatKrw(topChannel.revenue) : '-'}</span>
          <span className={styles.kpi_note}>최고 전환 디바이스 {topDevice ? DEVICE_LABEL[topDevice.device] : '-'}</span>
        </article>
      </div>

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
                {channels.map((channel) => (
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
                ))}
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
            {devices.map((device) => (
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
            ))}
          </div>

          <div className={styles.data_source_box}>
            <span>데이터 기준</span>
            <strong>{CONFIDENCE_LABEL[confidence]} · {period}</strong>
            <em>{source}</em>
          </div>
        </section>
      </div>

      <p className={styles.footnote}>
        데이터 기준: Mock · 연동 대상: GA4, Swetrix, 서버 로그, 주문 데이터
      </p>
    </section>
  );
}
