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
interface CheckItem { id: string; category: string; label: string; pass: boolean; }

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
    { id: 'cwv-lcp', category: 'Core Web Vitals', label: 'LCP ≤ 2.5s',        pass: metricPass('lcp') },
    { id: 'cwv-cls', category: 'Core Web Vitals', label: 'CLS ≤ 0.1',          pass: metricPass('cls') },
    { id: 'cwv-tbt', category: 'Core Web Vitals', label: 'TBT ≤ 200ms',        pass: metricPass('tbt') },
    { id: 'cwv-fcp', category: 'Core Web Vitals', label: 'FCP ≤ 1.8s',         pass: metricPass('fcp') },
    { id: 'cwv-si',  category: 'Core Web Vitals', label: 'Speed Index ≤ 3.4s', pass: metricPass('speedIndex') },
    { id: 'cwv-inp', category: 'Core Web Vitals', label: 'INP ≤ 200ms',        pass: false },

    // Lighthouse 감사 (7)
    { id: 'lh-score',  category: 'Lighthouse 감사', label: '종합 점수 ≥ 90',          pass: (target?.scores.lighthouse ?? 0) >= 90 },
    { id: 'lh-render', category: 'Lighthouse 감사', label: '렌더 블로킹 리소스 제거', pass: false },
    { id: 'lh-ujs',    category: 'Lighthouse 감사', label: '미사용 JavaScript 제거',  pass: false },
    { id: 'lh-ucss',   category: 'Lighthouse 감사', label: '미사용 CSS 제거',         pass: false },
    { id: 'lh-img',    category: 'Lighthouse 감사', label: '이미지 효율 최적화',      pass: false },
    { id: 'lh-comp',   category: 'Lighthouse 감사', label: '텍스트 압축 활성화',      pass: true },
    { id: 'lh-min',    category: 'Lighthouse 감사', label: 'JavaScript 최소화',       pass: true },

    // 에셋 최적화 (7)
    { id: 'ast-fmt',   category: '에셋 최적화', label: '차세대 이미지 포맷 (WebP/AVIF)', pass: false },
    { id: 'ast-lazy',  category: '에셋 최적화', label: '이미지 레이지 로드',            pass: true },
    { id: 'ast-sz',    category: '에셋 최적화', label: '이미지 적정 사이즈',            pass: false },
    { id: 'ast-total', category: '에셋 최적화', label: '총 에셋 크기 목표 이하',        pass: metricPass('assetSize') },
    { id: 'ast-js',    category: '에셋 최적화', label: 'JS 번들 < 300KB',              pass: false },
    { id: 'ast-css',   category: '에셋 최적화', label: 'CSS 번들 < 100KB',             pass: true },
    { id: 'ast-font',  category: '에셋 최적화', label: '폰트 display:swap 적용',       pass: true },

    // 캐싱 & 네트워크 (7)
    { id: 'net-cache', category: '캐싱 & 네트워크', label: '정적 에셋 장기 캐시 설정', pass: true },
    { id: 'net-cdn',   category: '캐싱 & 네트워크', label: 'CDN 적용',                 pass: true },
    { id: 'net-h2',    category: '캐싱 & 네트워크', label: 'HTTP/2 활성화',             pass: true },
    { id: 'net-dns',   category: '캐싱 & 네트워크', label: 'DNS 프리페치 설정',        pass: false },
    { id: 'net-pre',   category: '캐싱 & 네트워크', label: 'Preconnect 설정',           pass: true },
    { id: 'net-gzip',  category: '캐싱 & 네트워크', label: 'gzip/Brotli 압축',         pass: true },
    { id: 'net-sw',    category: '캐싱 & 네트워크', label: '서비스 워커 등록',          pass: false },

    // 렌더링 최적화 (7)
    { id: 'ren-cls',   category: '렌더링 최적화', label: '레이아웃 시프트 억제',       pass: metricPass('cls') },
    { id: 'ren-tbt',   category: '렌더링 최적화', label: '긴 태스크 최소화',           pass: metricPass('tbt') },
    { id: 'ren-memo',  category: '렌더링 최적화', label: 'React.memo 최적화 적용',     pass: true },
    { id: 'ren-virt',  category: '렌더링 최적화', label: '가상 스크롤 구현',           pass: false },
    { id: 'ren-split', category: '렌더링 최적화', label: '코드 스플리팅 적용',         pass: true },
    { id: 'ren-dyn',   category: '렌더링 최적화', label: '다이나믹 임포트 사용',       pass: true },
    { id: 'ren-fold',  category: '렌더링 최적화', label: 'Above-the-fold 우선 로드',   pass: true },

    // 보안 (5)
    { id: 'sec-https', category: '보안', label: 'HTTPS 적용',           pass: true },
    { id: 'sec-hsts',  category: '보안', label: 'HSTS 헤더 설정',       pass: true },
    { id: 'sec-csp',   category: '보안', label: 'CSP 헤더 구성',        pass: false },
    { id: 'sec-mix',   category: '보안', label: '혼합 콘텐츠 없음',     pass: true },
    { id: 'sec-sri',   category: '보안', label: '외부 스크립트 SRI 적용', pass: false },

    // 모니터링 (6)
    { id: 'mon-rum',  category: '모니터링', label: 'RUM 모니터링 활성',       pass: true },
    { id: 'mon-cwv',  category: '모니터링', label: 'Core Web Vitals 추적',    pass: true },
    { id: 'mon-err',  category: '모니터링', label: '에러 추적 설정',          pass: true },
    { id: 'mon-bgt',  category: '모니터링', label: '성능 예산 정의',          pass: false },
    { id: 'mon-ci',   category: '모니터링', label: 'Lighthouse CI 파이프라인', pass: false },
    { id: 'mon-dev',  category: '모니터링', label: '실 기기 테스트',          pass: true },

    // 경쟁사 대비 (7)
    { id: 'cmp-lcp',  category: '경쟁사 대비', label: 'LCP 경쟁사 평균 이하',            pass: beatComp('lcp') },
    { id: 'cmp-cls',  category: '경쟁사 대비', label: 'CLS 경쟁사 평균 이하',            pass: beatComp('cls') },
    { id: 'cmp-tbt',  category: '경쟁사 대비', label: 'TBT 경쟁사 평균 이하',            pass: beatComp('tbt') },
    { id: 'cmp-fcp',  category: '경쟁사 대비', label: 'FCP 경쟁사 평균 이하',            pass: beatComp('fcp') },
    { id: 'cmp-si',   category: '경쟁사 대비', label: 'Speed Index 경쟁사 평균 이하',    pass: beatComp('speedIndex') },
    { id: 'cmp-ast',  category: '경쟁사 대비', label: '에셋 크기 경쟁사 평균 이하',      pass: beatComp('assetSize') },
    { id: 'cmp-scr',  category: '경쟁사 대비', label: 'Lighthouse 점수 경쟁사 평균 이상',
      pass: others.length > 0
        ? (target?.scores.lighthouse ?? 0) > others.reduce((s, b) => s + b.scores.lighthouse, 0) / others.length
        : false },
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
                        <span className={styles.check_label}>{item.label}</span>
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
