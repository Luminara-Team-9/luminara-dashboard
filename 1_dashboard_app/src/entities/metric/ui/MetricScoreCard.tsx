import type { MetricItem, MetricStatus } from '../model/types';
import { getMetricStatus } from '../lib/getMetricStatus';
import styles from './MetricScoreCard.module.css';

interface Props {
  metric: MetricItem;
}

const STATUS_LABEL: Record<MetricStatus, string> = {
  pass: '달성',
  warning: '근접',
  fail: '미달',
};

export function MetricScoreCard({ metric }: Props) {
  const status = getMetricStatus(metric.value, metric.target);

  return (
    <div className={`${styles.card} ${styles[status]}`}>
      <div className={styles.header}>
        <span className={styles.label}>{metric.label}</span>
        <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>

      <p className={styles.value}>
        {metric.value}
        <span className={styles.unit}>{metric.unit}</span>
      </p>

      <p className={styles.target}>
        목표: {metric.target} {metric.unit}
      </p>
    </div>
  );
}
