'use client';

import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { Skeleton } from '@/shared/ui';
import styles from './UserJourney.module.css';

export function UserJourney() {
  const { data, loading, error } = usePerformanceData();

  if (error) return <p className={styles.error}>{error}</p>;
  if (loading || !data) {
    return (
      <section className={styles.wrapper}>
        <Skeleton width="110px" height="18px" />
        <div className={styles.scroll}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid #1a2234' }}>
              <Skeleton width="20px" height="20px" radius="50%" />
              <Skeleton width="64px" height="14px" />
              <Skeleton width="56px" height="14px" />
              <Skeleton width="80px" height="10px" radius="3px" />
              <Skeleton width="52px" height="14px" />
              <Skeleton width="44px" height="14px" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const { userJourney } = data.rum;
  const maxSessions = userJourney[0]?.sessions ?? 1;

  return (
    <section className={styles.wrapper}>
      <h2 className={styles.title}>사용자 여정</h2>

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>단계</th>
              <th className={styles.th}>트래픽</th>
              <th className={styles.th_bar}>비율</th>
              <th className={styles.th}>이탈률</th>
              <th className={styles.th}>평균 체류</th>
            </tr>
          </thead>
          <tbody>
            {userJourney.map((step, i) => {
              const ratio = step.sessions / maxSessions;
              const isHighDrop = step.dropoffRate > 50;
              const isLastStep = i === userJourney.length - 1;

              return (
                <tr key={step.step} className={styles.row}>
                  {/* 단계명 */}
                  <td className={styles.td_step}>
                    <span className={styles.step_num}>{i + 1}</span>
                    {step.step}
                  </td>

                  {/* 트래픽 수 */}
                  <td className={styles.td}>
                    <span className={styles.sessions}>
                      {step.sessions.toLocaleString()}
                    </span>
                  </td>

                  {/* 비율 바 */}
                  <td className={styles.td_bar}>
                    <div className={styles.bar_track}>
                      <div
                        className={styles.bar_fill}
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </div>
                  </td>

                  {/* 이탈률 */}
                  <td className={styles.td}>
                    {isLastStep || step.dropoffRate === 0 ? (
                      <span className={styles.dropoff_none}>—</span>
                    ) : (
                      <span className={`${styles.dropoff} ${isHighDrop ? styles.dropoff_high : styles.dropoff_mid}`}>
                        ↓ {step.dropoffRate.toFixed(1)}%
                      </span>
                    )}
                  </td>

                  {/* 체류 시간 */}
                  <td className={styles.td}>
                    {step.avgTime > 0 ? (
                      <span className={styles.time}>{step.avgTime}s</span>
                    ) : (
                      <span className={styles.dropoff_none}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
