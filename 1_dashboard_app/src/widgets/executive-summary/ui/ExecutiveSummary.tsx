'use client';

import { useState, useMemo } from 'react';
import { usePerformanceData } from '@/shared/lib/hooks/usePerformanceData';
import { Skeleton } from '@/shared/ui';
import { calcCvrLift, calcRevenueImpact } from '@/shared/lib/cvr';
import type { GlobalStatus, PerformanceApiResponse, MetricKey } from '@/shared/lib/types';
import styles from './ExecutiveSummary.module.css';

// ── 글로벌 점수 상태 ──────────────────────────────────────────
const STATUS_META: Record<GlobalStatus, { label: string; color: string }> = {
  optimal:             { label: 'OPTIMAL',          color: '#10b981' },
  'needs-improvement': { label: 'NEEDS IMPROVEMENT', color: '#f59e0b' },
  critical:            { label: 'CRITICAL',          color: '#ef4444' },
};

// ── SVG 원형 게이지 ───────────────────────────────────────────
function ScoreArc({ score, color }: { score: number; color: string }) {
  const r = 20, cx = 26, cy = 26;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  return (
    <svg width="52" height="52" viewBox="0 0 52 52">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth="4.5" />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="4.5"
        strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        fill="#f1f5f9" fontSize="13" fontWeight="800">
        {score}
      </text>
    </svg>
  );
}

// ── 체크리스트 타입 & 빌더 ────────────────────────────────────
interface CheckItem { id: string; category: string; label: string; pass: boolean; detail?: string; }

function buildChecklist(data: PerformanceApiResponse): CheckItem[] {
  const target = data.benchmarks.find(b => b.isTarget);
  const others = data.benchmarks.filter(b => !b.isTarget);
  const m      = target?.metrics;

  const metricPass = (key: MetricKey) => m ? m[key].value <= m[key].target : false;
  const compAvg    = (key: MetricKey) =>
    others.length ? others.reduce((s, b) => s + b.metrics[key].value, 0) / others.length : 0;
  const beatComp   = (key: MetricKey) => m ? m[key].value < compAvg(key) : false;

  return [
    // Core Web Vitals (6)
    { id: 'cwv-lcp', category: 'Core Web Vitals', label: 'LCP ≤ 2.5s',        pass: metricPass('lcp'),        detail: '주요 콘텐츠(히어로 이미지·텍스트)가 화면에 렌더 완료되는 시간. 이미지 최적화·CDN이 핵심' },
    { id: 'cwv-cls', category: 'Core Web Vitals', label: 'CLS ≤ 0.1',          pass: metricPass('cls'),        detail: '로드 중 예기치 않은 레이아웃 이동 누적 점수. 광고 삽입·폰트 FOUT·동적 콘텐츠가 주요 원인' },
    { id: 'cwv-tbt', category: 'Core Web Vitals', label: 'TBT ≤ 200ms',        pass: metricPass('tbt'),        detail: 'FCP~TTI 사이 메인 스레드를 50ms 이상 차단한 작업의 누적 시간. 무거운 JS 파싱이 주원인' },
    { id: 'cwv-fcp', category: 'Core Web Vitals', label: 'FCP ≤ 1.8s',         pass: metricPass('fcp'),        detail: '첫 번째 텍스트·이미지 콘텐츠가 화면에 출력되는 시간. 서버 응답 속도와 렌더 블로킹이 영향' },
    { id: 'cwv-si',  category: 'Core Web Vitals', label: 'Speed Index ≤ 3.4s', pass: metricPass('speedIndex'), detail: '페이지 콘텐츠가 시각적으로 채워지는 평균 속도. 값이 낮을수록 사용자가 콘텐츠를 빨리 인식' },
    { id: 'cwv-inp', category: 'Core Web Vitals', label: 'INP ≤ 200ms',        pass: false,                    detail: '클릭·키 입력 등 모든 상호작용 중 최대 응답 지연. React 리렌더링·메인 스레드 과부하 주의' },

    // Lighthouse 감사 (7)
    { id: 'lh-score',  category: 'Lighthouse 감사', label: '종합 점수 ≥ 90',          pass: (target?.scores.lighthouse ?? 0) >= 90, detail: 'LCP·TBT·CLS·FCP·Speed Index 가중 합산. 90+ 이상이 Google 권장 "Good" 등급' },
    { id: 'lh-render', category: 'Lighthouse 감사', label: '렌더 블로킹 리소스 제거', pass: false,  detail: '<head> 내 동기 CSS·JS 파일이 초기 렌더링을 지연시킴. defer·async·critical CSS 인라인화로 해소' },
    { id: 'lh-ujs',    category: 'Lighthouse 감사', label: '미사용 JavaScript 제거',  pass: false,  detail: '번들에 포함됐으나 실제 실행되지 않는 코드. 트리 쉐이킹·코드 스플리팅으로 번들 크기 감소' },
    { id: 'lh-ucss',   category: 'Lighthouse 감사', label: '미사용 CSS 제거',         pass: false,  detail: '렌더 차단 없이 로드되는 불필요한 스타일. PurgeCSS 또는 CSS Modules로 사용 선택자만 포함' },
    { id: 'lh-img',    category: 'Lighthouse 감사', label: '이미지 효율 최적화',      pass: false,  detail: 'WebP/AVIF 포맷 + 적절한 품질 압축 적용. 최신 포맷은 JPEG 대비 30~50% 크기 절감 가능' },
    { id: 'lh-comp',   category: 'Lighthouse 감사', label: '텍스트 압축 활성화',      pass: true,   detail: 'gzip 또는 Brotli 압축으로 HTML·CSS·JS 전송 크기 감소. Brotli가 gzip 대비 약 15% 효율 우위' },
    { id: 'lh-min',    category: 'Lighthouse 감사', label: 'JavaScript 최소화',       pass: true,   detail: '공백·주석·긴 변수명 제거(minify)로 파일 크기 감소. 빌드 도구(webpack·esbuild)가 자동 처리' },

    // 에셋 최적화 (7)
    { id: 'ast-fmt',   category: '에셋 최적화', label: '차세대 이미지 포맷 (WebP/AVIF)', pass: false,                detail: 'JPEG/PNG 대신 WebP(+30%)·AVIF(+50%) 사용. next/image가 자동 변환하지만 CMS 이미지는 별도 처리 필요' },
    { id: 'ast-lazy',  category: '에셋 최적화', label: '이미지 레이지 로드',            pass: true,                 detail: 'viewport 밖 이미지에 loading="lazy" 또는 Intersection Observer 적용해 초기 요청 수 감소' },
    { id: 'ast-sz',    category: '에셋 최적화', label: '이미지 적정 사이즈',            pass: false,                detail: '실제 렌더 크기 초과 이미지 전송 금지. srcset·sizes 속성으로 디바이스별 적정 해상도 제공' },
    { id: 'ast-total', category: '에셋 최적화', label: '총 에셋 크기 목표 이하',        pass: metricPass('assetSize'), detail: '페이지당 전체 전송 크기(JS+CSS+이미지+폰트) 200KB 이하 목표. 현재 312KB로 초과 중' },
    { id: 'ast-js',    category: '에셋 최적화', label: 'JS 번들 < 300KB',              pass: false,                detail: '코드 스플리팅·dynamic import·트리 쉐이킹으로 초기 로드 JS 최소화. 300KB 초과 시 파싱 비용 급증' },
    { id: 'ast-css',   category: '에셋 최적화', label: 'CSS 번들 < 100KB',             pass: true,                 detail: '미사용 선택자 제거 및 Critical CSS 인라인화. CSS Modules·Tailwind JIT가 자동 제거에 유리' },
    { id: 'ast-font',  category: '에셋 최적화', label: '폰트 display:swap 적용',       pass: true,                 detail: 'FOIT(글자 안 보임) 방지. font-display:swap으로 폴백 폰트 즉시 노출 후 웹폰트로 교체' },

    // 캐싱 & 네트워크 (7)
    { id: 'net-cache', category: '캐싱 & 네트워크', label: '정적 에셋 장기 캐시 설정', pass: true,  detail: 'Cache-Control: max-age=31536000 + 파일명 해시로 캐시 무효화. CDN 엣지 캐시와 함께 적용' },
    { id: 'net-cdn',   category: '캐싱 & 네트워크', label: 'CDN 적용',                 pass: true,  detail: '사용자 최근접 엣지 서버에서 정적 파일 서빙. 서울~지방 RTT를 수십ms에서 한 자릿수로 단축' },
    { id: 'net-h2',    category: '캐싱 & 네트워크', label: 'HTTP/2 활성화',             pass: true,  detail: '멀티플렉싱으로 단일 연결에서 다수 요청 병렬 처리. HTTP/1.1의 헤드-오브-라인 블로킹 해소' },
    { id: 'net-dns',   category: '캐싱 & 네트워크', label: 'DNS 프리페치 설정',         pass: false, detail: '외부 도메인(CDN·분석 등)에 rel=dns-prefetch 적용. 연결 전 DNS 조회를 미리 처리해 지연 감소' },
    { id: 'net-pre',   category: '캐싱 & 네트워크', label: 'Preconnect 설정',           pass: true,  detail: '폰트·API 서버에 rel=preconnect로 TCP+TLS 핸드셰이크 사전 완료. 첫 요청 지연 최대 200ms 단축' },
    { id: 'net-gzip',  category: '캐싱 & 네트워크', label: 'gzip/Brotli 압축',         pass: true,  detail: '서버 응답 텍스트 에셋 압축 전송. Brotli는 gzip 대비 평균 15% 추가 압축률 제공' },
    { id: 'net-sw',    category: '캐싱 & 네트워크', label: '서비스 워커 등록',          pass: false, detail: '오프라인 지원 및 캐시 우선 전략으로 재방문 시 로드 시간 대폭 단축. PWA 기반 구현 권장' },

    // 렌더링 최적화 (7)
    { id: 'ren-cls',   category: '렌더링 최적화', label: '레이아웃 시프트 억제',       pass: metricPass('cls'), detail: '이미지·광고에 width/height 명시, 동적 콘텐츠 공간 사전 예약으로 CLS 0.1 이하 유지' },
    { id: 'ren-tbt',   category: '렌더링 최적화', label: '긴 태스크 최소화',           pass: metricPass('tbt'), detail: '50ms 초과 메인 스레드 블로킹 작업 분할. requestIdleCallback·scheduler.postTask 활용' },
    { id: 'ren-memo',  category: '렌더링 최적화', label: 'React.memo 최적화 적용',     pass: true,              detail: 'props 변경 없는 컴포넌트 리렌더링 방지. useMemo·useCallback과 함께 불필요한 렌더 차단' },
    { id: 'ren-virt',  category: '렌더링 최적화', label: '가상 스크롤 구현',           pass: false,             detail: '긴 상품 목록에서 DOM 노드 수 제한으로 메모리·렌더 비용 절감. react-window 등 라이브러리 활용' },
    { id: 'ren-split', category: '렌더링 최적화', label: '코드 스플리팅 적용',         pass: true,              detail: '라우트별 번들 분리로 초기 로드 JS 감소. Next.js 라우팅 기반 자동 스플리팅 활성화' },
    { id: 'ren-dyn',   category: '렌더링 최적화', label: '다이나믹 임포트 사용',       pass: true,              detail: '필요 시점에만 컴포넌트·라이브러리 로드. 모달·차트 등 즉시 필요 없는 요소에 적용' },
    { id: 'ren-fold',  category: '렌더링 최적화', label: 'Above-the-fold 우선 로드',   pass: true,              detail: '뷰포트 내 콘텐츠를 Critical CSS·preload와 함께 우선 렌더. 스크롤 아래 콘텐츠는 지연 로드' },

    // 보안 (5)
    { id: 'sec-https', category: '보안', label: 'HTTPS 적용',              pass: true,  detail: '전체 사이트 HTTPS 강제. HTTP 요청을 301로 자동 리다이렉트하고 Mixed Content 없도록 관리' },
    { id: 'sec-hsts',  category: '보안', label: 'HSTS 헤더 설정',          pass: true,  detail: 'Strict-Transport-Security로 브라우저가 HTTPS만 사용하도록 강제. max-age=31536000 권장' },
    { id: 'sec-csp',   category: '보안', label: 'CSP 헤더 구성',           pass: false, detail: 'Content-Security-Policy로 허용된 출처의 스크립트·스타일만 실행. XSS·클릭재킹 방어 핵심' },
    { id: 'sec-mix',   category: '보안', label: '혼합 콘텐츠 없음',        pass: true,  detail: 'HTTPS 페이지에서 HTTP 리소스 로드 차단. 이미지·폰트·API URL 모두 https:// 사용 확인' },
    { id: 'sec-sri',   category: '보안', label: '외부 스크립트 SRI 적용',  pass: false, detail: 'Subresource Integrity 해시로 CDN 파일 변조 감지. integrity 속성 미설정 시 공급망 공격 취약' },

    // 모니터링 (6)
    { id: 'mon-rum',  category: '모니터링', label: 'RUM 모니터링 활성',        pass: true,  detail: '실사용자 브라우저에서 수집한 Core Web Vitals 데이터. ClickHouse 연동으로 지역·ISP별 분석 가능' },
    { id: 'mon-cwv',  category: '모니터링', label: 'Core Web Vitals 추적',     pass: true,  detail: 'LCP·CLS·INP를 실시간 수집해 이 대시보드에 연동. 목표 임계값 초과 시 AlertBanner 트리거' },
    { id: 'mon-err',  category: '모니터링', label: '에러 추적 설정',           pass: true,  detail: 'JS 런타임 에러·API 실패를 Sentry 등 모니터링 시스템에 연동. 성능 회귀와 에러 상관관계 분석' },
    { id: 'mon-bgt',  category: '모니터링', label: '성능 예산 정의',           pass: false, detail: 'CI 파이프라인에서 자동 검사할 파일 크기·점수 기준값 설정. 예산 초과 시 빌드 실패 처리 권장' },
    { id: 'mon-ci',   category: '모니터링', label: 'Lighthouse CI 파이프라인', pass: false, detail: '배포 전 자동 Lighthouse 감사로 성능 회귀 방지. GitHub Actions + LHCI Server(포트 9001) 연동' },
    { id: 'mon-dev',  category: '모니터링', label: '실 기기 테스트',           pass: true,  detail: '실제 Android/iOS 기기(Chrome·Safari)에서 성능 검증. 에뮬레이터와 실기기 간 INP 수치 차이 주의' },

    // 경쟁사 대비 (7)
    { id: 'cmp-lcp',  category: '경쟁사 대비', label: 'LCP 경쟁사 평균 이하',             pass: beatComp('lcp'),        detail: '쿠팡·SSG·네이버쇼핑·나이키 4개사 LCP 평균 대비. 현재 3.8s로 경쟁사 평균 4.0s에 근접' },
    { id: 'cmp-cls',  category: '경쟁사 대비', label: 'CLS 경쟁사 평균 이하',             pass: beatComp('cls'),        detail: '경쟁사 CLS 평균(0.14) 대비 레이아웃 안정성 비교. 현재 0.08로 경쟁사 대비 우위' },
    { id: 'cmp-tbt',  category: '경쟁사 대비', label: 'TBT 경쟁사 평균 이하',             pass: beatComp('tbt'),        detail: '경쟁사 TBT 평균(608ms) 대비 메인 스레드 차단 시간. 현재 420ms로 경쟁사 대비 우위' },
    { id: 'cmp-fcp',  category: '경쟁사 대비', label: 'FCP 경쟁사 평균 이하',             pass: beatComp('fcp'),        detail: '경쟁사 FCP 평균(2.5s) 대비 첫 콘텐츠 출력 속도 비교' },
    { id: 'cmp-si',   category: '경쟁사 대비', label: 'Speed Index 경쟁사 평균 이하',     pass: beatComp('speedIndex'), detail: '경쟁사 Speed Index 평균(4.8s) 대비 시각적 완성 속도 비교' },
    { id: 'cmp-ast',  category: '경쟁사 대비', label: '에셋 크기 경쟁사 평균 이하',       pass: beatComp('assetSize'),  detail: '경쟁사 총 에셋 크기 평균(542KB) 대비 리소스 효율 비교. 현재 312KB로 경쟁사 대비 우위' },
    { id: 'cmp-scr',  category: '경쟁사 대비', label: 'Lighthouse 점수 경쟁사 평균 이상',
      pass: others.length > 0
        ? (target?.scores.lighthouse ?? 0) > others.reduce((s, b) => s + b.scores.lighthouse, 0) / others.length
        : false,
      detail: '국내 4개 경쟁사 Lighthouse 평균(67pt) 대비 종합 점수. 현재 72pt로 경쟁사 평균 상회 중' },
  ];
}

function groupByCategory(items: CheckItem[]): Record<string, CheckItem[]> {
  return items.reduce<Record<string, CheckItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────
export function ExecutiveSummary() {
  const { data, loading } = usePerformanceData();
  const [passModal, setPassModal] = useState(false);

  // 훅은 early return 전에 모두 선언 (Rules of Hooks)
  const target = data?.benchmarks.find(b => b.isTarget) ?? null;
  const cvrLift = useMemo(() => {
    if (!target) return 0;
    return calcCvrLift({
      lcpCurrent: target.metrics.lcp.value,
      lcpTarget:  target.metrics.lcp.target,
      inpCurrent: target.metrics.inp.value,
      inpTarget:  target.metrics.inp.target,
      clsCurrent: target.metrics.cls.value,
      clsTarget:  target.metrics.cls.target,
    });
  }, [target]);

  if (loading || !data) {
    return (
      <div className={styles.strip}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.card}>
            <Skeleton width="68px" height="68px" radius="50%" />
            <div className={styles.card_info}>
              <Skeleton width="72px" height="10px" />
              <Skeleton width="100px" height="22px" />
              <Skeleton width="88px" height="10px" />
            </div>
            {i < 3 && <div className={styles.divider} />}
          </div>
        ))}
      </div>
    );
  }

  const { executiveSummary: es } = data;
  const { label: statusLabel, color: statusColor } = STATUS_META[es.status];

  const competitors = data.benchmarks.filter(b => !b.isTarget);
  const competitorAvgScore = competitors.length
    ? Math.round(competitors.reduce((s, b) => s + b.scores.lighthouse, 0) / competitors.length)
    : null;
  const scoreDiff = competitorAvgScore != null ? es.globalScore - competitorAvgScore : null;

  const revenueImpact = calcRevenueImpact(cvrLift, es.baselineAnnualRevenue);
  const revenueB = (revenueImpact / 100_000_000).toFixed(1);

  const checklist  = buildChecklist(data);
  const passCount  = checklist.filter(c => c.pass).length;
  const passRate   = Math.round((passCount / checklist.length) * 100);
  const grouped    = groupByCategory(checklist);

  return (
    <>
      <div className={styles.strip}>

        {/* ── 카드 1: 글로벌 점수 ── */}
        <div className={styles.card}>
          <ScoreArc score={es.globalScore} color={statusColor} />
          <div className={styles.card_info}>
            <span className={styles.card_label}>GLOBAL SCORE</span>
            <span className={styles.status_badge} style={{ color: statusColor, borderColor: statusColor }}>
              {statusLabel}
            </span>
            {competitorAvgScore != null && (
              <span className={styles.comp_avg}>
                업계 평균 {competitorAvgScore}pt
                {scoreDiff != null && scoreDiff !== 0 && (
                  <span style={{ color: scoreDiff > 0 ? '#10b981' : '#f59e0b' }}>
                    {' '}{scoreDiff > 0 ? '+' : ''}{scoreDiff}
                  </span>
                )}
              </span>
            )}
            <button className={styles.checklist_trigger} onClick={() => setPassModal(true)}>
              체크리스트 {passCount}/{checklist.length} ▸
            </button>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── 카드 2: ROI 임팩트 ── */}
        <div className={styles.card}>
          <div className={styles.card_icon}>📈</div>
          <div className={styles.card_info}>
            <span className={styles.card_label}>CVR LIFT 예측</span>
            <span className={styles.card_value}>+{cvrLift}%</span>
            <span className={styles.card_sub}>연간 +₩{revenueB}억 · WPO Stats 기반</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── 카드 3: SEO 건강도 ── */}
        <div className={styles.card}>
          <div className={styles.card_icon}>🔍</div>
          <div className={styles.card_info}>
            <span className={styles.card_label}>SEO RANK</span>
            <span className={styles.card_value}>상위 {es.seoHealth.rankPercentile}%</span>
            <span className={styles.card_sub}>목표 달성 시 +{es.seoHealth.estimatedChange}pt</span>
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── 카드 4: 탄소 발자국 (secondary) ── */}
        <div className={`${styles.card} ${styles.card_carbon}`}>
          <div className={styles.card_icon}>🌿</div>
          <div className={styles.card_info}>
            <span className={styles.card_label}>CARBON / PV</span>
            <span className={styles.card_value_sm}>{es.carbonFootprint.gramsPerPageView}g</span>
            <span className={styles.card_sub_sm}>최적화 시 −{es.carbonFootprint.savedGrams}g</span>
          </div>
        </div>

      </div>

      {/* ── Pass Rate 체크리스트 모달 ── */}
      {passModal && (
        <div className={styles.overlay} onClick={() => setPassModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

            <div className={styles.modal_head}>
              <div>
                <p className={styles.modal_eyebrow}>최적화 체크리스트</p>
                <h2 className={styles.modal_score}>
                  {passCount} / {checklist.length} 항목 달성&nbsp;
                  <span style={{ color: statusColor }}>({passRate}%)</span>
                </h2>
              </div>
              <button className={styles.modal_close} onClick={() => setPassModal(false)}>✕</button>
            </div>

            <div className={styles.progress_track}>
              <div className={styles.progress_bar} style={{ width: `${passRate}%`, background: statusColor }} />
            </div>

            <div className={styles.checklist_body}>
              {Object.entries(grouped).map(([category, items]) => {
                const catPass = items.filter(i => i.pass).length;
                return (
                  <div key={category} className={styles.cat_group}>
                    <div className={styles.cat_header}>
                      <span className={styles.cat_name}>{category}</span>
                      <span className={styles.cat_count}>{catPass}/{items.length}</span>
                    </div>
                    {items.map(item => (
                      <div key={item.id} className={`${styles.check_item} ${item.pass ? styles.check_pass : styles.check_fail}`}>
                        <span className={styles.check_icon}>{item.pass ? '✓' : '✗'}</span>
                        <div className={styles.check_label_wrap}>
                          <span className={styles.check_label}>{item.label}</span>
                          {item.detail && <span className={styles.check_detail}>{item.detail}</span>}
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
