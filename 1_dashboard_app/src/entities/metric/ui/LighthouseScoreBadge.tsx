import type { BenchmarkScores } from '../model/types';
import { getMetricStatus } from '../lib/getMetricStatus';
import styles from './LighthouseScoreBadge.module.css';

interface Props {
  brand: string;
  scores: BenchmarkScores;
  isTarget?: boolean;
}

export function LighthouseScoreBadge({ brand, scores, isTarget = false }: Props) {
  const status = getMetricStatus(scores.lighthouse, scores.target_lighthouse, true);

  return (
    <div className={`${styles.badge} ${styles[status]} ${isTarget ? styles.target_brand : ''}`}>
      <span className={styles.score}>{scores.lighthouse}</span>

      <div className={styles.info}>
        <div className={styles.brand_row}>
          <span className={styles.brand}>{brand}</span>
          {isTarget && <span className={styles.target_label}>우리 브랜드</span>}
        </div>
        <span className={styles.target_score}>목표: {scores.target_lighthouse}점</span>
      </div>
    </div>
  );
}
