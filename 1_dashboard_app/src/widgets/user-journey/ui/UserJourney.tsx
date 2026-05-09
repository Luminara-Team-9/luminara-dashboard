'use client';

import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { Skeleton } from '@/shared/ui';
import type { PageType } from '@/shared/lib/types';
import styles from './UserJourney.module.css';

function getPageLcp(
  pageMetrics: { brand: string; page: PageType; metrics: { lcp: { value: number; target: number } } }[],
  targetBrand: string,
  page: PageType,
): { value: number; target: number } | null {
  return pageMetrics.find(p => p.brand === targetBrand && p.page === page)?.metrics.lcp ?? null;
}

function lcpColor(value: number, target: number): string {
  if (value <= target)       return '#10b981';
  if (value <= target * 1.5) return '#f59e0b';
  return '#ef4444';
}

function dropoffColor(rate: number): string {
  if (rate >= 50) return '#ef4444';
  if (rate >= 30) return '#f59e0b';
  return '#94a3b8';
}

function fmtSessions(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000)  return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function UserJourney() {
  const { data, loading, error } = usePerformanceData();

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <div className={styles.header}>
          <Skeleton width="110px" height="18px" />
          <Skeleton width="120px" height="12px" />
        </div>
        <div className={styles.funnel}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i}>
              <div className={styles.step_row}>
                <Skeleton width="64px" height="14px" />
                <Skeleton width="100%" height="26px" radius="5px" />
                <Skeleton width="30px" height="12px" />
                <Skeleton width="46px" height="20px" radius="5px" />
              </div>
              {i < 5 && (
                <div className={styles.connector}>
                  <Skeleton width="70px" height="12px" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  }

  const { userJourney } = data.rum;
  const maxSessions = userJourney[0]?.sessions ?? 1;
  const monthlyRevenue = data.executiveSummary.baselineAnnualRevenue / 12;
  const targetBrand = data.benchmarks.find(b => b.isTarget)?.brand ?? '';
  const pageMetrics = data.pageMetrics as {
    brand: string; page: PageType; metrics: { lcp: { value: number; target: number } };
  }[];

  // 전체 전환율 (첫 → 마지막)
  const totalConvRate = userJourney.length > 1
    ? ((userJourney[userJourney.length - 1].sessions / maxSessions) * 100).toFixed(1)
    : null;

  return (
    <section className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.header_left}>
          <h2 className={styles.title}>사용자 여정</h2>
          <span className={styles.subtitle}>이탈률 · LCP 성능 연계</span>
        </div>
        {totalConvRate && (
          <div className={styles.conv_rate}>
            <span className={styles.conv_label}>전환율</span>
            <span className={styles.conv_value}>{totalConvRate}%</span>
          </div>
        )}
      </div>

      <div className={styles.funnel}>
        {userJourney.map((step, i) => {
          const ratio    = step.sessions / maxSessions;
          const lcpData  = getPageLcp(pageMetrics, targetBrand, step.pageType as PageType);
          const nextStep = userJourney[i + 1];
          const isLast   = i === userJourney.length - 1;
          const barAccent = lcpData ? lcpColor(lcpData.value, lcpData.target) : '#3b82f6';

          return (
            <div key={step.step}>
              {/* ── 퍼널 스텝 행 ── */}
              <div className={styles.step_row}>
                {/* 레이블 */}
                <div className={styles.step_label}>
                  <span className={styles.step_num}>{i + 1}</span>
                  <span className={styles.step_name}>{step.step}</span>
                </div>

                {/* 퍼널 막대 */}
                <div className={styles.bar_area}>
                  <div
                    className={styles.bar}
                    style={{
                      width: `${ratio * 100}%`,
                      background: `linear-gradient(90deg, #1a2d4a 0%, ${barAccent}55 100%)`,
                      borderRight: `3px solid ${barAccent}`,
                    }}
                  />
                </div>

                {/* 세션 수 */}
                <span className={styles.sessions}>{fmtSessions(step.sessions)}</span>

                {/* LCP 뱃지 */}
                {lcpData ? (
                  <span
                    className={styles.lcp_badge}
                    style={{
                      color:      lcpColor(lcpData.value, lcpData.target),
                      background: `${lcpColor(lcpData.value, lcpData.target)}18`,
                    }}
                    title={`LCP 목표: ${lcpData.target}s`}
                  >
                    {lcpData.value}s
                  </span>
                ) : (
                  <span className={styles.lcp_none}>—</span>
                )}
              </div>

              {/* ── 이탈률 연결부 ── */}
              {!isLast && nextStep && nextStep.dropoffRate > 0 && (() => {
                const dropped = step.sessions * (nextStep.dropoffRate / 100);
                const lossW = (dropped / maxSessions) * monthlyRevenue;
                const lossStr = lossW >= 100_000_000
                  ? `~₩${(lossW / 100_000_000).toFixed(1)}억`
                  : `~₩${Math.round(lossW / 10_000_000)}천만`;
                return (
                  <div className={styles.connector}>
                    <span className={styles.connector_line} />
                    <span
                      className={styles.dropoff_badge}
                      style={{ color: dropoffColor(nextStep.dropoffRate) }}
                    >
                      ↓ {nextStep.dropoffRate.toFixed(1)}% 이탈
                    </span>
                    <span className={styles.loss_badge}>{lossStr}/월</span>
                    <span className={styles.connector_line} />
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <p className={styles.footnote}>
        막대 우측 색상 = LCP 성능 (초록 목표달성 / 주황 경계 / 빨강 미달) · LCP 기준 Decathlon
      </p>
    </section>
  );
}
