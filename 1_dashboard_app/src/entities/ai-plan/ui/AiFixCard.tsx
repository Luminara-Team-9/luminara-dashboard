'use client';

import { useState } from 'react';
import type { AiFixPlan, FixEffort, FixPriority } from '@/shared/lib/types';
import styles from './AiFixCard.module.css';

const PRIORITY_LABEL: Record<FixPriority, string> = {
  critical: 'P0 Critical',
  high: 'P1 High',
  medium: 'P2 Medium',
  low: 'P3 Low',
};

const EFFORT_DOTS: Record<FixEffort, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const METRIC_LABEL: Record<string, string> = {
  lcp: 'LCP',
  cls: 'CLS',
  inp: 'INP',
  tbt: 'TBT',
  fcp: 'FCP',
  speedIndex: 'Speed Index',
  assetSize: 'Asset Size',
};

interface DecisionMeta {
  problem: string;
  area: string;
  reason: string;
  evidence: string;
  fix: string;
  codeTitle: string;
  beforeCode: string;
  afterCode: string;
  conclusion: string;
}

const DECISION_META: Record<string, DecisionMeta> = {
  lcp: {
    problem: '첫 화면의 핵심 이미지가 늦게 보임',
    area: '초기 이탈 위험',
    reason: '상품이나 배너가 보이기 전까지 기다리는 시간이 길어집니다.',
    evidence: 'LCP는 첫 화면에서 가장 큰 콘텐츠가 보이기까지 걸린 시간입니다. 대표 이미지가 늦게 내려오면 사용자는 상품을 확인하기 전에 느리다고 판단할 수 있습니다.',
    fix: '첫 화면 대표 이미지를 우선 로드하고, 이미지 포맷을 WebP/AVIF로 줄입니다.',
    codeTitle: '대표 이미지를 우선 로드하도록 변경',
    beforeCode: `<Image
  src="/hero-banner.jpg"
  alt="메인 배너"
  width={1440}
  height={640}
/>
`,
    afterCode: `<Image
  src="/hero-banner.webp"
  alt="메인 배너"
  width={1440}
  height={640}
  priority
  sizes="100vw"
/>
`,
    conclusion: '상품을 보기 전 기다리는 시간을 줄여 탐색 시작을 빠르게 만듭니다.',
  },
  fcp: {
    problem: '빈 화면이 오래 보임',
    area: '초기 이탈 위험',
    reason: '첫 글자나 이미지가 늦게 나타나면 사이트가 멈춘 것처럼 보일 수 있습니다.',
    evidence: 'FCP는 첫 콘텐츠가 화면에 나타나는 시점입니다. 폰트, CSS, 초기 스크립트가 렌더링을 막으면 사용자는 빈 화면을 오래 보게 됩니다.',
    fix: '폰트 표시 전략을 바꾸고 초기 렌더링을 막는 리소스를 줄입니다.',
    codeTitle: '폰트 로딩이 화면 표시를 막지 않도록 변경',
    beforeCode: `@font-face {
  font-family: "Decathlon";
  src: url("/fonts/decathlon.woff2") format("woff2");
}
`,
    afterCode: `@font-face {
  font-family: "Decathlon";
  src: url("/fonts/decathlon.woff2") format("woff2");
  font-display: swap;
}
`,
    conclusion: '방문자가 빈 화면 대신 콘텐츠를 더 빨리 볼 수 있습니다.',
  },
  speedIndex: {
    problem: '화면이 완성되는 속도가 느림',
    area: '체감 속도',
    reason: '페이지가 조금씩 늦게 채워져 탐색 흐름이 끊길 수 있습니다.',
    evidence: 'Speed Index는 화면이 시각적으로 얼마나 빨리 완성되는지 보는 지표입니다. 첫 화면 밖의 이미지와 무거운 리소스가 함께 로드되면 완성 속도가 떨어집니다.',
    fix: '첫 화면에 필요한 리소스만 먼저 보내고 나머지는 뒤로 미룹니다.',
    codeTitle: '첫 화면 밖 이미지를 지연 로드',
    beforeCode: `<img src="/category-running.jpg" alt="러닝 카테고리" />
<img src="/category-camping.jpg" alt="캠핑 카테고리" />
`,
    afterCode: `<img src="/category-running.jpg" alt="러닝 카테고리" loading="eager" />
<img src="/category-camping.jpg" alt="캠핑 카테고리" loading="lazy" />
`,
    conclusion: '페이지가 더 빨리 완성되어 보이도록 만드는 개선입니다.',
  },
  inp: {
    problem: '클릭 후 반응이 늦음',
    area: '구매 조작 불편',
    reason: '필터, 장바구니, 결제 버튼을 눌렀을 때 반응이 늦어질 수 있습니다.',
    evidence: 'INP는 사용자가 클릭하거나 입력한 뒤 화면이 반응하기까지의 지연입니다. 클릭 처리 중 무거운 계산이나 불필요한 렌더링이 있으면 구매 흐름이 답답해집니다.',
    fix: '무거운 클릭 처리와 불필요한 렌더링을 분리합니다.',
    codeTitle: '클릭 직후 무거운 작업 분리',
    beforeCode: `function onFilterChange(nextFilters) {
  setFilters(nextFilters);
  const result = products.filter(applyFilters);
  setVisibleProducts(result);
  sendAnalytics("filter_change", nextFilters);
}
`,
    afterCode: `function onFilterChange(nextFilters) {
  setFilters(nextFilters);
  startTransition(() => {
    setVisibleProducts(products.filter(applyFilters));
  });
  queueMicrotask(() => sendAnalytics("filter_change", nextFilters));
}
`,
    conclusion: '구매 과정에서 버튼과 필터가 더 빠르게 반응하도록 만드는 개선입니다.',
  },
  tbt: {
    problem: '페이지가 중간에 멈칫함',
    area: '반응 속도 개선 필요',
    reason: '무거운 스크립트 때문에 브라우저가 잠시 멈출 수 있습니다.',
    evidence: 'TBT는 메인 스레드가 오래 막혀 사용자의 입력을 처리하지 못하는 시간을 봅니다. 광고, 분석, 추천 스크립트를 초기에 한 번에 실행하면 멈칫함이 커집니다.',
    fix: '초기 로딩에 필요 없는 외부 스크립트를 나중에 불러옵니다.',
    codeTitle: '외부 스크립트 로드 시점 변경',
    beforeCode: `<script src="https://example-analytics.com/sdk.js"></script>
<script src="https://example-heatmap.com/sdk.js"></script>
`,
    afterCode: `<Script
  src="https://example-analytics.com/sdk.js"
  strategy="afterInteractive"
/>
<Script
  src="https://example-heatmap.com/sdk.js"
  strategy="lazyOnload"
/>
`,
    conclusion: '페이지 반응성을 높이고 불필요한 초기 실행 비용을 줄입니다.',
  },
  cls: {
    problem: '화면 요소가 흔들림',
    area: '구매 버튼 신뢰도',
    reason: '이미지나 배너가 늦게 끼어들면 버튼 위치가 바뀔 수 있습니다.',
    evidence: 'CLS는 페이지 요소가 로딩 중 얼마나 움직이는지 보는 지표입니다. 이미지와 상품 카드 영역의 크기가 미리 잡혀 있지 않으면 사용자가 다른 버튼을 누를 위험이 생깁니다.',
    fix: '이미지, 배너, 상품 카드 영역의 크기를 미리 확보합니다.',
    codeTitle: '이미지 영역 크기를 미리 고정',
    beforeCode: `<img src="/product.jpg" alt="러닝화" />
`,
    afterCode: `<img
  src="/product.jpg"
  alt="러닝화"
  width="360"
  height="360"
  style={{ aspectRatio: "1 / 1" }}
/>
`,
    conclusion: '화면 흔들림을 줄여 잘못 누르거나 흐름이 끊기는 위험을 낮춥니다.',
  },
  assetSize: {
    problem: '페이지 파일이 너무 무거움',
    area: '리소스 비용 절감',
    reason: '이미지와 JavaScript가 커서 로딩 시간과 전송 비용이 늘어납니다.',
    evidence: 'Asset Size는 사용자가 페이지를 보기 위해 내려받는 파일 크기입니다. 이미지와 JavaScript가 클수록 로딩이 느려지고 CDN/트래픽 비용도 커질 수 있습니다.',
    fix: '큰 이미지와 사용하지 않는 JavaScript를 줄입니다.',
    codeTitle: '초기 번들에서 무거운 기능 분리',
    beforeCode: `import ProductReviewChart from "@/features/review-chart";

export function ProductPage() {
  return <ProductReviewChart />;
}
`,
    afterCode: `const ProductReviewChart = dynamic(
  () => import("@/features/review-chart"),
  { ssr: false, loading: () => null },
);

export function ProductPage() {
  return <ProductReviewChart />;
}
`,
    conclusion: '속도 개선과 리소스 전송 비용 절감을 함께 기대할 수 있습니다.',
  },
};

const DEFAULT_DECISION: DecisionMeta = {
  problem: '사용자 경험을 느리게 만드는 문제',
  area: '사용자 경험',
  reason: '주요 쇼핑 흐름에서 불편을 만들 수 있습니다.',
  evidence: 'Lighthouse와 Web Vitals에서 목표 대비 미달 지표가 확인된 개선 후보입니다.',
  fix: 'Lighthouse가 지적한 병목 리소스를 먼저 줄입니다.',
  codeTitle: 'Lighthouse 지적 항목 기준 수정',
  beforeCode: `// before
`,
  afterCode: `// after
`,
  conclusion: '성능 병목을 줄여 쇼핑 흐름을 더 안정적으로 만듭니다.',
};

interface Props {
  plan: AiFixPlan;
}

export function AiFixCard({ plan }: Props) {
  const storageKey = `luminara_reviewed_${plan.id}`;
  const [detailOpen, setDetailOpen] = useState(false);
  const [reviewed, setReviewed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(storageKey) === 'true';
  });
  const dots = EFFORT_DOTS[plan.effort];
  const decision = DECISION_META[plan.metricKey] ?? DEFAULT_DECISION;

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
              className={reviewed ? styles.btn_applied : styles.btn_apply}
              disabled={reviewed}
              onClick={(event) => {
                event.stopPropagation();
                if (!reviewed) setDetailOpen(true);
              }}
            >
              {reviewed ? '적용 완료' : '자세히 보기'}
            </button>
          </div>
        </div>
      </article>

      {detailOpen && (
        <div className={styles.overlay} onClick={() => setDetailOpen(false)}>
          <div className={styles.detail_modal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.detail_head}>
              <div>
                <p className={styles.modal_label}>{PRIORITY_LABEL[plan.priority]} · {METRIC_LABEL[plan.metricKey] ?? plan.metricKey}</p>
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
                <em>{plan.estimatedImpact}</em>
              </section>
              <section className={styles.detail_section}>
                <span className={styles.section_label}>해결책</span>
                <p>{decision.fix}</p>
                <div className={styles.code_panel}>
                  <strong>{decision.codeTitle}</strong>
                  <div className={styles.code_columns}>
                    <div>
                      <span>Before</span>
                      <pre><code>{decision.beforeCode}</code></pre>
                    </div>
                    <div>
                      <span>After</span>
                      <pre><code>{decision.afterCode}</code></pre>
                    </div>
                  </div>
                </div>
              </section>
              <section className={styles.detail_section}>
                <span className={styles.section_label}>결론</span>
                <p>{decision.conclusion}</p>
              </section>
            </div>

            <div className={styles.detail_actions}>
              <button className={styles.btn_cancel} onClick={() => setDetailOpen(false)}>나중에</button>
              <button
                className={styles.btn_confirm}
                disabled={reviewed}
                onClick={() => {
                  localStorage.setItem(storageKey, 'true');
                  setReviewed(true);
                  setDetailOpen(false);
                }}
              >
                {reviewed ? '적용 완료' : '적용하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
