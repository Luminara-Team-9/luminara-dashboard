'use client';

import { useState } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { estimateCarbonSaving } from '@/shared/lib/estimationFormulas';
import { Skeleton } from '@/shared/ui';
import type { GlobalStatus, MetricKey, PerformanceApiResponse } from '@/shared/lib/types';
import styles from './ExecutiveSummary.module.css';

const STATUS_META: Record<GlobalStatus, { label: string; color: string }> = {
  optimal: { label: '안정', color: '#10b981' },
  'needs-improvement': { label: '개선 필요', color: '#b45309' },
  critical: { label: '위험', color: '#ef4444' },
};

interface CheckItem {
  id: string;
  category: string;
  label: string;
  status: 'pass' | 'fail' | 'unknown';
  detail: string;
}

function ScoreArc({ score, color }: { score: number; color: string }) {
  const radius = 20;
  const center = 26;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;

  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="#d7dee8" strokeWidth="4.5" />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="4.5"
        strokeDasharray={`${filled} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x={center} y={center + 1} textAnchor="middle" dominantBaseline="middle" fill="#111827" fontSize="13" fontWeight="800">
        {score}
      </text>
    </svg>
  );
}

function formatTransferKb(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1024) return (Math.round((value / 1024) * 10) / 10) + "MB";
  return Math.round(value).toLocaleString("ko-KR") + "KB";
}

function buildChecklist(data: PerformanceApiResponse): CheckItem[] {
  const target = data.benchmarks.find((benchmark) => benchmark.isTarget);
  const competitors = data.benchmarks.filter((benchmark) => !benchmark.isTarget);
  const metrics = target?.metrics;
  const resource = target?.resource;
  const technicalSeo = target?.technicalSeo;
  const checklist: CheckItem[] = [];

  const toStatus = (value: boolean | undefined): CheckItem["status"] => {
    if (typeof value !== "boolean") return "unknown";
    return value ? "pass" : "fail";
  };
  const add = (item: CheckItem | false | null | undefined) => {
    if (item) checklist.push(item);
  };
  const hasMetric = (key: MetricKey) => {
    const metric = metrics?.[key];
    return Boolean(metric && metric.available !== false && Number.isFinite(metric.value));
  };
  const metricStatus = (key: MetricKey) => {
    if (!metrics || !hasMetric(key)) return undefined;
    return metrics[key].value <= metrics[key].target;
  };
  const addMetricCheck = (id: string, key: MetricKey, label: string, detail: string) => {
    if (!hasMetric(key)) return;
    add({ id, category: "Core Web Vitals", label, status: toStatus(metricStatus(key)), detail });
  };
  const competitorAverage = (key: MetricKey) => {
    const values = competitors
      .map((benchmark) => benchmark.metrics[key])
      .filter((metric) => metric && metric.available !== false && Number.isFinite(metric.value))
      .map((metric) => metric.value);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  const beatCompetitors = (key: MetricKey) => {
    if (!metrics || !hasMetric(key)) return undefined;
    const avg = competitorAverage(key);
    return avg == null ? undefined : metrics[key].value < avg;
  };
  const addTechnicalCheck = (id: string, label: string, value: boolean | undefined, detail: string) => {
    if (typeof value !== "boolean") return;
    add({ id, category: "Lighthouse 감사", label, status: toStatus(value), detail });
  };

  addMetricCheck("cwv-lcp", "lcp", "LCP <= 2.5s", "주요 콘텐츠가 보이는 속도입니다. 사용자가 처음 느끼는 로딩 경험과 연결됩니다.");
  addMetricCheck("cwv-cls", "cls", "CLS <= 0.1", "화면이 갑자기 밀리는 정도입니다. 구매 버튼 오클릭과 사용 불편을 줄이는 지표입니다.");
  addMetricCheck("cwv-tbt", "tbt", "TBT <= 200ms", "브라우저가 오래 멈춰 있는 시간입니다. JavaScript 부담과 반응성 문제를 찾습니다.");
  addMetricCheck("cwv-fcp", "fcp", "FCP <= 1.8s", "첫 콘텐츠가 보이는 시간입니다. 방문자가 빈 화면을 보는 시간을 줄입니다.");
  addMetricCheck("cwv-si", "speedIndex", "Speed Index <= 3.4s", "화면이 시각적으로 완성되는 속도입니다. 체감 로딩 속도 판단에 씁니다.");
  addMetricCheck("cwv-inp", "inp", "TBT <= 200ms", "INP를 안정적으로 수집할 수 없어 TBT로 반응성 부담을 대체 판단합니다.");

  if (target) {
    add({ id: "lh-score", category: "Lighthouse 감사", label: "성능 점수 >= 90", status: toStatus(target.scores.lighthouse >= 90), detail: "LHCI에서 수집한 Lighthouse 성능 점수입니다." });
    add({ id: "lh-seo", category: "Lighthouse 감사", label: "SEO 점수 >= 90", status: toStatus(target.scores.seo >= 90), detail: "Lighthouse SEO 감사 결과입니다." });
  }

  addTechnicalCheck("lh-title", "문서 제목 존재", technicalSeo?.title, "Lighthouse document-title 감사 결과입니다.");
  addTechnicalCheck("lh-meta", "메타 설명 존재", technicalSeo?.metaDescription, "Lighthouse meta-description 감사 결과입니다.");
  addTechnicalCheck("lh-viewport", "모바일 viewport 설정", technicalSeo?.mobileViewport, "Lighthouse viewport 감사 결과입니다.");

  if (resource?.totalWeightKb !== undefined && metrics?.assetSize) {
    add({ id: "res-total", category: "리소스", label: "총 전송량 목표 이하", status: toStatus(metrics.assetSize.value <= metrics.assetSize.target), detail: "Lighthouse total-byte-weight 기준으로 초기 전송량을 판단합니다." });
  }
  if (resource?.requestCount !== undefined) {
    add({ id: "res-req", category: "리소스", label: "요청 수 80개 이하", status: toStatus(resource.requestCount <= 80), detail: "Lighthouse network-requests 기준 요청 수입니다." });
  }
  if (resource?.jsKb !== undefined && resource.jsKb > 0) {
    add({ id: "res-js", category: "리소스", label: "JS 번들 < 300KB", status: toStatus(resource.jsKb < 300), detail: "세부 JS 크기 데이터가 제공될 때만 판단합니다." });
  }
  if (resource?.cssKb !== undefined && resource.cssKb > 0) {
    add({ id: "res-css", category: "리소스", label: "CSS 번들 < 100KB", status: toStatus(resource.cssKb < 100), detail: "세부 CSS 크기 데이터가 제공될 때만 판단합니다." });
  }
  if (resource?.imageKb !== undefined && resource.imageKb > 0) {
    add({ id: "res-img", category: "리소스", label: "이미지 전송량 < 600KB", status: toStatus(resource.imageKb < 600), detail: "세부 이미지 크기 데이터가 제공될 때만 판단합니다." });
  }

  add({ id: "mon-rum", category: "모니터링", label: "RUM 세션 데이터 수집", status: toStatus(data.rum.userJourney.length > 0 || data.rum.regionalData.length > 0), detail: "Swetrix 기반 실사용자 성능과 행동 데이터가 들어오는지 확인합니다." });
  add({ id: "mon-lhci", category: "모니터링", label: "Lighthouse 측정 갱신", status: toStatus(Boolean(data.businessMetrics.performanceAudit?.latestMeasuredAt)), detail: "LHCI 측정 결과가 대시보드 성능 점수에 연결되어 있는지 확인합니다." });

  if (competitors.length > 0) {
    add({ id: "cmp-lcp", category: "경쟁사 대비", label: "LCP 경쟁사 평균 이하", status: toStatus(beatCompetitors("lcp")), detail: "경쟁사 대비 첫 화면 로딩 경쟁력을 확인합니다." });
    add({ id: "cmp-cls", category: "경쟁사 대비", label: "CLS 경쟁사 평균 이하", status: toStatus(beatCompetitors("cls")), detail: "경쟁사 대비 화면 안정성을 비교합니다." });
    add({ id: "cmp-tbt", category: "경쟁사 대비", label: "TBT 경쟁사 평균 이하", status: toStatus(beatCompetitors("tbt")), detail: "경쟁사 대비 JavaScript 부담을 비교합니다." });
    add({ id: "cmp-fcp", category: "경쟁사 대비", label: "FCP 경쟁사 평균 이하", status: toStatus(beatCompetitors("fcp")), detail: "경쟁사 대비 첫 콘텐츠 표시 속도를 비교합니다." });
    add({ id: "cmp-si", category: "경쟁사 대비", label: "Speed Index 경쟁사 평균 이하", status: toStatus(beatCompetitors("speedIndex")), detail: "경쟁사 대비 체감 완성 속도를 비교합니다." });
    add({ id: "cmp-ast", category: "경쟁사 대비", label: "전송량 경쟁사 평균 이하", status: toStatus(beatCompetitors("assetSize")), detail: "경쟁사 대비 리소스 효율을 비교합니다." });
    const competitorScores = competitors.map((benchmark) => benchmark.scores.lighthouse).filter((value) => Number.isFinite(value));
    if (target && competitorScores.length > 0) {
      const avgScore = competitorScores.reduce((sum, value) => sum + value, 0) / competitorScores.length;
      add({ id: "cmp-scr", category: "경쟁사 대비", label: "성능 점수 경쟁사 평균 이상", status: toStatus(target.scores.lighthouse >= avgScore), detail: "LHCI Lighthouse 성능 점수를 경쟁사 평균과 비교합니다." });
    }
  }

  return checklist;
}
function groupByCategory(items: CheckItem[]): Record<string, CheckItem[]> {
  return items.reduce<Record<string, CheckItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});
}

export function ExecutiveSummary() {
  const { data, loading } = usePerformanceData();
  const [activeModal, setActiveModal] = useState<'checklist' | null>(null);

  if (loading || !data) {
    return (
      <div className={styles.strip}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={styles.card}>
            <Skeleton width="36px" height="36px" radius="8px" />
            <div className={styles.card_info}>
              <Skeleton width="80px" height="10px" />
              <Skeleton width="96px" height="22px" />
              <Skeleton width="120px" height="10px" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const target = data.benchmarks.find((benchmark) => benchmark.isTarget);
  if (!target) return null;

  const { executiveSummary: summary } = data;
  const { color: statusColor } = STATUS_META[summary.status];
  const checklist = buildChecklist(data);
  const passCount = checklist.filter((item) => item.status === 'pass').length;
  const failCount = checklist.filter((item) => item.status === 'fail').length;
  const unknownCount = checklist.filter((item) => item.status === 'unknown').length;
  const passRate = checklist.length > 0 ? Math.round((passCount / checklist.length) * 100) : 0;
  const grouped = groupByCategory(checklist);

  const sportsBrands = data.benchmarks.filter((benchmark) => !['Coupang', 'SSG.com', 'Naver Shopping'].includes(benchmark.brand));
  const competitorRank = [...sportsBrands]
    .sort((a, b) => b.scores.lighthouse - a.scores.lighthouse)
    .findIndex((benchmark) => benchmark.brand === target.brand) + 1;
  const transferSavedKb = Math.max(0, target.metrics.assetSize.value - target.metrics.assetSize.target);
  const carbon = estimateCarbonSaving(target.metrics.assetSize.value, target.metrics.assetSize.target);

  return (
    <>
      <div className={styles.strip}>
        <div className={`${styles.card} ${styles.score_card}`}>
          <ScoreArc score={summary.globalScore} color={statusColor} />
          <div className={styles.card_info}>
            <div className={styles.label_row}>
              <span className={styles.card_label}>종합 진단 결과</span>
              <span className={styles.basis_badge}>자동 측정</span>
            </div>
            <span className={styles.card_value}>{summary.globalScore}/100</span>
            <span className={styles.card_sub}>종합 점수</span>
            <span className={styles.card_note}>성능·SEO·체크리스트 기준</span>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.card}>
          <div className={styles.card_icon}>순위</div>
          <div className={styles.card_info}>
            <div className={styles.label_row}>
              <span className={styles.card_label}>경쟁사 대비 위치</span>
              <span className={styles.basis_badge}>공개 측정</span>
            </div>
            <span className={styles.card_value}>비교군 {sportsBrands.length}개 중 {competitorRank}위</span>
            <span className={styles.card_sub}>스포츠 브랜드 공식몰 기준</span>
            <span className={styles.card_note}>Lighthouse 종합 성능 비교</span>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.card_icon}>수정</div>
          <div className={styles.card_info}>
            <div className={styles.label_row}>
              <span className={styles.card_label}>수정 필요 항목</span>
              <span className={styles.basis_badge}>체크리스트</span>
            </div>
            <span className={failCount > 0 ? styles.card_value_warning : styles.card_value}>{failCount}개</span>
            <span className={styles.card_sub}>목표 기준에 미달한 점검 항목</span>
            <button className={styles.checklist_trigger} onClick={() => setActiveModal('checklist')}>
              통과 {passCount}/{checklist.length} · 미확인 {unknownCount}
            </button>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.card}>
          <div className={styles.card_icon}>절감</div>
          <div className={styles.card_info}>
            <div className={styles.label_row}>
              <span className={styles.card_label}>리소스 절감 여지</span>
              <span className={styles.basis_badge}>추정</span>
            </div>
            <span className={styles.card_value}>{formatTransferKb(transferSavedKb)}</span>
            <span className={styles.card_sub}>목표 전송량 대비 줄일 수 있는 크기</span>
            <span className={styles.card_note}>현재 {formatTransferKb(target.metrics.assetSize.value)} → 목표 {formatTransferKb(target.metrics.assetSize.target)} · CO₂ 약 {carbon.savedGrams}g/pageview</span>
          </div>
        </div>
      </div>

      {activeModal === 'checklist' && (
        <div className={styles.overlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modal_head}>
              <div>
                <p className={styles.modal_eyebrow}>최적화 체크리스트</p>
                <h2 className={styles.modal_score}>
                  {passCount} / {checklist.length} 항목 달성&nbsp;
                  <span style={{ color: statusColor }}>({passRate}%)</span>
                </h2>
                <p className={styles.modal_summary}>
                  통과 {passCount} · 미달 {failCount} · 미확인 {unknownCount}
                </p>
              </div>
              <button className={styles.modal_close} onClick={() => setActiveModal(null)}>닫기</button>
            </div>

            <div className={styles.progress_track}>
              <div className={styles.progress_bar} style={{ width: `${passRate}%`, background: statusColor }} />
            </div>

            <div className={styles.checklist_body}>
              {Object.entries(grouped).map(([category, items]) => {
                const catPass = items.filter((item) => item.status === 'pass').length;
                const catFail = items.filter((item) => item.status === 'fail').length;
                const catUnknown = items.filter((item) => item.status === 'unknown').length;
                return (
                  <div key={category} className={styles.cat_group}>
                    <div className={styles.cat_header}>
                      <span className={styles.cat_name}>{category}</span>
                      <span className={styles.cat_count}>통과 {catPass} · 미달 {catFail} · 미확인 {catUnknown}</span>
                    </div>
                    {items.map((item) => (
                      <div key={item.id} className={`${styles.check_item} ${styles[`check_${item.status}`]}`}>
                        <span className={styles.check_icon}>
                          {item.status === 'pass' ? 'OK' : item.status === 'fail' ? '미달' : '확인'}
                        </span>
                        <div className={styles.check_label_wrap}>
                          <span className={styles.check_label}>{item.label}</span>
                          <span className={styles.check_detail}>{item.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
