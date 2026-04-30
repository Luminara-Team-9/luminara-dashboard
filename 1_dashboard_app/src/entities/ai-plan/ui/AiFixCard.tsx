import type { AiFixPlan, FixPriority, FixEffort } from '@/shared/lib/types';
import styles from './AiFixCard.module.css';

const PRIORITY_LABEL: Record<FixPriority, string> = {
  critical: 'P0 CRITICAL',
  high:     'P1 HIGH',
  medium:   'P2 MEDIUM',
  low:      'P3 LOW',
};

const EFFORT_DOTS: Record<FixEffort, number> = {
  low: 1, medium: 2, high: 3,
};

const METRIC_LABEL: Record<string, string> = {
  lcp: 'LCP', cls: 'CLS', tbt: 'TBT',
  fcp: 'FCP', speedIndex: 'Speed Index', assetSize: 'Asset Size',
};

interface Props {
  plan: AiFixPlan;
}

export function AiFixCard({ plan }: Props) {
  const dots = EFFORT_DOTS[plan.effort];

  return (
    <article className={`${styles.card} ${styles[plan.priority]}`}>
      <div className={styles.top}>
        <span className={`${styles.priority} ${styles[`priority_${plan.priority}`]}`}>
          {PRIORITY_LABEL[plan.priority]}
        </span>
        <span className={styles.metric}>
          {METRIC_LABEL[plan.metricKey] ?? plan.metricKey}
        </span>
      </div>

      <h3 className={styles.title}>{plan.title}</h3>
      <p className={styles.desc}>{plan.description}</p>

      <div className={styles.bottom}>
        <span className={styles.impact}>{plan.estimatedImpact}</span>
        <span className={styles.effort}>
          작업량&nbsp;
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={i < dots ? styles.dot_on : styles.dot_off} />
          ))}
        </span>
      </div>
    </article>
  );
}
