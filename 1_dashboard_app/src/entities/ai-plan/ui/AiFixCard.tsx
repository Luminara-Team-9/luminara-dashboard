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
  inp: '스크립트 부담(TBT)',
  tbt: '스크립트 부담(TBT)',
  fcp: '첫 콘텐츠 표시(FCP)',
  speedIndex: '화면 완성 속도(Speed Index)',
  assetSize: '리소스 크기(Asset Size)',
};

const PATCH_STATUS_LABEL: Record<string, string> = {
  pending_review: '검토 대기',
  requires_human_review: '검토 필요',
  queued: '대기 중',
  approved_to_apply: '승인됨',
  applying: '적용 중',
  patch_applied: '패치 적용됨',
  build_testing: '빌드 검증 중',
  pushed: '브랜치 push 완료',
  pr_merged: 'PR merge 완료',
  merged: 'merge 완료',
  completed: '완료',
  rejected: '거절됨',
  apply_failed: '적용 실패',
  build_failed: '빌드 실패',
  push_failed: 'push 실패',
  failed: '실패',
};

const BUILD_STATUS_LABEL: Record<string, string> = {
  not_run: '빌드 미실행',
  passed: '빌드 통과',
  failed: '빌드 실패',
};

const FAILED_PATCH_STATUSES = new Set(['apply_failed', 'build_failed', 'push_failed', 'failed', 'rejected']);
const COMPLETED_PATCH_STATUSES = new Set(['pushed', 'completed', 'applied', 'pr_merged', 'merged']);

function normalizeStatus(value?: string): string {
  return String(value ?? '').toLowerCase();
}

function buildPatchDetail(plan: AiFixPlan): string | null {
  const history = plan.lastHistoryEvent;
  const reason = plan.rejectionReason || history?.error_message;
  if (reason) return reason;
  if (history?.worker_id) return 'worker: ' + history.worker_id;
  if (plan.buildStatus) return BUILD_STATUS_LABEL[normalizeStatus(plan.buildStatus)] ?? plan.buildStatus;
  return null;
}

function getPlainPatchStatusLabel(status: string): string {
  if (!status || status === 'pending_review' || status === 'requires_human_review') return '검토 필요';
  if (status === 'queued' || status === 'approved_to_apply') return '대기';
  if (status === 'applying' || status === 'patch_applied' || status === 'local_test_running') return '적용중';
  if (status === 'build_testing') return '빌드중';
  if (status === 'pr_merged' || status === 'merged') return 'merge 완료';
  if (COMPLETED_PATCH_STATUSES.has(status)) return '적용됨';
  if (status === 'rejected') return '거절됨';
  if (FAILED_PATCH_STATUSES.has(status) || status === 'local_test_failed') return '실패';
  return PATCH_STATUS_LABEL[status] ?? status;
}

function getLocalApplyStatusLabel(status: AiActionApplyStatus | null, applying: boolean): string | null {
  if (applying) return "대기";
  if (status === "approval-pending" || status === "queued") return "대기";
  if (status === "running") return "적용중";
  if (status === "completed") return "적용됨";
  if (status === "failed") return "실패";
  if (status === "rejected") return "거절됨";
  return null;
}

function formatDateTime(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds?: number): string | null {
  if (seconds === undefined || !Number.isFinite(seconds)) return null;
  if (seconds < 60) return seconds + "초";
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? minutes + "분 " + restSeconds + "초" : minutes + "분";
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? hours + "시간 " + restMinutes + "분" : hours + "시간";
}

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
  if (status === 'approval-ready') return '승인 준비됨';
  if (status === 'approval-pending') return '승인됨';
  if (status === 'queued') return '요청 전송됨';
  if (status === 'running') return '진행 중';
  if (status === 'completed') return '적용 완료';
  if (status === 'rejected') return '거절됨';
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
  const patchStatus = normalizeStatus(plan.patchStatus);
  const patchStatusLabel = patchStatus ? getPlainPatchStatusLabel(patchStatus) : null;
  const patchDetail = buildPatchDetail(plan);
  const auditMeasuredAt = formatDateTime(plan.audit?.measuredAt);
  const applyStartedAt = formatDateTime(plan.applyTiming?.startedAt);
  const applyCompletedAt = formatDateTime(plan.applyTiming?.completedAt);
  const applyDuration = formatDuration(plan.applyTiming?.durationSeconds);
  const localStatusLabel = getLocalApplyStatusLabel(applyStatus, applying);
  const isManualOnly = plan.autoApplicable === false;
  const patchCompleted = COMPLETED_PATCH_STATUSES.has(patchStatus);
  const displayStatusLabel = isManualOnly ? '수동 검토' : patchCompleted ? patchStatusLabel : localStatusLabel ?? patchStatusLabel;
  const displayStatusFailed = FAILED_PATCH_STATUSES.has(patchStatus) || applyStatus === "failed" || applyStatus === "rejected";
  const displayStatusCompleted = patchCompleted || applyStatus === "completed";
  const requestLocked =
    isManualOnly ||
    applyStatus === 'approval-pending' ||
    applyStatus === 'queued' ||
    applyStatus === 'running' ||
    applyStatus === 'completed' ||
    COMPLETED_PATCH_STATUSES.has(patchStatus);

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
          autoApplicable: plan.autoApplicable,
          changeCount: plan.changeCount,
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
          <span className={isManualOnly ? styles.manual_badge : styles.apply_badge}>
            {isManualOnly ? '수동 검토' : '적용 가능'}
          </span>
        </div>

        <h3 className={styles.title}>{decision.problem}</h3>
        <p className={styles.desc}>{decision.reason}</p>

        <div className={styles.link_box}>
          <strong>{decision.area}</strong>
          <p>{decision.conclusion}</p>
        </div>

        {displayStatusLabel && (
          <p className={styles.status_line + (displayStatusFailed ? ' ' + styles.status_line_error : displayStatusCompleted ? ' ' + styles.status_line_success : '')}>
            상태 - {displayStatusLabel}
          </p>
        )}

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
                {(plan.audit?.score !== undefined || plan.audit?.afterScore !== undefined || auditMeasuredAt || plan.audit?.url) && (
                  <div className={styles.audit_summary}>
                    <strong>LHCI 점수 기준</strong>
                    {plan.audit?.score !== undefined && <span>생성 당시 {plan.audit.score}점</span>}
                    {plan.audit?.afterScore !== undefined && <span>적용 후 {plan.audit.afterScore}점</span>}
                    {plan.audit?.delta !== undefined && <span className={plan.audit.delta >= 0 ? styles.score_delta_good : styles.score_delta_bad}>점수 변동 {plan.audit.delta >= 0 ? "+" : ""}{plan.audit.delta}점</span>}
                    {auditMeasuredAt && <span>측정 시각 {auditMeasuredAt}</span>}
                    {plan.audit?.url && <em>{plan.audit.url}</em>}
                  </div>
                )}
              </section>
              <section className={`${styles.detail_section} ${styles.solution_section}`}>
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

            {displayStatusLabel && (
              <section className={styles.status_panel}>
                <span className={styles.section_label}>적용 진행 상태</span>
                <p className={styles.status_line + (displayStatusFailed ? ' ' + styles.status_line_error : displayStatusCompleted ? ' ' + styles.status_line_success : '')}>
                  상태 - {displayStatusLabel}
                </p>
                {(applyStartedAt || applyCompletedAt || applyDuration) && (
                  <div className={styles.timing_summary}>
                    {applyDuration && <strong>승인부터 완료까지 {applyDuration}</strong>}
                    {applyStartedAt && <span>승인 {applyStartedAt}</span>}
                    {applyCompletedAt && <span>완료 {applyCompletedAt}</span>}
                  </div>
                )}
                {patchDetail && (
                  <div className={styles.status_detail_box}>
                    <pre>{patchDetail}</pre>
                  </div>
                )}
              </section>
            )}

            {applyMessage && (
              <p className={`${styles.apply_notice} ${(applyStatus === 'failed' || applyStatus === 'rejected') ? styles.apply_notice_error : ''}`}>
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
                {isManualOnly ? '수동 검토' : getButtonLabel(applyStatus, applying)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
