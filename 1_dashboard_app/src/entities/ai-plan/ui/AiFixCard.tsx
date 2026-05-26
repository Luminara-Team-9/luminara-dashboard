'use client';

import { useEffect, useState } from 'react';
import { requestAiActionApply } from '@/shared/api/aiActionClient';
import type { AiActionApplyStatus, AiFixPlan, FixEffort, FixPriority } from '@/shared/lib/types';
import styles from './AiFixCard.module.css';

const PRIORITY_LABEL: Record<FixPriority, string> = {
  critical: '긴급',
  high: '높음',
  medium: '중간',
  low: '낮음',
};

const EFFORT_DOTS: Record<FixEffort, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const METRIC_LABEL: Record<string, string> = {
  lcp: '첫 화면 표시(LCP)',
  cls: '화면 안정성(CLS)',
  inp: '클릭 반응(INP)',
  tbt: '스크립트 부담(TBT)',
  fcp: '첫 콘텐츠 표시(FCP)',
  speedIndex: '화면 완성 속도(Speed Index)',
  assetSize: '리소스 크기(Asset Size)',
};

function cleanActionTitle(value: string): string {
  return value
    .replace(/^\[(?:P\d\s*)?[^\]]+\]\s*/i, '')
    .replace(/^P\d\s*(?:Critical|High|Medium|Low|긴급|높음|중간|낮음)?\s*[-:]?\s*/i, '')
    .trim();
}

interface DecisionView {
  problem: string;
  area: string;
  reason: string;
  evidence: string;
  fix?: string;
  codeTitle?: string;
  beforeCode?: string;
  afterCode?: string;
  conclusion: string;
}

function buildDecisionView(plan: AiFixPlan): DecisionView {
  return {
    problem: cleanActionTitle(plan.decision?.problem ?? plan.title),
    area: plan.decision?.area ?? METRIC_LABEL[plan.metricKey] ?? plan.metricKey,
    reason: plan.decision?.reason ?? plan.description,
    evidence: plan.decision?.evidence ?? plan.estimatedImpact,
    fix: plan.decision?.fix,
    codeTitle: plan.decision?.codeTitle,
    beforeCode: plan.decision?.beforeCode,
    afterCode: plan.decision?.afterCode,
    conclusion: plan.decision?.conclusion ?? plan.estimatedImpact,
  };
}

function getButtonLabel(status: AiActionApplyStatus | null, applying: boolean): string {
  if (applying) return '요청 중';
  if (status === 'queued') return '요청 전송됨';
  if (status === 'running') return '진행 중';
  if (status === 'completed') return '적용 완료';
  if (status === 'pending-connection') return '연결 대기';
  return '적용하기';
}

interface Props {
  plan: AiFixPlan;
}

export function AiFixCard({ plan }: Props) {
  const storageKey = `luminara_action_status_${plan.id}`;
  const [detailOpen, setDetailOpen] = useState(false);
  const [applyStatus, setApplyStatus] = useState<AiActionApplyStatus | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const dots = EFFORT_DOTS[plan.effort];
  const decision = buildDecisionView(plan);
  const hasCodePatch = Boolean(decision.beforeCode || decision.afterCode);
  const requestLocked = applyStatus === 'queued' || applyStatus === 'running' || applyStatus === 'completed';

  useEffect(() => {
    if (plan.remediationStatus) {
      setApplyStatus(plan.remediationStatus);
      setApplyMessage(plan.remediationMessage ?? null);
      return;
    }

    const saved = localStorage.getItem(storageKey) as AiActionApplyStatus | null;
    setApplyStatus(saved);
  }, [plan.remediationMessage, plan.remediationStatus, storageKey]);

  const handleApply = async () => {
    if (applying || requestLocked) return;

    setApplying(true);
    setApplyMessage(null);

    try {
      const response = await requestAiActionApply({
        actionId: plan.id,
        requestedAt: new Date().toISOString(),
        source: 'dashboard',
        action: 'apply',
        planSnapshot: {
          id: plan.id,
          brand: plan.brand,
          metricKey: plan.metricKey,
          title: plan.title,
          priority: plan.priority,
          estimatedImpact: plan.estimatedImpact,
          decision: plan.decision,
        },
      });

      setApplyStatus(response.status);
      setApplyMessage(response.message);

      if (response.accepted) {
        localStorage.setItem(storageKey, response.status);
      }
    } catch (error) {
      setApplyStatus('failed');
      setApplyMessage(error instanceof Error ? error.message : 'AI 개선 요청을 보낼 수 없습니다.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <article
        className={`${styles.card} ${styles[plan.priority]}`}
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') setDetailOpen(true);
        }}
      >
        <div className={styles.top}>
          <span className={`${styles.priority} ${styles[`priority_${plan.priority}`]}`}>
            {PRIORITY_LABEL[plan.priority]}
          </span>
          <span className={styles.metric}>
            {METRIC_LABEL[plan.metricKey] ?? plan.metricKey}
          </span>
        </div>

        <h3 className={styles.title}>{decision.problem}</h3>
        <p className={styles.desc}>{decision.reason}</p>

        <div className={styles.link_box}>
          <strong>{decision.area}</strong>
          <p>{decision.conclusion}</p>
        </div>

        <div className={styles.bottom}>
          <span className={styles.impact}>자세히 보기</span>
          <div className={styles.bottom_right}>
            <span className={styles.effort}>
              작업량&nbsp;
              {Array.from({ length: 3 }, (_, index) => (
                <span key={index} className={index < dots ? styles.dot_on : styles.dot_off} />
              ))}
            </span>
            <button
              className={requestLocked ? styles.btn_applied : styles.btn_apply}
              disabled={requestLocked || applying}
              onClick={(event) => {
                event.stopPropagation();
                setDetailOpen(true);
              }}
            >
              자세히 보기
            </button>
          </div>
        </div>
      </article>

      {detailOpen && (
        <div className={styles.overlay} onClick={() => setDetailOpen(false)}>
          <div className={styles.detail_modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.detail_head}>
              <div>
                <p className={styles.modal_label}>{METRIC_LABEL[plan.metricKey] ?? plan.metricKey}</p>
                <h3 className={styles.detail_title}>{decision.problem}</h3>
              </div>
              <button className={styles.modal_close} onClick={() => setDetailOpen(false)}>닫기</button>
            </div>

            <div className={styles.detail_grid}>
              <section className={styles.detail_section}>
                <span className={styles.section_label}>문제</span>
                <p>{decision.reason}</p>
              </section>
              <section className={styles.detail_section}>
                <span className={styles.section_label}>근거</span>
                <p>{decision.evidence}</p>
                {plan.decision?.source && <em>{plan.decision.source}</em>}
              </section>
              <section className={styles.detail_section}>
                <span className={styles.section_label}>해결책</span>
                {decision.fix ? (
                  <p>{decision.fix}</p>
                ) : (
                  <p>AI 코드 수정안이 연결되면 이 영역에 해결 방법을 표시합니다.</p>
                )}
                {hasCodePatch && (
                  <div className={styles.code_panel}>
                    <strong>{decision.codeTitle ?? 'AI 코드 수정안'}</strong>
                    <div className={styles.code_columns}>
                      {decision.beforeCode && (
                        <div>
                          <span>Before</span>
                          <pre><code>{decision.beforeCode}</code></pre>
                        </div>
                      )}
                      {decision.afterCode && (
                        <div>
                          <span>After</span>
                          <pre><code>{decision.afterCode}</code></pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
              <section className={styles.detail_section}>
                <span className={styles.section_label}>결론</span>
                <p>{decision.conclusion}</p>
                {plan.decision?.generatedAt && <em>생성 시각: {plan.decision.generatedAt}</em>}
              </section>
            </div>

            {applyMessage && (
              <p className={`${styles.apply_notice} ${applyStatus === 'failed' ? styles.apply_notice_error : ''}`}>
                {applyMessage}
              </p>
            )}

            <div className={styles.detail_actions}>
              <button className={styles.btn_cancel} onClick={() => setDetailOpen(false)}>나중에</button>
              <button
                className={styles.btn_confirm}
                disabled={requestLocked || applying}
                onClick={handleApply}
              >
                {getButtonLabel(applyStatus, applying)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
