'use client';

import { useState } from 'react';
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applied, setApplied]         = useState(false);
  const dots = EFFORT_DOTS[plan.effort];

  return (
    <>
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
          <div className={styles.bottom_right}>
            <span className={styles.effort}>
              작업량&nbsp;
              {Array.from({ length: 3 }, (_, i) => (
                <span key={i} className={i < dots ? styles.dot_on : styles.dot_off} />
              ))}
            </span>
            <button
              className={applied ? styles.btn_applied : styles.btn_apply}
              disabled={applied}
              onClick={() => !applied && setConfirmOpen(true)}
            >
              {applied ? '✓ 적용됨' : '브랜치 반영'}
            </button>
          </div>
        </div>
      </article>

      {confirmOpen && (
        <div className={styles.overlay} onClick={() => setConfirmOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <p className={styles.modal_label}>Human-in-the-Loop 승인 요청</p>
            <h3 className={styles.modal_title}>{plan.title}</h3>
            <p className={styles.modal_body}>
              이 수정사항을 현재 작업 브랜치에 반영합니다.<br />
              적용 후 팀 리뷰 및 머지를 권장합니다.
            </p>
            <div className={styles.modal_meta}>
              <span className={`${styles.priority} ${styles[`priority_${plan.priority}`]}`}>
                {PRIORITY_LABEL[plan.priority]}
              </span>
              <span className={styles.impact}>{plan.estimatedImpact}</span>
            </div>
            <div className={styles.modal_actions}>
              <button className={styles.btn_cancel} onClick={() => setConfirmOpen(false)}>취소</button>
              <button
                className={styles.btn_confirm}
                onClick={() => { setApplied(true); setConfirmOpen(false); }}
              >
                확인 · 적용
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
