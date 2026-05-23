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

function buildChecklist(data: PerformanceApiResponse): CheckItem[] {
  const target = data.benchmarks.find((benchmark) => benchmark.isTarget);
  const competitors = data.benchmarks.filter((benchmark) => !benchmark.isTarget);
  const metrics = target?.metrics;
  const resource = target?.resource;
  const audit = target?.auditChecks;
  const checklist: CheckItem[] = [];

  const toStatus = (value: boolean | undefined): CheckItem['status'] => {
    if (typeof value !== 'boolean') return 'unknown';
    return value ? 'pass' : 'fail';
  };
  const metricStatus = (key: MetricKey) => toStatus(metrics ? metrics[key].value <= metrics[key].target : undefined);
  const competitorAverage = (key: MetricKey) =>
    competitors.length
      ? competitors.reduce((sum, benchmark) => sum + benchmark.metrics[key].value, 0) / competitors.length
      : 0;
  const beatCompetitors = (key: MetricKey) => toStatus(metrics && competitors.length > 0 ? metrics[key].value < competitorAverage(key) : undefined);
  const add = (item: CheckItem | false | null | undefined) => {
    if (item) checklist.push(item);
  };

  add({ id: 'cwv-lcp', category: 'Core Web Vitals', label: 'LCP <= 2.5s', status: metricStatus('lcp'), detail: '주요 콘텐츠가 보이는 속도입니다. 사용자가 처음 느끼는 로딩 경험과 연결됩니다.' });
  add({ id: 'cwv-cls', category: 'Core Web Vitals', label: 'CLS <= 0.1', status: metricStatus('cls'), detail: '화면이 갑자기 밀리는 정도입니다. 구매 버튼 오클릭과 사용 불편을 줄이는 지표입니다.' });
  add({ id: 'cwv-tbt', category: 'Core Web Vitals', label: 'TBT <= 200ms', status: metricStatus('tbt'), detail: '브라우저가 오래 멈춰 있는 시간입니다. JavaScript 부담과 반응성 문제를 찾습니다.' });
  add({ id: 'cwv-fcp', category: 'Core Web Vitals', label: 'FCP <= 1.8s', status: metricStatus('fcp'), detail: '첫 콘텐츠가 보이는 시간입니다. 방문자가 빈 화면을 보는 시간을 줄입니다.' });
  add({ id: 'cwv-si', category: 'Core Web Vitals', label: 'Speed Index <= 3.4s', status: metricStatus('speedIndex'), detail: '화면이 시각적으로 완성되는 속도입니다. 체감 로딩 속도 판단에 씁니다.' });
  add({ id: 'cwv-inp', category: 'Core Web Vitals', label: 'INP <= 200ms', status: metricStatus('inp'), detail: '클릭과 입력의 응답 속도입니다. 탐색, 장바구니, 결제 조작감과 연결됩니다.' });

  add({ id: 'lh-score', category: 'Lighthouse 감사', label: '종합 점수 >= 90', status: toStatus(target ? target.scores.lighthouse >= 90 : undefined), detail: '성능, 접근성, SEO 등 사이트 품질을 빠르게 비교하기 위한 종합 점수입니다.' });
  add({ id: 'lh-render', category: 'Lighthouse 감사', label: '렌더 차단 리소스 제거', status: toStatus(resource?.renderBlockingCount !== undefined ? resource.renderBlockingCount === 0 : undefined), detail: '첫 화면 표시를 막는 CSS와 JavaScript를 줄입니다.' });
  add({ id: 'lh-ujs', category: 'Lighthouse 감사', label: '미사용 JavaScript 제거', status: toStatus(resource?.unusedJsKb !== undefined ? resource.unusedJsKb === 0 : undefined), detail: '방문자가 쓰지 않는 코드를 줄여 로딩과 반응성을 개선합니다.' });
  add({ id: 'lh-ucss', category: 'Lighthouse 감사', label: '미사용 CSS 제거', status: toStatus(resource?.unusedCssKb !== undefined ? resource.unusedCssKb === 0 : undefined), detail: '불필요한 스타일 전송량을 줄입니다.' });
  add({ id: 'lh-img', category: 'Lighthouse 감사', label: '이미지 효율 최적화', status: toStatus(resource?.imageOptimizationKb !== undefined ? resource.imageOptimizationKb === 0 : undefined), detail: '상품 이미지와 배너 이미지의 전송량을 줄여 LCP를 개선합니다.' });
  add({ id: 'lh-comp', category: 'Lighthouse 감사', label: '텍스트 압축 활성화', status: toStatus(audit?.textCompression), detail: 'HTML, CSS, JavaScript 전송량을 줄입니다.' });
  add({ id: 'lh-min', category: 'Lighthouse 감사', label: 'JavaScript 최소화', status: toStatus(audit?.javascriptMinified), detail: '빌드 산출물 크기를 줄여 로딩 비용을 낮춥니다.' });

  add({ id: 'ast-total', category: '에셋 최적화', label: '총 에셋 크기 목표 이하', status: metricStatus('assetSize'), detail: '이미지, JS, CSS, 폰트의 전체 전송량을 관리합니다.' });
  add({ id: 'ast-fmt', category: '에셋 최적화', label: '차세대 이미지 포맷', status: toStatus(resource?.modernImageFormatReady), detail: 'WebP 또는 AVIF로 이미지 크기를 줄입니다.' });
  add({ id: 'ast-lazy', category: '에셋 최적화', label: '이미지 지연 로드', status: toStatus(audit?.lazyLoadImages), detail: '첫 화면 밖 이미지를 늦게 불러 초기 로딩을 가볍게 만듭니다.' });
  add({ id: 'ast-sz', category: '에셋 최적화', label: '이미지 적정 사이즈', status: toStatus(audit?.properlySizedImages), detail: '실제 표시 크기보다 큰 이미지를 보내지 않도록 합니다.' });
  add({ id: 'ast-js', category: '에셋 최적화', label: 'JS 번들 < 300KB', status: toStatus(resource?.jsKb !== undefined ? resource.jsKb < 300 : undefined), detail: '초기 로딩에 필요한 JavaScript만 먼저 전달합니다.' });
  add({ id: 'ast-css', category: '에셋 최적화', label: 'CSS 번들 < 100KB', status: toStatus(resource?.cssKb !== undefined ? resource.cssKb < 100 : undefined), detail: '사용하지 않는 스타일을 제거합니다.' });
  add({ id: 'ast-font', category: '에셋 최적화', label: '폰트 display:swap 적용', status: toStatus(audit?.fontDisplaySwap), detail: '폰트 때문에 텍스트가 늦게 보이는 문제를 줄입니다.' });

  add({ id: 'net-cache', category: '캐싱 & 네트워크', label: '정적 에셋 장기 캐시', status: toStatus(audit?.longTermCache), detail: '재방문 사용자의 로딩 속도를 높입니다.' });
  add({ id: 'net-cdn', category: '캐싱 & 네트워크', label: 'CDN 적용', status: toStatus(audit?.cdn), detail: '사용자와 가까운 서버에서 정적 파일을 제공합니다.' });
  add({ id: 'net-h2', category: '캐싱 & 네트워크', label: 'HTTP/2 활성화', status: toStatus(audit?.http2), detail: '여러 요청을 효율적으로 병렬 처리합니다.' });
  add({ id: 'net-dns', category: '캐싱 & 네트워크', label: 'DNS 프리페치 설정', status: toStatus(audit?.dnsPrefetch), detail: '외부 도메인 연결 준비 시간을 줄입니다.' });
  add({ id: 'net-pre', category: '캐싱 & 네트워크', label: 'Preconnect 설정', status: toStatus(audit?.preconnect), detail: '폰트와 API 서버 연결 시간을 줄입니다.' });
  add({ id: 'net-gzip', category: '캐싱 & 네트워크', label: 'gzip/Brotli 압축', status: toStatus(audit?.gzipBrotli), detail: '텍스트 리소스 전송량을 줄입니다.' });
  add({ id: 'net-sw', category: '캐싱 & 네트워크', label: '서비스 워커 등록', status: toStatus(audit?.serviceWorker), detail: '재방문 캐시 전략을 확장할 수 있습니다.' });

  add({ id: 'ren-cls', category: '렌더링 최적화', label: '레이아웃 시프트 억제', status: metricStatus('cls'), detail: '상품 카드와 배너 영역을 미리 확보합니다.' });
  add({ id: 'ren-tbt', category: '렌더링 최적화', label: '긴 태스크 최소화', status: metricStatus('tbt'), detail: '메인 스레드 작업을 쪼개 사용자가 기다리는 시간을 줄입니다.' });
  add({ id: 'ren-memo', category: '렌더링 최적화', label: 'React memo 최적화', status: toStatus(audit?.reactMemo), detail: '불필요한 리렌더링을 줄입니다.' });
  add({ id: 'ren-virt', category: '렌더링 최적화', label: '가상 스크롤 구현', status: toStatus(audit?.virtualScroll), detail: '상품 목록이 길어질 때 렌더링 비용을 줄입니다.' });
  add({ id: 'ren-split', category: '렌더링 최적화', label: '코드 스플리팅 적용', status: toStatus(audit?.codeSplitting), detail: '페이지별로 필요한 코드만 먼저 로드합니다.' });
  add({ id: 'ren-dyn', category: '렌더링 최적화', label: '다이나믹 임포트 사용', status: toStatus(audit?.dynamicImport), detail: '모달, 차트 등 늦게 필요한 기능을 뒤로 미룹니다.' });
  add({ id: 'ren-fold', category: '렌더링 최적화', label: '첫 화면 우선 로드', status: toStatus(audit?.aboveFoldPriority), detail: '방문자가 처음 보는 영역을 가장 먼저 완성합니다.' });

  add({ id: 'sec-https', category: '보안', label: 'HTTPS 적용', status: toStatus(audit?.https), detail: '전체 페이지가 안전한 연결로 제공되는지 확인합니다.' });
  add({ id: 'sec-hsts', category: '보안', label: 'HSTS 헤더 설정', status: toStatus(audit?.hsts), detail: '브라우저가 HTTPS만 사용하도록 강제합니다.' });
  add({ id: 'sec-csp', category: '보안', label: 'CSP 헤더 구성', status: toStatus(audit?.csp), detail: '허용된 출처의 스크립트와 스타일만 실행되도록 제한합니다.' });
  add({ id: 'sec-mix', category: '보안', label: '혼합 콘텐츠 없음', status: toStatus(audit?.noMixedContent), detail: 'HTTPS 페이지에서 HTTP 리소스가 섞이지 않도록 합니다.' });
  add({ id: 'sec-sri', category: '보안', label: '외부 스크립트 SRI 적용', status: toStatus(audit?.sri), detail: '외부 스크립트 변조 위험을 줄입니다.' });

  add({ id: 'mon-rum', category: '모니터링', label: 'RUM 세션 데이터 수집', status: toStatus(data.rum.userJourney.length > 0 || data.rum.regionalData.length > 0), detail: '실사용자 환경의 성능과 행동 데이터를 수집합니다.' });
  add({ id: 'mon-cwv', category: '모니터링', label: 'CrUX 또는 Field Data 존재', status: toStatus(target?.fieldData?.availability === 'available'), detail: '실제 Chrome 사용자 기반 Web Vitals 보조 데이터를 확인합니다.' });
  add({ id: 'mon-err', category: '모니터링', label: '에러 추적 설정', status: toStatus(audit?.errorTracking), detail: '성능 문제와 에러의 관계를 함께 봅니다.' });
  add({ id: 'mon-bgt', category: '모니터링', label: '성능 예산 정의', status: toStatus(audit?.performanceBudget), detail: '배포 전 파일 크기와 성능 점수 기준을 검사합니다.' });
  add({ id: 'mon-ci', category: '모니터링', label: 'Lighthouse CI 파이프라인', status: toStatus(audit?.lighthouseCi), detail: '배포 전 자동 성능 감사를 수행합니다.' });
  add({ id: 'mon-dev', category: '모니터링', label: '실기기 테스트', status: toStatus(audit?.realDeviceTesting), detail: '실제 모바일 기기에서 체감 성능을 확인합니다.' });

  if (competitors.length > 0) {
    add({ id: 'cmp-lcp', category: '경쟁사 대비', label: 'LCP 경쟁사 평균 이하', status: beatCompetitors('lcp'), detail: '경쟁사 대비 첫 화면 로딩 경쟁력을 확인합니다.' });
    add({ id: 'cmp-cls', category: '경쟁사 대비', label: 'CLS 경쟁사 평균 이하', status: beatCompetitors('cls'), detail: '경쟁사 대비 화면 안정성을 비교합니다.' });
    add({ id: 'cmp-tbt', category: '경쟁사 대비', label: 'TBT 경쟁사 평균 이하', status: beatCompetitors('tbt'), detail: '경쟁사 대비 JavaScript 부담을 비교합니다.' });
    add({ id: 'cmp-fcp', category: '경쟁사 대비', label: 'FCP 경쟁사 평균 이하', status: beatCompetitors('fcp'), detail: '경쟁사 대비 첫 콘텐츠 표시 속도를 비교합니다.' });
    add({ id: 'cmp-si', category: '경쟁사 대비', label: 'Speed Index 경쟁사 평균 이하', status: beatCompetitors('speedIndex'), detail: '경쟁사 대비 체감 완성 속도를 비교합니다.' });
    add({ id: 'cmp-ast', category: '경쟁사 대비', label: '에셋 크기 경쟁사 평균 이하', status: beatCompetitors('assetSize'), detail: '경쟁사 대비 리소스 효율을 비교합니다.' });
    add({
      id: 'cmp-scr',
      category: '경쟁사 대비',
      label: 'Lighthouse 점수 경쟁사 평균 이상',
      status: toStatus(competitors.length > 0 && target
        ? target.scores.lighthouse > competitors.reduce((sum, benchmark) => sum + benchmark.scores.lighthouse, 0) / competitors.length
        : undefined),
      detail: '전체 성능 경쟁력을 경쟁사 평균과 비교합니다.',
    });
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
            <span className={styles.card_value}>{carbon.savedGrams}g</span>
            <span className={styles.card_sub}>목표 전송량 기준 CO₂ 절감 가능</span>
            <span className={styles.card_note}>현재 {carbon.gramsPerPageView}g → 목표 {carbon.targetGramsPerPageView}g/pageview</span>
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
